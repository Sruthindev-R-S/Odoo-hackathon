const pool = require("../config/db_connect");

function dateFilters(query, alias = "i") {
	const values = [];
	const where = [];
	const add = (sql, value) => {
		values.push(value);
		where.push(sql.replace("?", `$${values.length}`));
	};
	if (query.start_date) add(`${alias}.invoice_date >= ?`, query.start_date);
	if (query.end_date) add(`${alias}.invoice_date <= ?`, query.end_date);
	if (query.customer_id) add(`${alias}.customer_id = ?`, query.customer_id);
	if (query.plan_id) add(`s.plan_id = ?`, query.plan_id);
	if (query.invoice_status) add(`${alias}.status = ?`, query.invoice_status);
	return { values, where };
}

async function dashboard(query = {}) {
	const { values, where } = dateFilters(query);
	const invoiceWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";
	const activeValues = [];
	const activeWhere = ["s.status = 'active'"];
	if (query.customer_id) { activeValues.push(query.customer_id); activeWhere.push(`s.customer_id=$${activeValues.length}`); }
	if (query.plan_id) { activeValues.push(query.plan_id); activeWhere.push(`s.plan_id=$${activeValues.length}`); }
	const paymentWhere = ["p.payment_status <> 'reversed'", "i.status <> 'cancelled'"];
	const paymentValues = [];
	if (query.start_date) { paymentValues.push(query.start_date); paymentWhere.push(`p.payment_date >= $${paymentValues.length}`); }
	if (query.end_date) { paymentValues.push(query.end_date); paymentWhere.push(`p.payment_date <= $${paymentValues.length}`); }
	if (query.customer_id) { paymentValues.push(query.customer_id); paymentWhere.push(`i.customer_id = $${paymentValues.length}`); }
	if (query.plan_id) { paymentValues.push(query.plan_id); paymentWhere.push(`s.plan_id = $${paymentValues.length}`); }
	const [active, payments, outstanding, overdue] = await Promise.all([
		pool.query(`SELECT count(*)::int AS count FROM subscriptions s WHERE ${activeWhere.join(" AND ")}`, activeValues),
		pool.query(`SELECT count(*)::int AS count, COALESCE(sum(p.amount),0) AS amount
			FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
			JOIN subscriptions s ON s.id=i.subscription_id
			WHERE ${paymentWhere.join(" AND ")}`, paymentValues),
		pool.query(`SELECT count(*)::int AS count, COALESCE(sum(i.outstanding_amount),0) AS amount
			FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id
			${invoiceWhere ? `${invoiceWhere} AND` : "WHERE"}
			i.status NOT IN ('cancelled','paid') AND i.outstanding_amount > 0`, values),
		pool.query(`SELECT count(*)::int AS count, COALESCE(sum(i.outstanding_amount),0) AS amount
			FROM invoices i JOIN subscriptions s ON s.id=i.subscription_id
			${invoiceWhere ? `${invoiceWhere} AND` : "WHERE"}
			i.status NOT IN ('cancelled','paid') AND i.outstanding_amount > 0 AND i.due_date < CURRENT_DATE`, values),
	]);
	return {
		summary: {
			active_subscriptions: active.rows[0].count,
			revenue_collected: payments.rows[0].amount,
			total_payments: payments.rows[0].count,
			outstanding_amount: outstanding.rows[0].amount,
			outstanding_invoice_count: outstanding.rows[0].count,
			overdue_amount: overdue.rows[0].amount,
			overdue_invoice_count: overdue.rows[0].count,
		},
		filters: query,
	};
}

