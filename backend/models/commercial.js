const pool = require("../config/db_connect");

const subscriptionStatuses = ["draft", "quotation", "confirmed", "active", "closed"];
const transitions = {
	draft: ["quotation"],
	quotation: ["confirmed"],
	confirmed: ["active"],
	active: ["closed"],
	closed: [],
};

async function createCommercialTables() {
	await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
	await pool.query(`
		CREATE SEQUENCE IF NOT EXISTS commercial_number_seq;

		CREATE TABLE IF NOT EXISTS quotation_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(150) NOT NULL UNIQUE,
			plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
			validity_days INTEGER NOT NULL DEFAULT 30 CHECK (validity_days >= 0),
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS quotation_template_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			template_id UUID NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
			variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
			quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
			unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
			taxes JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS quotations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			quotation_number TEXT NOT NULL UNIQUE DEFAULT
				('QUO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
				 lpad(nextval('commercial_number_seq')::text, 6, '0')),
			customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
			plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
			template_id UUID REFERENCES quotation_templates(id) ON DELETE SET NULL,
			validity_days INTEGER NOT NULL CHECK (validity_days >= 0),
			quoted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at TIMESTAMPTZ NOT NULL,
			payment_terms TEXT,
			status VARCHAR(20) NOT NULL DEFAULT 'draft'
				CHECK (status IN ('draft', 'sent', 'confirmed', 'expired')),
			subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
			tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
			total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS quotation_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
			variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
			product_name TEXT NOT NULL,
			variant_name TEXT,
			quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
			unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
			taxes JSONB NOT NULL DEFAULT '[]'::jsonb,
			tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
			line_amount NUMERIC(14, 2) NOT NULL CHECK (line_amount >= 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS subscription_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
			variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
			product_name TEXT NOT NULL,
			variant_name TEXT,
			quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
			unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
			taxes JSONB NOT NULL DEFAULT '[]'::jsonb,
			tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
			line_amount NUMERIC(14, 2) NOT NULL CHECK (line_amount >= 0),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS subscription_status_history (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
			status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'closed')),
			changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			changed_by INTEGER REFERENCES company_users(id) ON DELETE SET NULL
		);

		CREATE TABLE IF NOT EXISTS tax_rules (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(150) NOT NULL,
			percentage NUMERIC(8, 4) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
			product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS invoices (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			invoice_number TEXT NOT NULL UNIQUE DEFAULT
				('INV-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
				 lpad(nextval('commercial_number_seq')::text, 6, '0')),
			subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
			customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
			billing_period_start DATE NOT NULL,
			billing_period_end DATE NOT NULL,
			invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
			due_date DATE NOT NULL,
			subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
			tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
			discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
			total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
			paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
			outstanding_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (outstanding_amount >= 0),
			status VARCHAR(20) NOT NULL DEFAULT 'draft'
				CHECK (status IN ('draft', 'confirmed', 'partially_paid', 'paid', 'cancelled')),
			discount_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CHECK (billing_period_end >= billing_period_start),
			CHECK (due_date >= invoice_date),
			CHECK (paid_amount <= total_amount),
			UNIQUE (subscription_id, billing_period_start, billing_period_end)
		);

		CREATE TABLE IF NOT EXISTS invoice_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
			variant_id UUID REFERENCES product_variants(id) ON DELETE RESTRICT,
			product_description TEXT NOT NULL,
			quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
			unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
			tax_rate NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
			tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
			line_subtotal NUMERIC(14, 2) NOT NULL CHECK (line_subtotal >= 0),
			line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
			tax_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS invoice_payments (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
			payment_method VARCHAR(50) NOT NULL,
			amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
			payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
			transaction_reference VARCHAR(150),
			notes TEXT,
			payment_status VARCHAR(20) NOT NULL DEFAULT 'recorded'
				CHECK (payment_status IN ('recorded', 'verified', 'reversed')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS discounts (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(150) NOT NULL,
			discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('fixed', 'percentage')),
			discount_value NUMERIC(14, 4) NOT NULL CHECK (discount_value >= 0),
			minimum_purchase NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (minimum_purchase >= 0),
			minimum_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
			start_date DATE,
			end_date DATE,
			usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
			usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
			application_scope VARCHAR(20) NOT NULL CHECK (application_scope IN ('products', 'subscription')),
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_by INTEGER REFERENCES company_users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
			CHECK (discount_type <> 'percentage' OR discount_value <= 100)
		);

		CREATE TABLE IF NOT EXISTS discount_products (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			discount_id UUID NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
			product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
			UNIQUE (discount_id, product_id)
		);
	`);

	await pool.query(`
		ALTER TABLE invoices
			ADD COLUMN IF NOT EXISTS discount_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb;
		ALTER TABLE invoice_payments
			ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'recorded';
		DO $$
		BEGIN
			ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_status_check
				CHECK (payment_status IN ('recorded', 'verified', 'reversed'));
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check') THEN
				ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
			END IF;
			ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
				CHECK (status IN ('draft', 'confirmed', 'partially_paid', 'paid', 'cancelled'));
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		ALTER TABLE subscriptions
			ADD COLUMN IF NOT EXISTS subscription_number TEXT,
			ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
			ADD COLUMN IF NOT EXISTS start_date DATE,
			ADD COLUMN IF NOT EXISTS expiry_date DATE,
			ADD COLUMN IF NOT EXISTS payment_terms TEXT,
			ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
			ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
			ADD COLUMN IF NOT EXISTS total NUMERIC(14, 2) NOT NULL DEFAULT 0;
		ALTER TABLE subscriptions
			ADD COLUMN IF NOT EXISTS next_billing_date DATE,
			ADD COLUMN IF NOT EXISTS last_billed_period_start DATE,
			ADD COLUMN IF NOT EXISTS last_billed_period_end DATE,
			ADD COLUMN IF NOT EXISTS billing_anchor_date DATE;
		UPDATE subscriptions
		SET next_billing_date = COALESCE(next_billing_date, start_date, CURRENT_DATE)
		WHERE status = 'active';
		UPDATE subscriptions
		SET subscription_number = 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
			lpad(nextval('commercial_number_seq')::text, 6, '0')
		WHERE subscription_number IS NULL;
		ALTER TABLE subscriptions ALTER COLUMN subscription_number SET NOT NULL;
		CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_number_uidx ON subscriptions(subscription_number);
		CREATE INDEX IF NOT EXISTS quotation_templates_active_idx ON quotation_templates(active);
		CREATE INDEX IF NOT EXISTS quotations_customer_status_idx ON quotations(customer_id, status);
		CREATE INDEX IF NOT EXISTS subscriptions_customer_status_idx ON subscriptions(customer_id, status);
		CREATE INDEX IF NOT EXISTS subscriptions_plan_idx ON subscriptions(plan_id);
		CREATE INDEX IF NOT EXISTS subscription_history_subscription_idx
			ON subscription_status_history(subscription_id, changed_at);
		CREATE INDEX IF NOT EXISTS tax_rules_product_active_idx ON tax_rules(product_id, active);
		CREATE INDEX IF NOT EXISTS invoices_customer_status_idx ON invoices(customer_id, status);
		CREATE INDEX IF NOT EXISTS invoices_subscription_period_idx
			ON invoices(subscription_id, billing_period_start, billing_period_end);
		CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON invoices(due_date, status);
		CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(invoice_id);
		CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments(invoice_id);
		CREATE INDEX IF NOT EXISTS discounts_active_dates_idx
			ON discounts(is_active, start_date, end_date);
		CREATE INDEX IF NOT EXISTS discount_products_product_idx
			ON discount_products(product_id, discount_id);
		CREATE INDEX IF NOT EXISTS invoice_payments_status_date_idx
			ON invoice_payments(payment_status, payment_date);
	`);
}

