/**
 * Quotation Template Service Layer
 *
 * Allows administrators to define reusable quotation templates with a pre-selected
 * subscription plan, validity period (days), default payment terms, and product lines
 * so sales reps can prepare customer offers without building them from scratch.
 */

const STORAGE_KEY = 'brightloop_quotation_templates_v1';

const SEED_TEMPLATES = [
  {
    id: 'tmpl_large_customer_30d',
    name: 'Large Customer Growth Suite Offer',
    planId: 'plan_pro_monthly',
    planName: 'Brightloop Pro Growth',
    billingPeriod: 'monthly',
    validityDays: 30,
    paymentTerms: 'Net 30',
    notes: 'Multi-product enterprise quotation valid for 30 days',
    lines: [
      {
        id: 'tline_lrg_1',
        productId: 'prod_core_01',
        productName: 'Brightloop Core Recurring Engine',
        variantId: 'var_odoo_01',
        variantLabel: 'Brand: Odoo Edition',
        variantExtraPrice: 560,
        quantity: 5,
        unitPrice: 2120,
      },
      {
        id: 'tline_lrg_2',
        productId: 'prod_analytics_02',
        productName: 'Advanced Revenue Analytics & Reporting',
        variantId: 'var_tier_pro',
        variantLabel: 'Tier: Pro Suite',
        variantExtraPrice: 150,
        quantity: 5,
        unitPrice: 500,
      },
      {
        id: 'tline_lrg_3',
        productId: 'prod_storage_03',
        productName: 'Encrypted Document & Invoice Storage',
        variantId: 'var_storage_100',
        variantLabel: 'Capacity: 100 GB',
        variantExtraPrice: 100,
        quantity: 1,
        unitPrice: 299,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_enterprise_30d',
    name: 'Enterprise Annual Fixed-Term Offer',
    planId: 'plan_enterprise_annual',
    planName: 'Enterprise Annual Suite',
    billingPeriod: 'yearly',
    validityDays: 30,
    paymentTerms: 'Net 30',
    notes: 'Annual fixed-term enterprise package valid for 30 days',
    lines: [
      {
        id: 'tline_ent_1',
        productId: 'prod_core_01',
        productName: 'Brightloop Core Recurring Engine',
        variantId: 'var_odoo_01',
        variantLabel: 'Brand: Odoo Edition',
        variantExtraPrice: 560,
        quantity: 5,
        unitPrice: 15460,
      },
      {
        id: 'tline_ent_2',
        productId: 'prod_analytics_02',
        productName: 'Advanced Revenue Analytics & Reporting',
        variantId: 'var_tier_pro',
        variantLabel: 'Tier: Pro Suite',
        variantExtraPrice: 150,
        quantity: 5,
        unitPrice: 500,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl_starter_7d',
    name: 'Starter Onboarding Quote',
    planId: 'plan_starter_monthly',
    planName: 'Starter Business Monthly',
    billingPeriod: 'monthly',
    validityDays: 7,
    paymentTerms: 'Due on receipt',
    notes: 'Fast-track 7-day starter quotation',
    lines: [
      {
        id: 'tline_start_1',
        productId: 'prod_analytics_02',
        productName: 'Advanced Revenue Analytics & Reporting',
        variantId: 'var_tier_std',
        variantLabel: 'Tier: Basic Metrics',
        variantExtraPrice: 0,
        quantity: 1,
        unitPrice: 499,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getStoredTemplates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_TEMPLATES));
      return [...SEED_TEMPLATES];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...SEED_TEMPLATES];
  } catch {
    return [...SEED_TEMPLATES];
  }
}

function saveStoredTemplates(templates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (err) {
    console.error('Failed to persist quotation templates', err);
  }
}

export function computeExpiryFromValidity(startDateStr, validityDays = 15) {
  const base = startDateStr
    ? new Date(`${startDateStr}T00:00:00Z`)
    : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + Math.max(1, Number(validityDays) || 15));
  return d.toISOString().slice(0, 10);
}

export const quotationTemplateService = {
  async getTemplates() {
    await new Promise((r) => setTimeout(r, 50));
    return getStoredTemplates();
  },

  async createTemplate(payload) {
    await new Promise((r) => setTimeout(r, 80));
    const name = (payload.name || '').trim();
    if (!name) {
      throw new Error('Template name is required.');
    }
    if (!payload.planId) {
      throw new Error('A subscription plan must be linked to the template.');
    }
    const validityDays = Math.max(1, Number(payload.validityDays) || 15);
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new Error('Add at least one product line to the quotation template.');
    }

    const templates = getStoredTemplates();
    const now = new Date().toISOString();
    const created = {
      id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      planId: payload.planId,
      planName: payload.planName || 'Subscription Plan',
      billingPeriod: payload.billingPeriod || 'monthly',
      validityDays,
      paymentTerms: payload.paymentTerms || 'Net 15',
      notes: (payload.notes || '').trim(),
      lines: payload.lines.map((l, idx) => ({
        id: l.id || `tline_${Date.now()}_${idx}`,
        productId: l.productId || '',
        productName: l.productName || 'Product',
        variantId: l.variantId || '',
        variantLabel: l.variantLabel || '',
        variantExtraPrice: Number(l.variantExtraPrice) || 0,
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
      })),
      createdAt: now,
      updatedAt: now,
    };

    templates.unshift(created);
    saveStoredTemplates(templates);
    return created;
  },

  async updateTemplate(id, payload) {
    await new Promise((r) => setTimeout(r, 80));
    const templates = getStoredTemplates();
    const idx = templates.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error('Quotation template not found.');
    }

    const name = (payload.name ?? templates[idx].name ?? '').trim();
    if (!name) {
      throw new Error('Template name is required.');
    }
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new Error('Template must include at least one product line.');
    }

    const updated = {
      ...templates[idx],
      name,
      planId: payload.planId || templates[idx].planId,
      planName: payload.planName || templates[idx].planName,
      billingPeriod: payload.billingPeriod || templates[idx].billingPeriod,
      validityDays: Math.max(
        1,
        Number(payload.validityDays ?? templates[idx].validityDays) || 15
      ),
      paymentTerms: payload.paymentTerms || templates[idx].paymentTerms,
      notes:
        payload.notes !== undefined
          ? payload.notes.trim()
          : templates[idx].notes,
      lines: payload.lines.map((l, i) => ({
        id: l.id || `tline_${Date.now()}_${i}`,
        productId: l.productId || '',
        productName: l.productName || 'Product',
        variantId: l.variantId || '',
        variantLabel: l.variantLabel || '',
        variantExtraPrice: Number(l.variantExtraPrice) || 0,
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
      })),
      updatedAt: new Date().toISOString(),
    };

    templates[idx] = updated;
    saveStoredTemplates(templates);
    return updated;
  },

  async deleteTemplate(id) {
    await new Promise((r) => setTimeout(r, 60));
    const templates = getStoredTemplates();
    saveStoredTemplates(templates.filter((t) => t.id !== id));
    return { success: true };
  },
};
