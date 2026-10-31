const pool = require("../config/db_connect");
const { listDiscounts } = require("../services/discount");

function failure(res, error, message) {
	console.error(message, error);
	return res.status(error.status || (error.code === "23505" ? 409 : 500)).json({
		error: error.status ? error.message :
			error.code === "23505" ? "A record with the same unique value already exists" : message,
	});
}

function validate(body, partial = false) {
	const types = ["fixed", "percentage"];
	const scopes = ["products", "subscription"];
	if (!partial && !String(body.name || "").trim()) return "name is required";
	if (!partial && !types.includes(body.discountType)) return "discountType must be fixed or percentage";
	if (!partial && body.discountValue === undefined) return "discountValue is required";
	if (!partial && !scopes.includes(body.applicationScope)) return "applicationScope must be products or subscription";
	if (body.discountType !== undefined && !types.includes(body.discountType)) return "discountType must be fixed or percentage";
	if (body.applicationScope !== undefined && !scopes.includes(body.applicationScope)) return "applicationScope must be products or subscription";
	if (body.discountValue !== undefined &&
		(!Number.isFinite(Number(body.discountValue)) || Number(body.discountValue) < 0 ||
			(body.discountType === "percentage" && Number(body.discountValue) > 100))) {
		return "discountValue is invalid";
	}
	if (body.minimumPurchase !== undefined && Number(body.minimumPurchase) < 0) return "minimumPurchase cannot be negative";
	if (body.minimumQuantity !== undefined && Number(body.minimumQuantity) < 0) return "minimumQuantity cannot be negative";
	if (body.usageLimit !== undefined && body.usageLimit !== null &&
		(!Number.isInteger(Number(body.usageLimit)) || Number(body.usageLimit) <= 0)) return "usageLimit must be positive";
	if (body.startDate && body.endDate && body.endDate < body.startDate) return "endDate must be on or after startDate";
	return null;
}

async function create(req, res) {
	const error = validate(req.body);
	if (error) return res.status(400).json({ error });
	const {
		name, discountType, discountValue, minimumPurchase = 0, minimumQuantity = 0,
		startDate = null, endDate = null, usageLimit = null, applicationScope, productIds = [],
	} = req.body;
	if (applicationScope === "products" && (!Array.isArray(productIds) || !productIds.length)) {
		return res.status(400).json({ error: "productIds are required for product discounts" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		if (productIds.length) {
			const count = (await client.query(
				"SELECT count(*)::int AS count FROM products WHERE id = ANY($1::uuid[])", [productIds]
			)).rows[0].count;
			if (count !== productIds.length) throw Object.assign(new Error("One or more products do not exist"), { status: 400 });
		}
		const discount = (await client.query(
			`INSERT INTO discounts
			 (name, discount_type, discount_value, minimum_purchase, minimum_quantity,
			  start_date, end_date, usage_limit, application_scope, created_by)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
			[name.trim(), discountType, discountValue, minimumPurchase, minimumQuantity,
				startDate, endDate, usageLimit, applicationScope, req.admin.id]
		)).rows[0];
		for (const productId of productIds) {
			await client.query("INSERT INTO discount_products(discount_id, product_id) VALUES($1,$2)", [discount.id, productId]);
		}
		await client.query("COMMIT");
		return res.status(201).json({ discount });
	} catch (exception) {
		await client.query("ROLLBACK");
		return failure(res, exception, "Failed to create discount");
	} finally {
		client.release();
	}
}

async function list(req, res) {
	try {
		const rows = await listDiscounts(pool, req.query);
		return res.json({ discounts: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve discounts");
	}
}

async function getOne(req, res) {
	try {
		const { rows } = await pool.query(
			`SELECT d.*, COALESCE(json_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '[]') AS product_ids
			 FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id=d.id
			 WHERE d.id=$1 GROUP BY d.id`, [req.params.discountId]
		);
		return rows[0] ? res.json({ discount: rows[0] }) : res.status(404).json({ error: "Discount not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve discount");
	}
}

async function update(req, res) {
	const error = validate(req.body, true);
	if (error) return res.status(400).json({ error });
	const map = {
		name: req.body.name, discount_type: req.body.discountType, discount_value: req.body.discountValue,
		minimum_purchase: req.body.minimumPurchase, minimum_quantity: req.body.minimumQuantity,
		start_date: req.body.startDate, end_date: req.body.endDate, usage_limit: req.body.usageLimit,
		application_scope: req.body.applicationScope, is_active: req.body.isActive,
	};
	const entries = Object.entries(map).filter(([, value]) => value !== undefined);
	if (!entries.length) return getOne(req, res);
	const values = entries.map(([, value]) => value);
	values.push(req.params.discountId);
	try {
		const row = (await pool.query(
			`UPDATE discounts SET ${entries.map(([key], index) => `${key}=$${index + 1}`).join(", ")},
			 updated_at=CURRENT_TIMESTAMP WHERE id=$${values.length} RETURNING *`, values
		)).rows[0];
		return row ? res.json({ discount: row }) : res.status(404).json({ error: "Discount not found" });
	} catch (exception) {
		return failure(res, exception, "Failed to update discount");
	}
}

async function archive(req, res) {
	try {
		const { rows } = await pool.query(
			"UPDATE discounts SET is_active=FALSE, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",
			[req.params.discountId]
		);
		return rows[0] ? res.json({ discount: rows[0] }) : res.status(404).json({ error: "Discount not found" });
	} catch (error) {
		return failure(res, error, "Failed to archive discount");
	}
}

async function status(req, res) {
	if (typeof req.body.isActive !== "boolean") return res.status(400).json({ error: "isActive must be boolean" });
	req.body.isActive = req.body.isActive;
	return update(req, res);
}

async function usage(req, res) {
	try {
		const { rows } = await pool.query(
			`SELECT d.id, d.name, d.usage_count, d.usage_limit,
			        count(i.id)::int AS generated_invoice_count
			 FROM discounts d
			 LEFT JOIN invoices i ON i.discount_snapshot @> jsonb_build_array(jsonb_build_object('id', d.id::text))
			 WHERE d.id=$1 GROUP BY d.id`, [req.params.discountId]
		);
		return rows[0] ? res.json({ usage: rows[0] }) : res.status(404).json({ error: "Discount not found" });
	} catch (error) {
		return failure(res, error, "Failed to retrieve discount usage");
	}
}

async function available(req, res) {
	try {
		const { rows } = await pool.query(
			`SELECT d.*, COALESCE(json_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '[]') AS product_ids
			 FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id=d.id
			 WHERE d.is_active=TRUE AND (d.start_date IS NULL OR d.start_date <= CURRENT_DATE)
			   AND (d.end_date IS NULL OR d.end_date >= CURRENT_DATE)
			   AND (d.usage_limit IS NULL OR d.usage_count < d.usage_limit)
			 GROUP BY d.id ORDER BY d.created_at DESC`
		);
		return res.json({ discounts: rows });
	} catch (error) {
		return failure(res, error, "Failed to retrieve available discounts");
	}
}

module.exports = { create, list, getOne, update, archive, status, usage, available };
