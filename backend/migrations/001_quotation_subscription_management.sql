-- Run after the existing users, products, product_variants, subscription_plans,
-- subscriptions and company_users tables have been created.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
	status VARCHAR(20) NOT NULL
		CHECK (status IN ('draft', 'quotation', 'confirmed', 'active', 'closed')),
	changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	changed_by INTEGER REFERENCES company_users(id) ON DELETE SET NULL
);

ALTER TABLE subscriptions
	ADD COLUMN IF NOT EXISTS subscription_number TEXT,
	ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
	ADD COLUMN IF NOT EXISTS start_date DATE,
	ADD COLUMN IF NOT EXISTS expiry_date DATE,
	ADD COLUMN IF NOT EXISTS payment_terms TEXT,
	ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS total NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE subscriptions
SET subscription_number = 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
	lpad(nextval('commercial_number_seq')::text, 6, '0')
WHERE subscription_number IS NULL;

ALTER TABLE subscriptions ALTER COLUMN subscription_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_number_uidx
	ON subscriptions(subscription_number);
CREATE INDEX IF NOT EXISTS quotation_templates_active_idx
	ON quotation_templates(active);
CREATE INDEX IF NOT EXISTS quotations_customer_status_idx
	ON quotations(customer_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_customer_status_idx
	ON subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_plan_idx
	ON subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS subscription_history_subscription_idx
	ON subscription_status_history(subscription_id, changed_at);
