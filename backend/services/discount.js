function eligibleDate(discount, date) {
	const value = String(date).slice(0, 10);
	return (!discount.start_date || value >= String(discount.start_date).slice(0, 10)) &&
		(!discount.end_date || value <= String(discount.end_date).slice(0, 10));
}

async function findEligibleDiscount(client, subtotal, quantity, productIds, date, lines = []) {
	const { cents, formatCents } = require("./billing");
	const { rows } = await client.query(
		`SELECT d.*, COALESCE(array_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '{}') AS product_ids
		 FROM discounts d
		 LEFT JOIN discount_products dp ON dp.discount_id=d.id
		 WHERE d.is_active=TRUE
		   AND (d.start_date IS NULL OR d.start_date <= $1)
		   AND (d.end_date IS NULL OR d.end_date >= $1)
		   AND (d.usage_limit IS NULL OR d.usage_count < d.usage_limit)
		 GROUP BY d.id
		 ORDER BY d.created_at`,
		[date]
	);
	const subtotalCents = cents(subtotal);
	const matching = rows.map((discount) => {
		if (!eligibleDate(discount, date) ||
			Number(quantity) < Number(discount.minimum_quantity)) return null;
		let base = subtotalCents;
		let eligibleQuantity = Number(quantity);
		if (discount.application_scope === "products") {
			const allowed = discount.product_ids.map(String);
			const eligibleLines = lines.filter((line) => allowed.includes(String(line.product_id)));
			base = eligibleLines.reduce((sum, line) => sum + cents(line.line_subtotal), 0n);
			eligibleQuantity = eligibleLines.reduce((sum, line) => sum + Number(line.quantity), 0);
			if (!base || base < cents(discount.minimum_purchase)) return null;
		} else if (base < cents(discount.minimum_purchase)) {
			return null;
		}
		if (eligibleQuantity < Number(discount.minimum_quantity)) return null;
		return { discount, base, eligibleQuantity };
	}).filter(Boolean);
	if (!matching.length) return null;

	// Discount stacking is intentionally not assumed: the single largest eligible
	// discount is selected until the business defines a stacking policy.
	let selected = null;
	let selectedAmount = 0n;
	for (const candidate of matching) {
		const discount = candidate.discount;
		const amount = discount.discount_type === "percentage"
			? (candidate.base * cents(discount.discount_value) + 5000n) / 10000n
			: cents(discount.discount_value);
		const capped = amount > candidate.base ? candidate.base : amount;
		if (!selected || capped > selectedAmount) {
			selected = discount;
			selectedAmount = capped;
		}
	}
	if (!selected) return null;
	const locked = (await client.query(
		"SELECT * FROM discounts WHERE id=$1 FOR UPDATE", [selected.id]
	)).rows[0];
	if (!locked || !locked.is_active ||
		(locked.usage_limit !== null && locked.usage_count >= locked.usage_limit)) return null;
	return {
		discount: locked,
		amount: formatCents(selectedAmount),
		snapshot: {
			id: locked.id,
			name: locked.name,
			type: locked.discount_type,
			value: String(locked.discount_value),
			amount: formatCents(selectedAmount),
			scope: locked.application_scope,
			base_amount: formatCents(matching.find((item) => item.discount.id === locked.id).base),
		},
	};
}

async function incrementUsage(client, discountId) {
	const result = await client.query(
		`UPDATE discounts SET usage_count=usage_count+1, updated_at=CURRENT_TIMESTAMP
		 WHERE id=$1 AND is_active=TRUE
		   AND (usage_limit IS NULL OR usage_count < usage_limit)
		 RETURNING id`, [discountId]
	);
	if (!result.rows[0]) throw Object.assign(new Error("Discount usage limit reached"), { status: 409 });
}

async function listDiscounts(client, filters = {}) {
	const values = [];
	const where = [];
	if (filters.search) {
		values.push(`%${filters.search}%`);
		where.push(`d.name ILIKE $${values.length}`);
	}
	if (filters.active !== undefined) {
		values.push(filters.active);
		where.push(`d.is_active = $${values.length}`);
	}
	const limit = Math.min(Math.max(Number(filters.limit || 20), 1), 100);
	const offset = Math.max(Number(filters.page || 1) - 1, 0) * limit;
	values.push(limit, offset);
	const { rows } = await client.query(
		`SELECT d.*, COALESCE(json_agg(dp.product_id) FILTER (WHERE dp.product_id IS NOT NULL), '[]') AS product_ids
		 FROM discounts d LEFT JOIN discount_products dp ON dp.discount_id=d.id
		 ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
		 GROUP BY d.id ORDER BY d.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
		values
	);
	return rows;
}

module.exports = { findEligibleDiscount, incrementUsage, listDiscounts };
