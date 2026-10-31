const pool = require("../config/db_connect");

async function createProductTables() {
	await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");

	await pool.query(`
		CREATE TABLE IF NOT EXISTS products (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(150) NOT NULL,
			type VARCHAR(50) NOT NULL,
			sales_price NUMERIC(12, 2) NOT NULL,
			cost_price NUMERIC(12, 2) NOT NULL,
			notes TEXT
		);
	`);

	await pool.query(`
		ALTER TABLE products
		ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'standard';
	`);

	await pool.query(`
		CREATE TABLE IF NOT EXISTS product_variants (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			product_id UUID NOT NULL REFERENCES products(id),
			variant_type VARCHAR(50) NOT NULL,
			variant_name VARCHAR(100) NOT NULL,
			additional_price NUMERIC(12, 2) DEFAULT 0,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			UNIQUE(product_id, variant_type, variant_name)
		);
	`);

	await pool.query(`
		ALTER TABLE product_variants
		ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
	`);
}

async function createProduct(name, type, salesPrice, costPrice, notes = null) {
	const query = `
		INSERT INTO products (name, type, sales_price, cost_price, notes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, type, sales_price, cost_price, notes;
	`;

	const { rows } = await pool.query(query, [
		name,
		type,
		salesPrice,
		costPrice,
		notes,
	]);
	return rows[0];
}

async function getProducts() {
	const { rows } = await pool.query(
		"SELECT id, name, type, sales_price, cost_price, notes FROM products ORDER BY name"
	);
	return rows;
}

async function getProductById(id) {
	const { rows } = await pool.query(
		"SELECT id, name, type, sales_price, cost_price, notes FROM products WHERE id = $1",
		[id]
	);
	return rows[0] || null;
}

async function updateProduct(id, fields) {
	const updates = [];
	const values = [];

	for (const [column, value] of Object.entries(fields)) {
		if (value !== undefined) {
			updates.push(`${column} = $${values.length + 1}`);
			values.push(value);
		}
	}

	if (updates.length === 0) {
		return getProductById(id);
	}

	values.push(id);
	const { rows } = await pool.query(
		`UPDATE products
		 SET ${updates.join(", ")}
		 WHERE id = $${values.length}
		 RETURNING id, name, type, sales_price, cost_price, notes`,
		values
	);
	return rows[0] || null;
}

async function deleteProduct(id) {
	const client = await pool.connect();

	try {
		await client.query("BEGIN");
		await client.query("DELETE FROM product_variants WHERE product_id = $1", [id]);
		const { rows } = await client.query(
			"DELETE FROM products WHERE id = $1 RETURNING id",
			[id]
		);
		await client.query("COMMIT");
		return rows[0] || null;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
}

async function createProductVariant(
	productId,
	variantType,
	variantName,
	additionalPrice = 0
) {
	const query = `
		INSERT INTO product_variants
			(product_id, variant_type, variant_name, additional_price, active)
		VALUES ($1, $2, $3, $4, TRUE)
		RETURNING id, product_id, variant_type, variant_name, additional_price, active;
	`;

	const { rows } = await pool.query(query, [
		productId,
		variantType,
		variantName,
		additionalPrice,
	]);
	return rows[0];
}

async function getProductVariants(productId) {
	const { rows } = await pool.query(
		`SELECT id, product_id, variant_type, variant_name, additional_price, active
		 FROM product_variants
		 WHERE product_id = $1
		 AND active = TRUE
		 ORDER BY variant_type, variant_name`,
		[productId]
	);
	return rows;
}

async function deleteProductVariant(productId, id) {
	const { rows } = await pool.query(
		"UPDATE product_variants SET active = FALSE WHERE product_id = $1 AND id = $2 RETURNING id, product_id, active",
		[productId, id]
	);
	return rows[0] || null;
}

async function getProductVariantById(productId, variantId) {
	const { rows } = await pool.query(
		`SELECT id, product_id, variant_type, variant_name, additional_price, active
		 FROM product_variants
		 WHERE product_id = $1 AND id = $2`,
		[productId, variantId]
	);
	return rows[0] || null;
}

async function updateProductVariant(productId, variantId, fields) {
	const updates = [];
	const values = [];

	for (const [column, value] of Object.entries(fields)) {
		if (value !== undefined) {
			updates.push(`${column} = $${values.length + 1}`);
			values.push(value);
		}
	}

	if (updates.length === 0) {
		return getProductVariantById(productId, variantId);
	}

	values.push(productId, variantId);
	const { rows } = await pool.query(
		`UPDATE product_variants
		 SET ${updates.join(", ")}
		 WHERE product_id = $${values.length - 1} AND id = $${values.length}
		 RETURNING id, product_id, variant_type, variant_name, additional_price, active`,
		values
	);
	return rows[0] || null;
}

module.exports = {
	createProductTables,
	createProduct,
	getProducts,
	getProductById,
	updateProduct,
	deleteProduct,
	createProductVariant,
	getProductVariants,
	deleteProductVariant,
	getProductVariantById,
	updateProductVariant,
};
