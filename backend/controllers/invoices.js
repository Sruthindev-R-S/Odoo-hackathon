const pool = require("../config/db_connect");
const {
	generateInvoiceForSubscription,
	generateDueInvoices,
	getInvoice,
} = require("../services/billing");
const { transitionInvoice, recordPayment, updatePayment, sendInvoice } = require("../services/invoice");

function failure(res, error, message) {
	console.error(message, error);
	return res.status(error.status || (error.code === "23505" ? 409 : 500)).json({
		error: error.status ? error.message :
			error.code === "23505" ? "A record with the same unique value already exists" : message,
	});
}

async function list(req, res) {
	try {
		const values = [];
		const where = [];
		const add = (clause, input) => {
			values.push(input);
			where.push(clause.replace("?", `$${values.length}`));
		};
		if (req.query.status) add("i.status = ?", req.query.status);
		if (req.query.customerId) add("i.customer_id = ?", req.query.customerId);
		if (req.query.subscriptionId) add("i.subscription_id = ?", req.query.subscriptionId);
		if (req.query.invoiceDateFrom) add("i.invoice_date >= ?", req.query.invoiceDateFrom);
		if (req.query.invoiceDateTo) add("i.invoice_date <= ?", req.query.invoiceDateTo);
		if (req.query.dueDateFrom) add("i.due_date >= ?", req.query.dueDateFrom);
		if (req.query.dueDateTo) add("i.due_date <= ?", req.query.dueDateTo);
		if (req.query.overdue === "true") {
			where.push(`i.due_date < CURRENT_DATE AND i.outstanding_amount > 0
				AND i.status NOT IN ('paid', 'cancelled')`);
		}
		if (req.query.search) {
			add("(i.invoice_number ILIKE ? OR u.name ILIKE ?)", `%${req.query.search}%`);
			values.push(values[values.length - 1]);
			where[where.length - 1] = `(i.invoice_number ILIKE $${values.length - 1}
				OR u.name ILIKE $${values.length})`;
		}
		const allowedSort = new Set(["invoice_date", "due_date", "created_at", "total_amount"]);
		const sort = allowedSort.has(req.query.sort) ? req.query.sort : "created_at";
		const direction = String(req.query.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
		const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
		const offset = Math.max(Number(req.query.page || 1) - 1, 0) * limit;
		values.push(limit, offset);
		const { rows } = await pool.query(
			`SELECT i.*, u.name AS customer_name, u.email AS customer_email
			 FROM invoices i JOIN users u ON u.id=i.customer_id
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY i.${sort} ${direction} LIMIT $${values.length - 1} OFFSET $${values.length}`,
			values
		);
		return res.json({ page: Math.floor(offset / limit) + 1, limit, invoices: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve invoices");
	}
}

async function getOne(req, res) {
	try {
		const invoice = await getInvoice(req.params.invoiceId);
		return invoice ? res.json({ invoice }) : res.status(404).json({ error: "Invoice not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve invoice");
	}
}

async function items(req, res) {
	try {
		const { rows } = await pool.query(
			"SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY created_at",
			[req.params.invoiceId]
		);
		return res.json({ items: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve invoice items");
	}
}

async function generate(req, res) {
	try {
		const result = req.body.subscriptionId
			? [{ subscriptionId: req.body.subscriptionId,
				invoiceId: await generateInvoiceForSubscription(req.body.subscriptionId, req.body) }]
			: await generateDueInvoices(req.body);
		return res.status(201).json({ results: result });
	} catch (error) {
		return failure(res, error, "Failed to generate invoice");
	}
}

async function confirm(req, res) {
	try {
		return res.json({ invoice: await transitionInvoice(req.params.invoiceId, "confirmed") });
	} catch (error) {
		return failure(res, error, "Failed to confirm invoice");
	}
}

async function cancel(req, res) {
	try {
		return res.json({ invoice: await transitionInvoice(req.params.invoiceId, "cancelled") });
	} catch (error) {
		return failure(res, error, "Failed to cancel invoice");
	}
}

async function send(req, res) {
	try {
		return res.json({ invoice: await sendInvoice(req.params.invoiceId) });
	} catch (error) {
		return failure(res, error, "Failed to send invoice");
	}
}

async function print(req, res) {
	try {
		const invoice = await getInvoice(req.params.invoiceId);
		if (!invoice) return res.status(404).json({ error: "Invoice not found" });
		const rows = invoice.items.map((item) =>
			`<tr><td>${escapeHtml(item.product_description)}</td><td>${item.quantity}</td>` +
			`<td>${item.unit_price}</td><td>${item.tax_amount}</td><td>${item.line_total}</td></tr>`
		).join("");
		return res.type("html").send(`<!doctype html><html><head><title>${invoice.invoice_number}</title>
			<style>body{font-family:Arial;max-width:900px;margin:40px auto}table{width:100%;border-collapse:collapse}
			th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}</style></head><body>
			<h1>Invoice ${escapeHtml(invoice.invoice_number)}</h1>
			<p>Customer: ${escapeHtml(invoice.customer_name || "")}</p>
			<p>Invoice date: ${invoice.invoice_date} | Due: ${invoice.due_date}</p>
			<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Tax</th><th>Total</th>
			</tr></thead><tbody>${rows}</tbody></table>
			<h3>Subtotal: ${invoice.subtotal}</h3><h3>Tax: ${invoice.tax_amount}</h3>
			<h2>Total: ${invoice.total_amount}</h2></body></html>`);
	} catch (error) {
		return failure(res, error, "Failed to print invoice");
	}
}

async function addPayment(req, res) {
	try {
		if (!req.body.paymentMethod) return res.status(400).json({ error: "paymentMethod is required" });
		const payment = await recordPayment(req.params.invoiceId, req.body);
		return res.status(201).json({ payment, invoice: await getInvoice(req.params.invoiceId) });
	} catch (error) {
		return failure(res, error, "Failed to record payment");
	}
}

async function payments(req, res) {
	try {
		const { rows } = await pool.query(
			"SELECT * FROM invoice_payments WHERE invoice_id=$1 ORDER BY payment_date, created_at",
			[req.params.invoiceId]
		);
		return res.json({ payments: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve payments");
	}
}

async function payment(req, res) {
	try {
		const { rows } = await pool.query(
			"SELECT p.*, i.invoice_number FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.id=$1",
			[req.params.paymentId]
		);
		return rows[0] ? res.json({ payment: rows[0] }) : res.status(404).json({ error: "Payment not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve payment");
	}
}

async function updatePaymentDetails(req, res) {
	try {
		return res.json({ payment: await updatePayment(req.params.paymentId, req.body) });
	} catch (error) {
		return failure(res, error, "Failed to update payment");
	}
}

async function allPayments(req, res) {
	try {
		const values = [];
		const where = [];
		if (req.query.invoiceId) { values.push(req.query.invoiceId); where.push(`p.invoice_id=$${values.length}`); }
		if (req.query.customerId) { values.push(req.query.customerId); where.push(`i.customer_id=$${values.length}`); }
		if (req.query.paymentMethod) { values.push(req.query.paymentMethod); where.push(`p.payment_method=$${values.length}`); }
		if (req.query.dateFrom) { values.push(req.query.dateFrom); where.push(`p.payment_date >= $${values.length}`); }
		if (req.query.dateTo) { values.push(req.query.dateTo); where.push(`p.payment_date <= $${values.length}`); }
		if (req.query.search) { values.push(`%${req.query.search}%`); where.push(`(i.invoice_number ILIKE $${values.length} OR p.transaction_reference ILIKE $${values.length})`); }
		const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
		values.push(limit, Math.max(Number(req.query.page || 1) - 1, 0) * limit);
		const { rows } = await pool.query(
			`SELECT p.*, i.invoice_number FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY p.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
		);
		return res.json({ payments: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve payments");
	}
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
	}[character]));
}

async function listTaxes(req, res) {
	try {
		const { rows } = await pool.query("SELECT * FROM tax_rules ORDER BY created_at DESC");
		return res.json({ taxes: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve tax rules");
	}
}

async function createTax(req, res) {
	const { name, percentage, productId = null } = req.body;
	if (!String(name || "").trim() || !Number.isFinite(Number(percentage)) ||
		Number(percentage) < 0 || Number(percentage) > 100) {
		return res.status(400).json({ error: "name and percentage between 0 and 100 are required" });
	}
	try {
		const { rows } = await pool.query(
			`INSERT INTO tax_rules(name, percentage, product_id) VALUES($1,$2,$3) RETURNING *`,
			[String(name).trim(), percentage, productId]
		);
		return res.status(201).json({ tax: rows[0] });
	} catch (error) {
		return failure(res, error, "Failed to create tax rule");
	}
}

async function updateTax(req, res) {
	const fields = { name: req.body.name, percentage: req.body.percentage, active: req.body.active };
	const entries = Object.entries(fields).filter(([, item]) => item !== undefined);
	if (!entries.length) return res.status(400).json({ error: "No editable fields supplied" });
	const values = entries.map(([, item]) => item);
	values.push(req.params.taxId);
	try {
		const { rows } = await pool.query(
			`UPDATE tax_rules SET ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
			 updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length} RETURNING *`, values
		);
		return rows[0] ? res.json({ tax: rows[0] }) : res.status(404).json({ error: "Tax rule not found" });
	} catch (error) {
		return failure(res, error, "Failed to update tax rule");
	}
}

module.exports = {
	list, getOne, items, generate, confirm, cancel, send, print,
	addPayment, payments, payment, updatePaymentDetails, allPayments, listTaxes, createTax, updateTax,
};
