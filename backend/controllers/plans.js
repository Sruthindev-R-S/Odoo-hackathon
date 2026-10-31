const {
	billingFrequencies,
	autoClosePolicies,
	normalizePlanInput,
	createPlan,
	getPlans,
	getPlanById,
	updatePlan,
	archivePlan,
	updatePlanStatus,
} = require("../models/plans");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const apiToDb = {
	billingFrequency: "billing_frequency",
	minimumQuantity: "minimum_quantity",
	availableFrom: "available_from",
	availableUntil: "available_until",
	autoClose: "auto_close",
	allowEarlyClose: "allow_early_close",
	allowPause: "allow_pause",
	allowRenew: "allow_renew",
};

function mapPlanBody(body) {
	const mapped = {};
	for (const [key, value] of Object.entries(body || {})) {
		mapped[apiToDb[key] || key] = value;
	}
	return mapped;
}

function validatePlan(plan, partial = false) {
	const required = ["name", "price", "billing_frequency", "minimum_quantity"];
	if (!partial && required.some((field) => plan[field] === undefined)) {
		return "Name, price, billing frequency, and minimum quantity are required";
	}
	if (plan.name !== undefined && (!String(plan.name).trim() || String(plan.name).length > 150)) {
		return "Name must be between 1 and 150 characters";
	}
	if (plan.price !== undefined && (!Number.isFinite(Number(plan.price)) || Number(plan.price) < 0)) {
		return "Price must be a non-negative number";
	}
	if (plan.billing_frequency !== undefined && !billingFrequencies.includes(plan.billing_frequency)) {
		return "Billing frequency must be daily, weekly, monthly, or yearly";
	}
	if (plan.minimum_quantity !== undefined && (!Number.isInteger(Number(plan.minimum_quantity)) || Number(plan.minimum_quantity) < 1)) {
		return "Minimum quantity must be a positive integer";
	}
	if (plan.auto_close !== undefined && !autoClosePolicies.includes(plan.auto_close)) {
		return "Invalid auto-close policy";
	}
	for (const field of ["allow_early_close", "allow_pause", "allow_renew"]) {
		if (plan[field] !== undefined && typeof plan[field] !== "boolean") return `${field} must be a boolean`;
	}
	if (plan.available_from && Number.isNaN(Date.parse(plan.available_from))) return "Invalid available-from date";
	if (plan.available_until && Number.isNaN(Date.parse(plan.available_until))) return "Invalid available-until date";
	if (plan.available_from && plan.available_until && new Date(plan.available_until) < new Date(plan.available_from)) {
		return "Available-until must be on or after available-from";
	}
	return null;
}

function preparePlan(plan) {
	const result = { ...plan };
	for (const field of ["price", "minimum_quantity"]) {
		if (result[field] !== undefined) result[field] = field === "price" ? Number(result[field]) : Number(result[field]);
	}
	if (result.name !== undefined) result.name = String(result.name).trim();
	return normalizePlanInput(result, true);
}

async function create(req, res) {
	const plan = mapPlanBody(req.body);
	const validationError = validatePlan(plan);
	if (validationError) return res.status(400).json({ error: validationError });
	try {
		return res.status(201).json({ plan: await createPlan(preparePlan(plan)) });
	} catch (error) {
		console.error("Failed to create plan:", error);
		if (error.code === "23505") return res.status(409).json({ error: "A plan with this name already exists" });
		return res.status(500).json({ error: "Failed to create plan" });
	}
}

async function list(req, res) {
	const limit = Number(req.query.limit || 20);
	const page = Number(req.query.page || 1);
	if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1) {
		return res.status(400).json({ error: "Page must be positive and limit must be between 1 and 100" });
	}
	const active = req.query.active === undefined ? undefined : req.query.active === "true" ? true : req.query.active === "false" ? false : null;
	if (active === null) return res.status(400).json({ error: "Active must be true or false" });
	if (req.query.billingFrequency && !billingFrequencies.includes(req.query.billingFrequency)) return res.status(400).json({ error: "Invalid billing frequency" });
	try {
		return res.json({ page, limit, plans: await getPlans({ billingFrequency: req.query.billingFrequency, active, search: req.query.search, limit, offset: (page - 1) * limit }) });
	} catch (error) {
		console.error("Failed to retrieve plans:", error);
		return res.status(500).json({ error: "Failed to retrieve plans" });
	}
}

async function getOne(req, res) {
	if (!uuidPattern.test(req.params.planId)) return res.status(400).json({ error: "Invalid plan id" });
	try {
		const plan = await getPlanById(req.params.planId);
		return plan ? res.json({ plan }) : res.status(404).json({ error: "Plan not found" });
	} catch (error) {
		return res.status(500).json({ error: "Failed to retrieve plan" });
	}
}

async function update(req, res) {
	if (!uuidPattern.test(req.params.planId)) return res.status(400).json({ error: "Invalid plan id" });
	const plan = mapPlanBody(req.body);
	try {
		const existing = await getPlanById(req.params.planId);
		if (!existing) return res.status(404).json({ error: "Plan not found" });

		const merged = { ...existing, ...plan };
		const validationError = validatePlan(merged);
		if (validationError) return res.status(400).json({ error: validationError });

		const result = await updatePlan(req.params.planId, preparePlan(plan));
		return result ? res.json({ plan: result }) : res.status(404).json({ error: "Plan not found" });
	} catch (error) {
		if (error.code === "23505") return res.status(409).json({ error: "A plan with this name already exists" });
		return res.status(500).json({ error: "Failed to update plan" });
	}
}

async function archive(req, res) {
	if (!uuidPattern.test(req.params.planId)) return res.status(400).json({ error: "Invalid plan id" });
	try {
		const plan = await archivePlan(req.params.planId);
		return plan ? res.json({ plan }) : res.status(404).json({ error: "Plan not found" });
	} catch (error) {
		return res.status(500).json({ error: "Failed to archive plan" });
	}
}

async function status(req, res) {
	if (!uuidPattern.test(req.params.planId)) return res.status(400).json({ error: "Invalid plan id" });
	if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "Active must be a boolean" });
	try {
		const plan = await updatePlanStatus(req.params.planId, req.body.active);
		return plan ? res.json({ plan }) : res.status(404).json({ error: "Plan not found" });
	} catch (error) {
		return res.status(500).json({ error: "Failed to update plan status" });
	}
}

module.exports = { create, list, getOne, update, archive, status };