function calculateTotals(items) {
	let subtotal = 0;
	let taxTotal = 0;
	const normalized = items.map((item) => {
		const quantity = Number(item.quantity);
		const unitPrice = Number(item.unit_price ?? item.unitPrice);
		const taxes = Array.isArray(item.taxes) ? item.taxes : [];
		const lineAmount = Math.round(quantity * unitPrice * 100) / 100;
		const taxAmount = Math.round(taxes.reduce((sum, tax) => {
			const rate = Number(tax.rate ?? tax.percentage ?? 0);
			return sum + (lineAmount * rate / 100);
		}, 0) * 100) / 100;
		subtotal += lineAmount;
		taxTotal += taxAmount;
		return { ...item, quantity, unit_price: unitPrice, taxes, line_amount: lineAmount, tax_amount: taxAmount };
	});
	return {
		items: normalized,
		subtotal: Number(subtotal.toFixed(2)),
		taxTotal: Number(taxTotal.toFixed(2)),
		total: Number((subtotal + taxTotal).toFixed(2)),
	};
}

async function resolveItem(client, item) {
	const productId = item.product_id ?? item.productId;
	const product = (await client.query(
		"SELECT id, name, sales_price FROM products WHERE id = $1 AND active = TRUE", [productId]
	)).rows[0];
	if (!product) throw Object.assign(new Error("Product not found"), { status: 400 });

	const variantId = item.variant_id ?? item.variantId;
	let variant = null;
	if (variantId) {
		variant = (await client.query(
			"SELECT id, variant_name, additional_price FROM product_variants WHERE id = $1 AND product_id = $2 AND active = TRUE",
			[variantId, product.id]
		)).rows[0];
		if (!variant) throw Object.assign(new Error("Variant does not belong to product"), { status: 400 });
	}
	return {
		product_id: product.id,
		variant_id: variant?.id || null,
		product_name: product.name,
		variant_name: variant?.variant_name || null,
		quantity: item.quantity,
		unit_price: item.unit_price ?? item.unitPrice ??
			Number(product.sales_price) + Number(variant?.additional_price || 0),
		taxes: item.taxes || [],
	};
}

