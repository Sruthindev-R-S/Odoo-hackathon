const {
	pool,
	transitions,
	calculateTotals,
	resolveItem,
	getTemplate,
	getQuotation,
	getSubscription,
} = require("../models/commercial");

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value) => uuid.test(String(value || ""));
const value = (body, ...keys) => keys.map((key) => body[key]).find((item) => item !== undefined);
const expiry = (days) => {
	const result = new Date();
	result.setDate(result.getDate() + Number(days));
	return result.toISOString();
};

function failure(res, error, message) {
	console.error(message, error);
	return res.status(error.status || (error.code === "23505" ? 409 : 500)).json({
		error: error.code === "23505" ? "A record with the same unique value already exists" :
			error.status ? error.message : message,
	});
}

async function createTemplate(req, res) {
	const { name, planId, validityDays = 30, items = [] } = req.body;
	if (!String(name || "").trim() || !isUuid(planId) ||
		!Number.isInteger(Number(validityDays)) || Number(validityDays) < 0) {
		return res.status(400).json({ error: "Name, planId and non-negative validityDays are required" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const template = (await client.query(
			"INSERT INTO quotation_templates(name, plan_id, validity_days) VALUES($1,$2,$3) RETURNING id",
			[String(name).trim(), planId, Number(validityDays)]
		)).rows[0];
		for (const item of items) {
			const line = await resolveItem(client, item);
			await client.query(
				`INSERT INTO quotation_template_items
				 (template_id, product_id, variant_id, quantity, unit_price, taxes)
				 VALUES($1,$2,$3,$4,$5,$6)`,
				[template.id, line.product_id, line.variant_id, line.quantity, line.unit_price, JSON.stringify(line.taxes)]
			);
		}
		await client.query("COMMIT");
		return res.status(201).json({ template: await getTemplate(template.id) });
	} catch (error) {
		await client.query("ROLLBACK");
		return failure(res, error, "Failed to create quotation template");
	} finally {
		client.release();
	}
}

async function listTemplates(req, res) {
	try {
		const active = req.query.active === undefined ? null : req.query.active === "true";
		const { rows } = await pool.query(
			`SELECT qt.*, sp.name AS plan_name
			 FROM quotation_templates qt JOIN subscription_plans sp ON sp.id = qt.plan_id
			 WHERE ($1::boolean IS NULL OR qt.active = $1)
			 ORDER BY qt.created_at DESC`, [active]
		);
		return res.json({ templates: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve quotation templates");
	}
}

async function getTemplateRoute(req, res) {
	if (!isUuid(req.params.templateId)) return res.status(400).json({ error: "Invalid template id" });
	try {
		const template = await getTemplate(req.params.templateId);
		return template ? res.json({ template }) : res.status(404).json({ error: "Template not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve quotation template");
	}
}

async function updateTemplate(req, res) {
	const updates = {
		name: req.body.name,
		plan_id: req.body.planId,
		validity_days: req.body.validityDays,
		active: req.body.active,
	};
	const entries = Object.entries(updates).filter(([, item]) => item !== undefined);
	if (updates.plan_id !== undefined && !isUuid(updates.plan_id)) return res.status(400).json({ error: "Invalid planId" });
	if (updates.validity_days !== undefined &&
		(!Number.isInteger(Number(updates.validity_days)) || Number(updates.validity_days) < 0)) {
		return res.status(400).json({ error: "validityDays must be a non-negative integer" });
	}
	if (!entries.length) return getTemplateRoute(req, res);
	try {
		const values = entries.map(([, item]) => item);
		values.push(req.params.templateId);
		const row = (await pool.query(
			`UPDATE quotation_templates SET
			 ${entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")},
			 updated_at = CURRENT_TIMESTAMP
			 WHERE id = $${values.length} RETURNING id`, values
		)).rows[0];
		return row ? res.json({ template: await getTemplate(row.id) }) :
			res.status(404).json({ error: "Template not found" });
	} catch (error) {
		return failure(res, error, "Failed to update quotation template");
	}
}

async function archiveTemplate(req, res) {
	try {
		const row = (await pool.query(
			"UPDATE quotation_templates SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
			[req.params.templateId]
		)).rows[0];
		return row ? res.json({ message: "Template archived" }) :
			res.status(404).json({ error: "Template not found" });
	} catch (error) {
		return failure(res, error, "Failed to archive quotation template");
	}
}

async function addTemplateItem(req, res) {
	try {
		const line = await resolveItem(pool, req.body);
		const row = (await pool.query(
			`INSERT INTO quotation_template_items
			 (template_id, product_id, variant_id, quantity, unit_price, taxes)
			 SELECT $1,$2,$3,$4,$5,$6
			 WHERE EXISTS (SELECT 1 FROM quotation_templates WHERE id=$1 AND active=TRUE)
			 RETURNING *`,
			[req.params.templateId, line.product_id, line.variant_id, line.quantity, line.unit_price, JSON.stringify(line.taxes)]
		)).rows[0];
		return row ? res.status(201).json({ item: row }) :
			res.status(404).json({ error: "Active template not found" });
	} catch (error) {
		return failure(res, error, "Failed to add template item");
	}
}

async function updateTemplateItem(req, res) {
	const updates = { quantity: req.body.quantity, unit_price: req.body.unitPrice, taxes: req.body.taxes };
	const entries = Object.entries(updates).filter(([, item]) => item !== undefined);
	if (!entries.length) return res.status(400).json({ error: "No editable fields supplied" });
	if (updates.quantity !== undefined && Number(updates.quantity) <= 0) {
		return res.status(400).json({ error: "Quantity must be positive" });
	}
	const values = entries.map(([, item]) => item);
	if (updates.taxes !== undefined) values[entries.findIndex(([key]) => key === "taxes")] = JSON.stringify(updates.taxes);
	values.push(req.params.itemId, req.params.templateId);
	try {
		const row = (await pool.query(
			`UPDATE quotation_template_items SET
			 ${entries.map(([key], index) => `${key} = $${index + 1}`).join(", ")},
			 updated_at = CURRENT_TIMESTAMP
			 WHERE id = $${values.length - 1} AND template_id = $${values.length} RETURNING *`, values
		)).rows[0];
		return row ? res.json({ item: row }) : res.status(404).json({ error: "Template item not found" });
	} catch (error) {
		return failure(res, error, "Failed to update template item");
	}
}

async function deleteTemplateItem(req, res) {
	try {
		const row = (await pool.query(
			"DELETE FROM quotation_template_items WHERE id=$1 AND template_id=$2 RETURNING id",
			[req.params.itemId, req.params.templateId]
		)).rows[0];
		return row ? res.json({ message: "Template item removed" }) :
			res.status(404).json({ error: "Template item not found" });
	} catch (error) {
		return failure(res, error, "Failed to remove template item");
	}
}

async function createQuotation(req, res, templateId = null) {
	const body = req.body || {};
	const template = templateId ? await getTemplate(templateId) : null;
	if (templateId && !template) return res.status(404).json({ error: "Template not found" });
	const customerId = value(body, "customerId");
	const planId = value(body, "planId") || template?.plan_id;
	const validityDays = Number(body.validityDays ?? template?.validity_days ?? 30);
	if (!customerId || !isUuid(planId) || !Number.isInteger(validityDays) || validityDays < 0) {
		return res.status(400).json({ error: "customerId, planId and valid validityDays are required" });
	}

	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		if (!(await client.query("SELECT id FROM users WHERE id=$1", [customerId])).rows[0]) {
			throw Object.assign(new Error("Customer not found"), { status: 400 });
		}
		const sourceItems = body.items || template?.items || [];
		const lines = [];
		for (const item of sourceItems) lines.push(await resolveItem(client, item));
		const totals = calculateTotals(lines);
		const quotation = (await client.query(
			`INSERT INTO quotations
			 (customer_id, plan_id, template_id, validity_days, expires_at, payment_terms,
			  subtotal, tax_total, total)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			[customerId, planId, template?.id || null, validityDays, expiry(validityDays),
				body.paymentTerms || null, totals.subtotal, totals.taxTotal, totals.total]
		)).rows[0];
		for (const line of totals.items) {
			await client.query(
				`INSERT INTO quotation_items
				 (quotation_id, product_id, variant_id, product_name, variant_name, quantity,
				  unit_price, taxes, tax_amount, line_amount)
				 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				[quotation.id, line.product_id, line.variant_id, line.product_name, line.variant_name,
					line.quantity, line.unit_price, JSON.stringify(line.taxes), line.tax_amount, line.line_amount]
			);
		}
		await client.query("COMMIT");
		return res.status(201).json({ quotation: await getQuotation(quotation.id) });
	} catch (error) {
		await client.query("ROLLBACK");
		return failure(res, error, "Failed to create quotation");
	} finally {
		client.release();
	}
}

async function listQuotations(req, res) {
	try {
		const values = [];
		const where = [];
		if (req.query.status) { values.push(req.query.status); where.push(`q.status=$${values.length}`); }
		if (req.query.customerId) { values.push(req.query.customerId); where.push(`q.customer_id=$${values.length}`); }
		const limit = Math.min(Number(req.query.limit || 20), 100);
		values.push(limit, Math.max(Number(req.query.page || 1) - 1, 0) * limit);
		const { rows } = await pool.query(
			`SELECT q.*, u.name AS customer_name, sp.name AS plan_name
			 FROM quotations q LEFT JOIN users u ON u.id=q.customer_id
			 JOIN subscription_plans sp ON sp.id=q.plan_id
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY q.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
		);
		return res.json({ quotations: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve quotations");
	}
}

async function getQuotationRoute(req, res) {
	try {
		const quotation = await getQuotation(req.params.quotationId);
		return quotation ? res.json({ quotation }) : res.status(404).json({ error: "Quotation not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve quotation");
	}
}

async function updateQuotation(req, res) {
	const updates = { payment_terms: req.body.paymentTerms, validity_days: req.body.validityDays };
	const entries = Object.entries(updates).filter(([, item]) => item !== undefined);
	if (!entries.length) return getQuotationRoute(req, res);
	const values = entries.map(([, item]) => item);
	values.push(req.params.quotationId);
	try {
		const row = (await pool.query(
			`UPDATE quotations SET
			 ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
			 updated_at=CURRENT_TIMESTAMP
			 WHERE id=$${values.length} AND status='draft' RETURNING id`, values
		)).rows[0];
		return row ? getQuotationRoute(req, res) : res.status(409).json({ error: "Only draft quotations can be updated" });
	} catch (error) {
		return failure(res, error, "Failed to update quotation");
	}
}

async function changeQuotationStatus(req, res, status) {
	try {
		const condition = status === "confirmed" ? "AND expires_at >= CURRENT_TIMESTAMP" : "";
		const row = (await pool.query(
			`UPDATE quotations SET status=$1, updated_at=CURRENT_TIMESTAMP
			 WHERE id=$2 ${condition} RETURNING id`, [status, req.params.quotationId]
		)).rows[0];
		return row ? getQuotationRoute(req, res) :
			res.status(409).json({ error: status === "confirmed" ? "Quotation is expired or not found" : "Quotation not found" });
	} catch (error) {
		return failure(res, error, "Failed to update quotation status");
	}
}

async function createSubscription(req, res) {
	const { customerId, planId, quantity = 1, startDate, expiryDate, paymentTerms, items = [] } = req.body;
	if (!customerId || !isUuid(planId) || !Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
		return res.status(400).json({ error: "customerId, planId and positive integer quantity are required" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		if (!(await client.query("SELECT id FROM users WHERE id=$1", [customerId])).rows[0]) {
			throw Object.assign(new Error("Customer not found"), { status: 400 });
		}
		if (!(await client.query("SELECT id FROM subscription_plans WHERE id=$1 AND active=TRUE", [planId])).rows[0]) {
			throw Object.assign(new Error("Active subscription plan not found"), { status: 400 });
		}
		const lines = [];
		for (const item of items) lines.push(await resolveItem(client, item));
		const totals = calculateTotals(lines);
		const subscription = (await client.query(
			`INSERT INTO subscriptions
			 (subscription_number, customer_id, plan_id, quantity, agreed_price,
			  agreed_billing_frequency, status, start_date, expiry_date, next_billing_date, billing_anchor_date, payment_terms,
			  subtotal, tax_total, total)
			 SELECT 'SUB-' || to_char(CURRENT_DATE,'YYYYMMDD') || '-' ||
			  lpad(nextval('commercial_number_seq')::text,6,'0'),
			  $1, id, $2, price, billing_frequency, 'draft', $3, $4, $3, $3, $5, $6, $7, $8
			 FROM subscription_plans WHERE id=$9 RETURNING id`,
			[customerId, quantity, startDate || null, expiryDate || null, paymentTerms || null,
				totals.subtotal, totals.taxTotal, totals.total, planId]
		)).rows[0];
		for (const line of totals.items) {
			await client.query(
				`INSERT INTO subscription_items
				 (subscription_id, product_id, variant_id, product_name, variant_name, quantity,
				  unit_price, taxes, tax_amount, line_amount)
				 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				[subscription.id, line.product_id, line.variant_id, line.product_name, line.variant_name,
					line.quantity, line.unit_price, JSON.stringify(line.taxes), line.tax_amount, line.line_amount]
			);
		}
		await client.query(
			"INSERT INTO subscription_status_history(subscription_id,status,changed_by) VALUES($1,'draft',$2)",
			[subscription.id, req.companyUser.id]
		);
		await client.query("COMMIT");
		return res.status(201).json({ subscription: await getSubscription(subscription.id) });
	} catch (error) {
		await client.query("ROLLBACK");
		return failure(res, error, "Failed to create subscription");
	} finally {
		client.release();
	}
}

async function listSubscriptions(req, res) {
	try {
		const values = [];
		const where = [];
		for (const [query, column] of [["status", "s.status"], ["planId", "s.plan_id"], ["customerId", "s.customer_id"]]) {
			if (req.query[query]) { values.push(req.query[query]); where.push(`${column}=$${values.length}`); }
		}
		if (req.query.search) {
			values.push(`%${req.query.search}%`);
			where.push(`(s.subscription_number ILIKE $${values.length} OR u.name ILIKE $${values.length})`);
		}
		const limit = Math.min(Number(req.query.limit || 20), 100);
		values.push(limit, Math.max(Number(req.query.page || 1) - 1, 0) * limit);
		const { rows } = await pool.query(
			`SELECT s.*, u.name AS customer_name, sp.name AS plan_name
			 FROM subscriptions s LEFT JOIN users u ON u.id=s.customer_id
			 JOIN subscription_plans sp ON sp.id=s.plan_id
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
			 ORDER BY s.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values
		);
		return res.json({ subscriptions: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve subscriptions");
	}
}

async function getSubscriptionRoute(req, res) {
	try {
		const subscription = await getSubscription(req.params.subscriptionId);
		return subscription ? res.json({ subscription }) : res.status(404).json({ error: "Subscription not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve subscription");
	}
}

async function updateSubscription(req, res) {
	const updates = {
		start_date: req.body.startDate,
		expiry_date: req.body.expiryDate,
		payment_terms: req.body.paymentTerms,
	};
	const entries = Object.entries(updates).filter(([, item]) => item !== undefined);
	if (!entries.length) return getSubscriptionRoute(req, res);
	const values = entries.map(([, item]) => item);
	values.push(req.params.subscriptionId);
	try {
		const row = (await pool.query(
			`UPDATE subscriptions SET
			 ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
			 updated_at=CURRENT_TIMESTAMP
			 WHERE id=$${values.length} AND status IN ('draft', 'quotation') RETURNING id`,
			values
		)).rows[0];
		return row ? getSubscriptionRoute(req, res) :
			res.status(409).json({ error: "Only draft or quotation subscriptions can be updated" });
	} catch (error) {
		return failure(res, error, "Failed to update subscription");
	}
}

async function transitionSubscription(req, res, target) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const current = (await client.query(
			"SELECT status FROM subscriptions WHERE id=$1 FOR UPDATE", [req.params.subscriptionId]
		)).rows[0];
		if (!current) {
			await client.query("ROLLBACK");
			return res.status(404).json({ error: "Subscription not found" });
		}
		if (!transitions[current.status]?.includes(target)) {
			await client.query("ROLLBACK");
			return res.status(409).json({ error: `Invalid status transition from ${current.status} to ${target}` });
		}
		const row = (await client.query(
			`UPDATE subscriptions
			 SET status=$1,
			     next_billing_date=CASE WHEN $1='active' AND next_billing_date IS NULL
			       THEN COALESCE(start_date, CURRENT_DATE) ELSE next_billing_date END,
			     billing_anchor_date=CASE WHEN $1='active' AND billing_anchor_date IS NULL
			       THEN COALESCE(start_date, CURRENT_DATE) ELSE billing_anchor_date END,
			     updated_at=CURRENT_TIMESTAMP
			 WHERE id=$2 RETURNING id`,
			[target, req.params.subscriptionId]
		)).rows[0];
		await client.query(
			"INSERT INTO subscription_status_history(subscription_id,status,changed_by) VALUES($1,$2,$3)",
			[row.id, target, req.companyUser.id]
		);
		await client.query("COMMIT");
		return getSubscriptionRoute(req, res);
	} catch (error) {
		await client.query("ROLLBACK");
		return failure(res, error, "Failed to transition subscription");
	} finally {
		client.release();
	}
}

async function listSubscriptionItems(req, res) {
	try {
		const { rows } = await pool.query(
			"SELECT * FROM subscription_items WHERE subscription_id=$1 ORDER BY created_at",
			[req.params.subscriptionId]
		);
		return res.json({ items: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve subscription items");
	}
}

async function addSubscriptionItem(req, res) {
	try {
		const line = await resolveItem(pool, req.body);
		const total = calculateTotals([line]).items[0];
		const row = (await pool.query(
			`INSERT INTO subscription_items
			 (subscription_id, product_id, variant_id, product_name, variant_name, quantity,
			  unit_price, taxes, tax_amount, line_amount)
			 SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
			 WHERE EXISTS (SELECT 1 FROM subscriptions WHERE id=$1 AND status='draft')
			 RETURNING *`,
			[req.params.subscriptionId, line.product_id, line.variant_id, line.product_name,
				line.variant_name, line.quantity, line.unit_price, JSON.stringify(line.taxes),
				total.tax_amount, total.line_amount]
		)).rows[0];
		return row ? res.status(201).json({ item: row }) :
			res.status(409).json({ error: "Only draft subscriptions can receive items" });
	} catch (error) {
		return failure(res, error, "Failed to add subscription item");
	}
}

async function updateSubscriptionItem(req, res) {
	const updates = { quantity: req.body.quantity, unit_price: req.body.unitPrice, taxes: req.body.taxes };
	const entries = Object.entries(updates).filter(([, item]) => item !== undefined);
	if (!entries.length) return res.status(400).json({ error: "No editable fields supplied" });
	const values = entries.map(([, item]) => item);
	const taxIndex = entries.findIndex(([key]) => key === "taxes");
	if (taxIndex >= 0) values[taxIndex] = JSON.stringify(values[taxIndex]);
	values.push(req.params.itemId, req.params.subscriptionId);
	try {
		const row = (await pool.query(
			`UPDATE subscription_items SET
			 ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
			 updated_at=CURRENT_TIMESTAMP
			 WHERE id=$${values.length - 1} AND subscription_id=$${values.length}
			 AND EXISTS (SELECT 1 FROM subscriptions WHERE id=$${values.length} AND status='draft')
			 RETURNING *`, values
		)).rows[0];
		return row ? res.json({ item: row }) : res.status(404).json({ error: "Draft subscription item not found" });
	} catch (error) {
		return failure(res, error, "Failed to update subscription item");
	}
}

async function deleteSubscriptionItem(req, res) {
	try {
		const row = (await pool.query(
			`DELETE FROM subscription_items
			 WHERE id=$1 AND subscription_id=$2
			 AND EXISTS (SELECT 1 FROM subscriptions WHERE id=$2 AND status='draft')
			 RETURNING id`, [req.params.itemId, req.params.subscriptionId]
		)).rows[0];
		return row ? res.json({ message: "Subscription item removed" }) :
			res.status(404).json({ error: "Draft subscription item not found" });
	} catch (error) {
		return failure(res, error, "Failed to remove subscription item");
	}
}

async function history(req, res) {
	try {
		const { rows } = await pool.query(
			"SELECT * FROM subscription_status_history WHERE subscription_id=$1 ORDER BY changed_at",
			[req.params.subscriptionId]
		);
		return res.json({ history: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve subscription history");
	}
}

module.exports = {
	createTemplate, listTemplates, getTemplateRoute, updateTemplate, archiveTemplate,
	addTemplateItem, updateTemplateItem, deleteTemplateItem, createQuotation,
	listQuotations, getQuotationRoute, updateQuotation, sendQuotation: (req, res) => changeQuotationStatus(req, res, "sent"),
	confirmQuotation: (req, res) => changeQuotationStatus(req, res, "confirmed"),
	createSubscription, listSubscriptions, getSubscriptionRoute, transitionSubscription,
	updateSubscription,
	listSubscriptionItems, addSubscriptionItem, updateSubscriptionItem, deleteSubscriptionItem, history,
};
