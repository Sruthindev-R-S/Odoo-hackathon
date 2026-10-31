const pool = require("../config/db_connect");

const billingFrequencies = ["daily", "weekly", "monthly", "yearly"];
const autoClosePolicies = ["none", "end_of_term", "immediate"];

async function createPlanTables() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS subscription_plans (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(150) NOT NULL UNIQUE,
			price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
			billing_frequency VARCHAR(20) NOT NULL
				CHECK (billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
			minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
			available_from DATE,
			available_until DATE,
			auto_close VARCHAR(20) NOT NULL DEFAULT 'none'
				CHECK (auto_close IN ('none', 'end_of_term', 'immediate')),
			allow_early_close BOOLEAN NOT NULL DEFAULT FALSE,
			allow_pause BOOLEAN NOT NULL DEFAULT FALSE,
			allow_renew BOOLEAN NOT NULL DEFAULT TRUE,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CHECK (available_until IS NULL OR available_from IS NULL OR available_until >= available_from)
		);
	`);

	await pool.query(`
		CREATE INDEX IF NOT EXISTS subscription_plans_active_frequency_idx
		ON subscription_plans (active, billing_frequency);
	`);
	await pool.query(`
		CREATE INDEX IF NOT EXISTS subscription_plans_name_idx
		ON subscription_plans (name);
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS subscriptions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			plan_id UUID NOT NULL REFERENCES subscription_plans(id),
			quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
			agreed_price NUMERIC(12, 2) NOT NULL CHECK (agreed_price >= 0),
			agreed_billing_frequency VARCHAR(20) NOT NULL
				CHECK (agreed_billing_frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
			status VARCHAR(20) NOT NULL DEFAULT 'active',
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await pool.query(`
		CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx
		ON subscriptions (plan_id);
	`);
}

function normalizePlanInput(input, partial = false) {
	const plan = {};
	const fields = [
		"name",
		"price",
		"billing_frequency",
		"minimum_quantity",
		"available_from",
		"available_until",
		"auto_close",
		"allow_early_close",
		"allow_pause",
		"allow_renew",
	];

	for (const field of fields) {
		if (!partial || input[field] !== undefined) plan[field] = input[field];
	}
	return plan;
}

async function createPlan(plan) {
	const fields = Object.keys(plan);
	const values = Object.values(plan);
	const placeholders = fields.map((_, index) => `$${index + 1}`);
	const { rows } = await pool.query(
		`INSERT INTO subscription_plans (${fields.join(", ")})
		 VALUES (${placeholders.join(", ")})
		 RETURNING *`,
		values
	);
	return rows[0];
}

async function getPlans({ billingFrequency, active, search, limit, offset }) {
	const conditions = [];
	const values = [];
	const add = (condition, value) => {
		values.push(value);
		conditions.push(condition.replace("?", `$${values.length}`));
	};

	if (billingFrequency) add("billing_frequency = ?", billingFrequency);
	if (active !== undefined) add("active = ?", active);
	if (search) add("name ILIKE ?", `%${search}%`);

	values.push(limit, offset);
	const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
	const { rows } = await pool.query(
		`SELECT * FROM subscription_plans ${where}
		 ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
		values
	);
	return rows;
}

async function getPlanById(id) {
	const { rows } = await pool.query(
		"SELECT * FROM subscription_plans WHERE id = $1",
		[id]
	);
	return rows[0] || null;
}

async function updatePlan(id, plan) {
	const entries = Object.entries(plan);
	const assignments = entries.map(([field], index) => `${field} = $${index + 1}`);
	if (!assignments.length) return getPlanById(id);
	const values = entries.map(([, value]) => value);
	values.push(id);
	const { rows } = await pool.query(
		`UPDATE subscription_plans
		 SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $${values.length}
		 RETURNING *`,
		values
	);
	return rows[0] || null;
}

async function archivePlan(id) {
	const { rows } = await pool.query(
		`UPDATE subscription_plans
		 SET active = FALSE, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $1
		 RETURNING *`,
		[id]
	);
	return rows[0] || null;
}

async function updatePlanStatus(id, active) {
	const { rows } = await pool.query(
		`UPDATE subscription_plans
		 SET active = $1, updated_at = CURRENT_TIMESTAMP
		 WHERE id = $2
		 RETURNING *`,
		[active, id]
	);
	return rows[0] || null;
}

module.exports = {
	billingFrequencies,
	autoClosePolicies,
	createPlanTables,
	normalizePlanInput,
	createPlan,
	getPlans,
	getPlanById,
	updatePlan,
	archivePlan,
	updatePlanStatus,
};