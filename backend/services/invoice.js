const pool = require("../config/db_connect");
const transporter = require("../config/mailer");
const { getInvoice, cents, formatCents } = require("./billing");

async function transitionInvoice(invoiceId, target) {
	const allowed = { confirmed: ["draft"], cancelled: ["draft", "confirmed"], paid: ["confirmed"] };
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const invoice = (await client.query(
			"SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [invoiceId]
		)).rows[0];
		if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });
		if (!allowed[target].includes(invoice.status)) {
			throw Object.assign(new Error(`Invalid invoice status transition from ${invoice.status} to ${target}`), { status: 409 });
		}
		const row = (await client.query(
			"UPDATE invoices SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *",
			[target, invoiceId]
		)).rows[0];
		await client.query("COMMIT");
		return row;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function recordPayment(invoiceId, input) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const invoice = (await client.query(
			"SELECT * FROM invoices WHERE id=$1 FOR UPDATE", [invoiceId]
		)).rows[0];
		if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });
		if (!["confirmed", "partially_paid"].includes(invoice.status)) {
			throw Object.assign(new Error("Payments can only be recorded on confirmed or partially paid invoices"), { status: 409 });
		}
		const amount = cents(input.amount);
		const outstanding = cents(invoice.outstanding_amount);
		if (amount <= 0n || amount > outstanding) {
			throw Object.assign(new Error("Payment amount must be positive and not exceed the outstanding balance"), { status: 400 });
		}
		const payment = (await client.query(
			`INSERT INTO invoice_payments
			 (invoice_id, payment_method, amount, payment_date, transaction_reference, notes)
			 VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
			[invoiceId, input.paymentMethod, formatCents(amount), input.paymentDate || null,
				input.transactionReference || null, input.notes || null]
		)).rows[0];
		const newPaid = formatCents(cents(invoice.paid_amount) + amount);
		const newOutstanding = formatCents(outstanding - amount);
		const nextStatus = newOutstanding === "0.00" ? "paid" : "partially_paid";
		await client.query(
			`UPDATE invoices SET paid_amount=$1, outstanding_amount=$2,
			 status=CASE WHEN $3 = 'paid' THEN 'paid' ELSE $3 END,
			 updated_at=CURRENT_TIMESTAMP WHERE id=$4`,
			[newPaid, newOutstanding, nextStatus, invoiceId]
		);
		await client.query("COMMIT");
		return payment;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function updatePayment(paymentId, input) {
	const allowed = {
		payment_method: input.paymentMethod,
		transaction_reference: input.transactionReference,
		notes: input.notes,
	};
	const entries = Object.entries(allowed).filter(([, item]) => item !== undefined);
	if (!entries.length) throw Object.assign(new Error("No editable payment fields supplied"), { status: 400 });
	const values = entries.map(([, item]) => item);
	values.push(paymentId);
	const { rows } = await pool.query(
		`UPDATE invoice_payments SET
		 ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
		 updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length}
		 AND payment_status <> 'reversed' RETURNING *`, values
	);
	if (!rows[0]) throw Object.assign(new Error("Payment not found or is not editable"), { status: 404 });
	return rows[0];
}

async function sendInvoice(invoiceId) {
	const invoice = await getInvoice(invoiceId);
	if (!invoice) throw Object.assign(new Error("Invoice not found"), { status: 404 });
	if (!["confirmed", "partially_paid", "paid"].includes(invoice.status)) {
		throw Object.assign(new Error("Only confirmed, partially paid or paid invoices can be sent"), { status: 409 });
	}
	if (!invoice.customer_email) throw Object.assign(new Error("Customer has no email address"), { status: 400 });
	const lines = invoice.items.map((item) =>
		`${item.product_description}: ${item.quantity} x ${item.unit_price} = ${item.line_total}`
	).join("\n");
	await transporter.sendMail({
		from: process.env.SMTP_FROM || process.env.SMTP_USER,
		to: invoice.customer_email,
		subject: `Invoice ${invoice.invoice_number}`,
		text: [
			`Invoice: ${invoice.invoice_number}`,
			`Invoice date: ${invoice.invoice_date}`,
			`Due date: ${invoice.due_date}`,
			"",
			lines,
			"",
			`Subtotal: ${invoice.subtotal}`,
			`Tax: ${invoice.tax_amount}`,
			`Total: ${invoice.total_amount}`,
			`Outstanding: ${invoice.outstanding_amount}`,
		].join("\n"),
	});
	return invoice;
}

module.exports = { transitionInvoice, recordPayment, updatePayment, sendInvoice };
