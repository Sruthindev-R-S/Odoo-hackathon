const pool = require("../config/db_connect");
const { findEligibleDiscount, incrementUsage } = require("./discount");

function dateOnly(value) {
	const date = value ? new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`) : new Date();
	date.setUTCHours(0, 0, 0, 0);
	return date;
}

function dateString(date) {
	return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
	const result = dateOnly(date);
	result.setUTCDate(result.getUTCDate() + days);
	return result;
}

function addBillingPeriod(start, frequency) {
	const result = dateOnly(start);
	if (frequency === "daily") result.setUTCDate(result.getUTCDate() + 1);
	else if (frequency === "weekly") result.setUTCDate(result.getUTCDate() + 7);
	else if (frequency === "monthly") {
		const day = result.getUTCDate();
		result.setUTCDate(1);
		result.setUTCMonth(result.getUTCMonth() + 1);
		const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
		result.setUTCDate(Math.min(day, lastDay));
	} else if (frequency === "yearly") {
		const month = result.getUTCMonth();
		const day = result.getUTCDate();
		result.setUTCDate(1);
		result.setUTCFullYear(result.getUTCFullYear() + 1);
		result.setUTCMonth(month);
		const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
		result.setUTCDate(Math.min(day, lastDay));
	} else {
		throw new Error(`Unsupported billing frequency: ${frequency}`);
	}
	return result;
}

function decimalToInteger(value, scale) {
	const text = String(value ?? "0").trim();
	const [whole, fraction = ""] = text.split(".");
	const sign = whole.startsWith("-") ? -1 : 1;
	const normalizedWhole = whole.replace("-", "") || "0";
	const digits = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
	return BigInt(sign) * (BigInt(normalizedWhole) * (10n ** BigInt(scale)) + BigInt(digits || "0"));
}

function cents(value) {
	return decimalToInteger(value, 2);
}

function formatCents(value) {
	const negative = value < 0n;
	const absolute = negative ? -value : value;
	const text = absolute.toString().padStart(3, "0");
	return `${negative ? "-" : ""}${text.slice(0, -2)}.${text.slice(-2)}`;
}

function calculateInvoiceLines(items, taxRulesByProduct) {
	let subtotal = 0n;
	let taxTotal = 0n;
	const lines = items.map((item) => {
		const quantityThousandths = decimalToInteger(item.quantity, 3);
		const unitPriceCents = cents(item.unit_price);
		const lineSubtotal = (quantityThousandths * unitPriceCents + 500n) / 1000n;
		const rules = taxRulesByProduct.get(item.product_id) || [];
		const snapshots = rules.length ? rules : (Array.isArray(item.taxes) ? item.taxes : []);
		const normalizedTaxes = snapshots.map((tax) => ({
			name: tax.name || "Tax",
			rate: String(tax.percentage ?? tax.rate ?? 0),
		}));
		const taxRateBasisPoints = normalizedTaxes.reduce(
			(sum, tax) => sum + decimalToInteger(tax.rate, 2), 0n
		);
		const taxAmount = (lineSubtotal * taxRateBasisPoints + 5000n) / 10000n;
		subtotal += lineSubtotal;
		taxTotal += taxAmount;
		return {
			...item,
			product_description: item.variant_name ? `${item.product_name} - ${item.variant_name}` : item.product_name,
			unit_price: formatCents(unitPriceCents),
			tax_rate: Number(taxRateBasisPoints) / 100,
			tax_amount: formatCents(taxAmount),
			line_subtotal: formatCents(lineSubtotal),
			line_total: formatCents(lineSubtotal + taxAmount),
			tax_snapshot: normalizedTaxes,
		};
	});
	return {
		lines,
		subtotal: formatCents(subtotal),
		taxAmount: formatCents(taxTotal),
		total: formatCents(subtotal + taxTotal),
	};
}

async function getDueSubscriptions(client, today = dateString(new Date())) {
	const { rows } = await client.query(
		`SELECT s.*, u.name AS customer_name, u.email AS customer_email, sp.name AS plan_name
		 FROM subscriptions s
		 JOIN users u ON u.id = s.customer_id
		 JOIN subscription_plans sp ON sp.id = s.plan_id
		 WHERE s.status = 'active'
		   AND s.next_billing_date IS NOT NULL
		   AND s.next_billing_date <= $1
		   AND (s.expiry_date IS NULL OR s.next_billing_date <= s.expiry_date)
		 ORDER BY s.next_billing_date, s.created_at`, [today]
	);
	return rows;
}

async function generateInvoiceForSubscription(subscriptionId, options = {}) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const subscription = (await client.query(
			`SELECT s.*, u.name AS customer_name, u.email AS customer_email, sp.name AS plan_name
			 FROM subscriptions s
			 JOIN users u ON u.id = s.customer_id
			 JOIN subscription_plans sp ON sp.id = s.plan_id
			 WHERE s.id = $1 FOR UPDATE`, [subscriptionId]
		)).rows[0];
		if (!subscription) throw Object.assign(new Error("Subscription not found"), { status: 404 });
		const today = dateOnly(options.today || new Date());
		if (subscription.status !== "active") {
			throw Object.assign(new Error("Subscription is not eligible for billing"), { status: 409 });
		}
		const start = dateOnly(subscription.next_billing_date || subscription.start_date || today);
		if (start > today && !options.allowFuture) {
			throw Object.assign(new Error("Subscription is not due for billing"), { status: 409 });
		}
		if (subscription.expiry_date && start > dateOnly(subscription.expiry_date)) {
			throw Object.assign(new Error("Subscription has expired"), { status: 409 });
		}
		const endExclusive = addBillingPeriod(start, subscription.agreed_billing_frequency);
		const end = addDays(endExclusive, -1);
		const existing = (await client.query(
			`SELECT id FROM invoices
			 WHERE subscription_id=$1 AND billing_period_start=$2 AND billing_period_end=$3`,
			[subscription.id, dateString(start), dateString(end)]
		)).rows[0];
		if (existing) {
			await client.query("UPDATE subscriptions SET next_billing_date=$1 WHERE id=$2", [
				dateString(endExclusive), subscription.id,
			]);
			await client.query("COMMIT");
			return existing.id;
		}

		const items = (await client.query(
			`SELECT si.*, p.name AS current_product_name
			 FROM subscription_items si JOIN products p ON p.id=si.product_id
			 WHERE si.subscription_id=$1 ORDER BY si.created_at`, [subscription.id]
		)).rows;
		const productIds = items.map((item) => item.product_id);
		const taxResult = productIds.length ? await client.query(
			`SELECT id, name, percentage, product_id
			 FROM tax_rules WHERE active=TRUE AND (product_id = ANY($1::uuid[]) OR product_id IS NULL)
			 ORDER BY product_id NULLS LAST, created_at`, [productIds]
		) : { rows: [] };
		const taxRules = new Map();
		const globalRules = taxResult.rows.filter((rule) => !rule.product_id);
		for (const rule of taxResult.rows) {
			if (rule.product_id) taxRules.set(rule.product_id, [...(taxRules.get(rule.product_id) || []), rule]);
		}
		for (const item of items) {
			if (!taxRules.has(item.product_id) && globalRules.length) {
				taxRules.set(item.product_id, globalRules);
			}
		}
		const calculations = calculateInvoiceLines(items, taxRules);
		const quantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
		const discountResult = await findEligibleDiscount(
			client, calculations.subtotal, quantity, productIds, dateString(today), calculations.lines
		);
		const discountAmount = discountResult ? discountResult.amount : "0.00";
		const totalCents = cents(calculations.total) - cents(discountAmount);
		const total = formatCents(totalCents < 0n ? 0n : totalCents);
		const dueDate = options.dueDate || dateString(addDays(today, Number(options.paymentTermDays || 30)));
		const invoice = (await client.query(
			`INSERT INTO invoices
			 (subscription_id, customer_id, billing_period_start, billing_period_end,
			  invoice_date, due_date, subtotal, tax_amount, discount_amount, total_amount,
			  outstanding_amount, discount_snapshot)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			 ON CONFLICT (subscription_id, billing_period_start, billing_period_end)
			 DO NOTHING RETURNING id`,
			[subscription.id, subscription.customer_id, dateString(start), dateString(end),
				dateString(today), dueDate, calculations.subtotal, calculations.taxAmount, discountAmount,
				total, total, JSON.stringify(discountResult ? [discountResult.snapshot] : [])]
		)).rows[0];
		if (!invoice) {
			const concurrent = (await client.query(
				"SELECT id FROM invoices WHERE subscription_id=$1 AND billing_period_start=$2 AND billing_period_end=$3",
				[subscription.id, dateString(start), dateString(end)]
			)).rows[0];
			await client.query("UPDATE subscriptions SET next_billing_date=$1 WHERE id=$2", [dateString(endExclusive), subscription.id]);
			await client.query("COMMIT");
			return concurrent.id;
		}
		for (const line of calculations.lines) {
			await client.query(
				`INSERT INTO invoice_items
				 (invoice_id, product_id, variant_id, product_description, quantity, unit_price,
				  tax_rate, tax_amount, line_subtotal, line_total, tax_snapshot)
				 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
				[invoice.id, line.product_id, line.variant_id, line.product_description, line.quantity,
					line.unit_price, line.tax_rate, line.tax_amount, line.line_subtotal, line.line_total,
					JSON.stringify(line.tax_snapshot)]
			);
		}
		if (discountResult) await incrementUsage(client, discountResult.discount.id);
		await client.query(
			`UPDATE subscriptions
			 SET next_billing_date=$1, last_billed_period_start=$2, last_billed_period_end=$3,
			     updated_at=CURRENT_TIMESTAMP
			 WHERE id=$4`,
			[dateString(endExclusive), dateString(start), dateString(end), subscription.id]
		);
		await client.query("COMMIT");
		return invoice.id;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function generateDueInvoices(options = {}) {
	const subscriptions = await getDueSubscriptions(pool, options.today);
	const results = [];
	for (const subscription of subscriptions) {
		try {
			const invoiceId = await generateInvoiceForSubscription(subscription.id, options);
			results.push({ subscriptionId: subscription.id, invoiceId, success: true });
			console.log(`Generated invoice ${invoiceId} for subscription ${subscription.id}`);
		} catch (error) {
			results.push({ subscriptionId: subscription.id, success: false, error: error.message });
			console.error(`Failed to generate invoice for subscription ${subscription.id}:`, error);
		}
	}
	return results;
}

async function getInvoice(invoiceId, client = pool) {
	const invoice = (await client.query(
		`SELECT i.*, u.name AS customer_name, u.email AS customer_email,
		        s.subscription_number, sp.name AS plan_name
		 FROM invoices i
		 JOIN users u ON u.id=i.customer_id
		 JOIN subscriptions s ON s.id=i.subscription_id
		 JOIN subscription_plans sp ON sp.id=s.plan_id
		 WHERE i.id=$1`, [invoiceId]
	)).rows[0];
	if (!invoice) return null;
	invoice.items = (await client.query(
		"SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY created_at", [invoiceId]
	)).rows;
	invoice.payments = (await client.query(
		"SELECT * FROM invoice_payments WHERE invoice_id=$1 ORDER BY payment_date, created_at", [invoiceId]
	)).rows;
	return invoice;
}

module.exports = {
	dateString,
	addBillingPeriod,
	calculateInvoiceLines,
	getDueSubscriptions,
	generateInvoiceForSubscription,
	generateDueInvoices,
	getInvoice,
	cents,
	formatCents,
};