async function getTemplate(id, client = pool) {
	const template = (await client.query(
		`SELECT qt.*, sp.name AS plan_name
		 FROM quotation_templates qt
		 JOIN subscription_plans sp ON sp.id = qt.plan_id
		 WHERE qt.id = $1`, [id]
	)).rows[0];
	if (!template) return null;
	template.items = (await client.query(
		"SELECT * FROM quotation_template_items WHERE template_id = $1 ORDER BY created_at", [id]
	)).rows;
	return template;
}

async function getQuotation(id, client = pool) {
	const quotation = (await client.query(
		`SELECT q.*, u.name AS customer_name, sp.name AS plan_name
		 FROM quotations q
		 LEFT JOIN users u ON u.id = q.customer_id
		 JOIN subscription_plans sp ON sp.id = q.plan_id
		 WHERE q.id = $1`, [id]
	)).rows[0];
	if (!quotation) return null;
	quotation.items = (await client.query(
		"SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY created_at", [id]
	)).rows;
	return quotation;
}

async function getSubscription(id, client = pool) {
	const subscription = (await client.query(
		`SELECT s.*, u.name AS customer_name, sp.name AS plan_name
		 FROM subscriptions s
		 LEFT JOIN users u ON u.id = s.customer_id
		 JOIN subscription_plans sp ON sp.id = s.plan_id
		 WHERE s.id = $1`, [id]
	)).rows[0];
	if (!subscription) return null;
	subscription.items = (await client.query(
		"SELECT * FROM subscription_items WHERE subscription_id = $1 ORDER BY created_at", [id]
	)).rows;
	return subscription;
}

module.exports = {
	pool,
	subscriptionStatuses,
	transitions,
	calculateTotals,
	resolveItem,
	createCommercialTables,
	getTemplate,
	getQuotation,
	getSubscription,
};