async function activeSubscriptions(query = {}) {
	const values = [];
	const where = ["s.status='active'"];
	if (query.customer_id) { values.push(query.customer_id); where.push(`s.customer_id=$${values.length}`); }
	if (query.plan_id) { values.push(query.plan_id); where.push(`s.plan_id=$${values.length}`); }
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	values.push(limit, Math.max(Number(query.page || 1) - 1, 0) * limit);
	const { rows } = await pool.query(
		`SELECT s.id, s.subscription_number, s.customer_id, u.name AS customer_name,
		        s.plan_id, sp.name AS plan_name, s.start_date, s.expiry_date
		 FROM subscriptions s JOIN users u ON u.id=s.customer_id
		 JOIN subscription_plans sp ON sp.id=s.plan_id
		 WHERE ${where.join(" AND ")} ORDER BY s.start_date DESC
		 LIMIT $${values.length - 1} OFFSET $${values.length}`, values
	);
	return { subscriptions: rows, page: query.page || 1, limit };
}

async function revenue(query = {}) {
	const paymentWhere = ["p.payment_status <> 'reversed'", "i.status <> 'cancelled'"];
	const values = [];
	if (query.start_date) { values.push(query.start_date); paymentWhere.push(`p.payment_date >= $${values.length}`); }
	if (query.end_date) { values.push(query.end_date); paymentWhere.push(`p.payment_date <= $${values.length}`); }
	if (query.customer_id) { values.push(query.customer_id); paymentWhere.push(`i.customer_id = $${values.length}`); }
	if (query.plan_id) { values.push(query.plan_id); paymentWhere.push(`s.plan_id = $${values.length}`); }
	const { rows } = await pool.query(
		`SELECT COALESCE(sum(p.amount),0) AS amount, count(*)::int AS payment_count
		 FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
		 JOIN subscriptions s ON s.id=i.subscription_id
		 WHERE ${paymentWhere.join(" AND ")}`, values
	);
	return rows[0];
}

async function payments(query = {}) {
	const values = [];
	const where = ["p.payment_status <> 'reversed'", "i.status <> 'cancelled'"];
	if (query.start_date) { values.push(query.start_date); where.push(`p.payment_date >= $${values.length}`); }
	if (query.end_date) { values.push(query.end_date); where.push(`p.payment_date <= $${values.length}`); }
	if (query.customer_id) { values.push(query.customer_id); where.push(`i.customer_id = $${values.length}`); }
	if (query.payment_method) { values.push(query.payment_method); where.push(`p.payment_method = $${values.length}`); }
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	values.push(limit, Math.max(Number(query.page || 1) - 1, 0) * limit);
	const { rows } = await pool.query(
		`SELECT p.*, i.invoice_number, u.name AS customer_name
		 FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id JOIN users u ON u.id=i.customer_id
		 WHERE ${where.join(" AND ")} ORDER BY p.payment_date DESC, p.created_at DESC
		 LIMIT $${values.length - 1} OFFSET $${values.length}`, values
	);
	return { payments: rows, page: query.page || 1, limit };
}

async function outstanding(query = {}, overdue = false) {
	const values = [];
	const where = ["i.status NOT IN ('cancelled','paid')", "i.outstanding_amount > 0"];
	if (query.customer_id) { values.push(query.customer_id); where.push(`i.customer_id=$${values.length}`); }
	if (query.plan_id) { values.push(query.plan_id); where.push(`s.plan_id=$${values.length}`); }
	if (overdue) where.push("i.due_date < CURRENT_DATE");
	const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);
	values.push(limit, Math.max(Number(query.page || 1) - 1, 0) * limit);
	const { rows } = await pool.query(
		`SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.total_amount,
		        i.paid_amount, i.outstanding_amount, u.name AS customer_name,
		        (CURRENT_DATE - i.due_date)::int AS days_overdue
		 FROM invoices i JOIN users u ON u.id=i.customer_id
		 JOIN subscriptions s ON s.id=i.subscription_id
		 WHERE ${where.join(" AND ")} ORDER BY i.due_date
		 LIMIT $${values.length - 1} OFFSET $${values.length}`, values
	);
	return { invoices: rows, page: query.page || 1, limit };
}

module.exports = { dashboard, activeSubscriptions, revenue, payments, outstanding };
