/**
 * Quotation Template Service Layer
 *
 * Integrates live backend endpoints at http://192.168.0.155:3000:
 *  24. POST   /api/quotation-templates
 *  25. GET    /api/quotation-templates?active=true
 *  26. GET    /api/quotation-templates/{templateId}
 *  27. PATCH  /api/quotation-templates/{templateId}
 *  28. DELETE /api/quotation-templates/{templateId}
 *  29. POST   /api/quotation-templates/{templateId}/items
 *  30. PATCH  /api/quotation-templates/{templateId}/items/{itemId}
 *  31. DELETE /api/quotation-templates/{templateId}/items/{itemId}
 *
 * All live endpoints require a JWT Bearer token (attached automatically by apiClient).
 * Falls back cleanly to localStorage only when the backend host is unreachable offline.
 */

import {
  apiClient,
  isNetworkOfflineError,
  isUuid,
  resolveCompanyUserId,
} from '../client.js';

const STORAGE_KEY = 'brightloop_quotation_templates_v1';
const TEMPLATE_META_KEY = 'brightloop_quotation_template_meta_v1';

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
    active: true,
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
        taxes: [{ name: 'GST', rate: 18 }],
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
        taxes: [{ name: 'GST', rate: 18 }],
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
        taxes: [{ name: 'GST', rate: 18 }],
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
    active: true,
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
        taxes: [{ name: 'GST', rate: 18 }],
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
        taxes: [{ name: 'GST', rate: 18 }],
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
    active: true,
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
        taxes: [{ name: 'GST', rate: 18 }],
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

function getTemplateMetaMap() {
  try {
    const raw = localStorage.getItem(TEMPLATE_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveTemplateMeta(templateId, meta) {
  if (!templateId) return;
  try {
    const map = getTemplateMetaMap();
    map[templateId] = { ...(map[templateId] || {}), ...meta };
    localStorage.setItem(TEMPLATE_META_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function getCachedCatalogLookups() {
  let products = [];
  let plans = [];
  try {
    const rawProds = localStorage.getItem('brightloop_products');
    if (rawProds) products = JSON.parse(rawProds) || [];
  } catch {
    products = [];
  }
  try {
    const rawPlans = localStorage.getItem('brightloop_plans');
    if (rawPlans) plans = JSON.parse(rawPlans) || [];
  } catch {
    plans = [];
  }
  return { products, plans };
}

function normalizeTaxesInput(line) {
  if (Array.isArray(line?.taxes) && line.taxes.length > 0) {
    return line.taxes.map((t) => ({
      name: String(t.name || 'VAT').trim() || 'VAT',
      rate: Math.max(0, Number(t.rate ?? t.percentage ?? 0)),
    }));
  }
  if (line?.taxRate !== undefined && line?.taxRate !== '' && line?.taxRate !== null) {
    const rate = Math.max(0, Number(line.taxRate) || 0);
    return rate > 0
      ? [{ name: String(line.taxName || 'VAT').trim() || 'VAT', rate }]
      : [];
  }
  return [{ name: 'VAT', rate: 18 }];
}

function buildApiItemBody(line) {
  const body = {
    productId: line.productId || line.product_id,
    quantity: Math.max(1, Number(line.quantity) || 1),
    unitPrice: Math.max(0, Number(line.unitPrice ?? line.unit_price) || 0),
    taxes: normalizeTaxesInput(line),
  };
  const variantId = line.variantId || line.variant_id;
  if (variantId) {
    body.variantId = variantId;
  }
  return body;
}

function normalizeTemplateItemFromApi(rawItem, products = [], idx = 0) {
  const productId = rawItem.product_id ?? rawItem.productId ?? '';
  const variantId = rawItem.variant_id ?? rawItem.variantId ?? '';
  const matchedProd = products.find((p) => p.id === productId);
  const matchedVar = matchedProd?.variants?.find((v) => v.id === variantId);

  const taxes = Array.isArray(rawItem.taxes)
    ? rawItem.taxes.map((t) => ({
        name: t.name || 'VAT',
        rate: Number(t.rate ?? t.percentage ?? 0),
      }))
    : [];

  return {
    id: rawItem.id || `tline_${Date.now()}_${idx}`,
    productId,
    productName:
      rawItem.product_name ||
      rawItem.productName ||
      matchedProd?.name ||
      'Catalog Product',
    variantId: variantId || '',
    variantLabel:
      rawItem.variant_name ||
      rawItem.variantLabel ||
      (matchedVar ? `${matchedVar.attribute}: ${matchedVar.value}` : ''),
    variantExtraPrice: Number(
      rawItem.variantExtraPrice ?? matchedVar?.extraPrice ?? 0
    ),
    quantity: Number(rawItem.quantity) || 1,
    unitPrice: Number(rawItem.unit_price ?? rawItem.unitPrice ?? 0),
    taxes,
    taxRate: taxes.reduce((s, t) => s + (Number(t.rate) || 0), 0),
    taxName: taxes[0]?.name || 'VAT',
  };
}

function normalizeTemplateFromApi(rawTemplate) {
  if (!rawTemplate) return null;
  const { products, plans } = getCachedCatalogLookups();
  const metaMap = getTemplateMetaMap();
  const meta = metaMap[rawTemplate.id] || {};
  const planId = rawTemplate.plan_id ?? rawTemplate.planId ?? '';
  const matchedPlan = plans.find((p) => p.id === planId);

  const rawItems = Array.isArray(rawTemplate.items)
    ? rawTemplate.items
    : Array.isArray(rawTemplate.lines)
    ? rawTemplate.lines
    : [];
  const lines = rawItems.map((item, idx) =>
    normalizeTemplateItemFromApi(item, products, idx)
  );

  return {
    id: rawTemplate.id,
    name: rawTemplate.name || '',
    planId,
    planName:
      rawTemplate.plan_name ||
      rawTemplate.planName ||
      matchedPlan?.name ||
      meta.planName ||
      'Subscription Plan',
    billingPeriod:
      rawTemplate.billingPeriod ||
      matchedPlan?.billingPeriod ||
      meta.billingPeriod ||
      'monthly',
    validityDays: Number(
      rawTemplate.validity_days ?? rawTemplate.validityDays ?? 30
    ),
    paymentTerms:
      rawTemplate.paymentTerms || meta.paymentTerms || 'Net 30',
    notes: rawTemplate.notes ?? meta.notes ?? '',
    active: rawTemplate.active !== false,
    lines,
    items: lines,
    createdAt:
      rawTemplate.created_at ||
      rawTemplate.createdAt ||
      new Date().toISOString(),
    updatedAt:
      rawTemplate.updated_at ||
      rawTemplate.updatedAt ||
      new Date().toISOString(),
  };
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
  /**
   * 25. GET /api/quotation-templates?active=true
   * Hydrates child items via 26. GET /api/quotation-templates/{templateId}
   */
  async getTemplates(filters = {}, actorUser = null) {
    const activeFilter =
      filters.active !== undefined ? Boolean(filters.active) : true;

    if (!resolveCompanyUserId(actorUser)) {
      // Customer sessions or unauthenticated offline sessions fall back to cached templates
      try {
        await apiClient.get('/api/quotation-templates', {
          actorUser,
          query:
            filters.active !== undefined
              ? { active: String(activeFilter) }
              : { active: 'true' },
        });
      } catch (err) {
        if (isNetworkOfflineError(err) || err.status === 401 || err.status === 403) {
          return getStoredTemplates();
        }
        throw err;
      }
    }

    try {
      const listRes = await apiClient.get('/api/quotation-templates', {
        actorUser,
        query:
          filters.active === 'all'
            ? undefined
            : { active: String(activeFilter) },
      });
      const rows = Array.isArray(listRes)
        ? listRes
        : listRes?.templates || [];

      const hydrated = await Promise.all(
        rows.map(async (tmpl) => {
          if (Array.isArray(tmpl.items)) {
            return normalizeTemplateFromApi(tmpl);
          }
          try {
            const detail = await apiClient.get(
              `/api/quotation-templates/${tmpl.id}`,
              { actorUser }
            );
            return normalizeTemplateFromApi(detail?.template || detail);
          } catch {
            return normalizeTemplateFromApi({ ...tmpl, items: [] });
          }
        })
      );

      const clean = hydrated.filter(Boolean);
      saveStoredTemplates(clean);
      return clean;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      return getStoredTemplates();
    }
  },

  /**
   * 26. GET /api/quotation-templates/{templateId}
   */
  async getTemplateById(templateId, actorUser = null) {
    try {
      const res = await apiClient.get(
        `/api/quotation-templates/${templateId}`,
        { actorUser }
      );
      return normalizeTemplateFromApi(res?.template || res);
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        if (err.status === 404) return null;
        throw err;
      }
      return getStoredTemplates().find((t) => t.id === templateId) || null;
    }
  },

  /**
   * 24. POST /api/quotation-templates
   */
  async createTemplate(payload, actorUser = null) {
    const name = (payload.name || '').trim();
    if (!name) {
      throw new Error('Template name is required.');
    }
    if (!payload.planId) {
      throw new Error('A subscription plan must be linked to the template.');
    }
    const validityDays = Math.max(0, Math.round(Number(payload.validityDays) || 30));
    const sourceLines = payload.items || payload.lines || [];
    if (!Array.isArray(sourceLines) || sourceLines.length === 0) {
      throw new Error('Add at least one product line to the quotation template.');
    }

    try {
      const apiBody = {
        name,
        planId: payload.planId,
        validityDays,
        items: sourceLines.map(buildApiItemBody),
      };
      const res = await apiClient.post('/api/quotation-templates', apiBody, {
        actorUser,
      });
      const rawTmpl = res?.template || res;
      if (rawTmpl?.id) {
        saveTemplateMeta(rawTmpl.id, {
          planName: payload.planName || '',
          billingPeriod: payload.billingPeriod || 'monthly',
          paymentTerms: payload.paymentTerms || 'Net 30',
          notes: (payload.notes || '').trim(),
        });
      }
      const normalized = normalizeTemplateFromApi(rawTmpl);
      const cached = getStoredTemplates().filter((t) => isUuid(t.id));
      saveStoredTemplates([normalized, ...cached]);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const templates = getStoredTemplates();
      const now = new Date().toISOString();
      const created = {
        id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name,
        planId: payload.planId,
        planName: payload.planName || 'Subscription Plan',
        billingPeriod: payload.billingPeriod || 'monthly',
        validityDays: Math.max(1, validityDays),
        paymentTerms: payload.paymentTerms || 'Net 15',
        notes: (payload.notes || '').trim(),
        active: true,
        lines: sourceLines.map((l, idx) => {
          const taxes = normalizeTaxesInput(l);
          return {
            id: l.id || `tline_${Date.now()}_${idx}`,
            productId: l.productId || '',
            productName: l.productName || 'Product',
            variantId: l.variantId || '',
            variantLabel: l.variantLabel || '',
            variantExtraPrice: Number(l.variantExtraPrice) || 0,
            quantity: Math.max(1, Number(l.quantity) || 1),
            unitPrice: Math.max(0, Number(l.unitPrice) || 0),
            taxes,
            taxRate: taxes.reduce((s, t) => s + (Number(t.rate) || 0), 0),
            taxName: taxes[0]?.name || 'VAT',
          };
        }),
        createdAt: now,
        updatedAt: now,
      };

      templates.unshift(created);
      saveStoredTemplates(templates);
      return created;
    }
  },

  /**
   * 27. PATCH /api/quotation-templates/{templateId}
   * Reconciles line items via:
   *  29. POST   /api/quotation-templates/{templateId}/items
   *  30. PATCH  /api/quotation-templates/{templateId}/items/{itemId}
   *  31. DELETE /api/quotation-templates/{templateId}/items/{itemId}
   */
  async updateTemplate(id, payload, actorUser = null) {
    const sourceLines = payload.items || payload.lines;
    if (sourceLines !== undefined && (!Array.isArray(sourceLines) || sourceLines.length === 0)) {
      throw new Error('Template must include at least one product line.');
    }

    try {
      const patchBody = {};
      if (payload.name !== undefined) patchBody.name = String(payload.name).trim();
      if (payload.planId !== undefined) patchBody.planId = payload.planId;
      if (payload.validityDays !== undefined) {
        patchBody.validityDays = Math.max(
          0,
          Math.round(Number(payload.validityDays) || 0)
        );
      }
      if (payload.active !== undefined) {
        patchBody.active = Boolean(payload.active);
      }

      const patchRes = await apiClient.patch(
        `/api/quotation-templates/${id}`,
        patchBody,
        { actorUser }
      );
      const currentRaw = patchRes?.template || patchRes;

      saveTemplateMeta(id, {
        ...(payload.planName ? { planName: payload.planName } : {}),
        ...(payload.billingPeriod ? { billingPeriod: payload.billingPeriod } : {}),
        ...(payload.paymentTerms !== undefined
          ? { paymentTerms: payload.paymentTerms }
          : {}),
        ...(payload.notes !== undefined
          ? { notes: String(payload.notes).trim() }
          : {}),
      });

      if (Array.isArray(sourceLines)) {
        const existingItems = Array.isArray(currentRaw?.items)
          ? currentRaw.items
          : [];
        const existingById = new Map(existingItems.map((it) => [it.id, it]));
        const retainedExistingIds = new Set();

        for (const line of sourceLines) {
          const existing =
            line.id && isUuid(line.id) ? existingById.get(line.id) : null;
          const nextProductId = line.productId || line.product_id;
          const nextVariantId = line.variantId || line.variant_id || null;

          if (
            existing &&
            existing.product_id === nextProductId &&
            (existing.variant_id || null) === nextVariantId
          ) {
            retainedExistingIds.add(existing.id);
            await apiClient.patch(
              `/api/quotation-templates/${id}/items/${existing.id}`,
              {
                quantity: Math.max(1, Number(line.quantity) || 1),
                unitPrice: Math.max(
                  0,
                  Number(line.unitPrice ?? line.unit_price) || 0
                ),
                taxes: normalizeTaxesInput(line),
              },
              { actorUser }
            );
          } else {
            await apiClient.post(
              `/api/quotation-templates/${id}/items`,
              buildApiItemBody(line),
              { actorUser }
            );
          }
        }

        for (const oldItem of existingItems) {
          if (!retainedExistingIds.has(oldItem.id)) {
            await apiClient.delete(
              `/api/quotation-templates/${id}/items/${oldItem.id}`,
              { actorUser }
            );
          }
        }
      }

      const refreshed = await this.getTemplateById(id, actorUser);
      saveStoredTemplates(
        getStoredTemplates().map((t) => (t.id === id ? refreshed : t))
      );
      return refreshed;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const templates = getStoredTemplates();
      const idx = templates.findIndex((t) => t.id === id);
      if (idx === -1) {
        throw new Error('Quotation template not found.');
      }

      const name = (payload.name ?? templates[idx].name ?? '').trim();
      if (!name) {
        throw new Error('Template name is required.');
      }

      const linesToSave = sourceLines || templates[idx].lines || [];
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
        lines: linesToSave.map((l, i) => {
          const taxes = normalizeTaxesInput(l);
          return {
            id: l.id || `tline_${Date.now()}_${i}`,
            productId: l.productId || '',
            productName: l.productName || 'Product',
            variantId: l.variantId || '',
            variantLabel: l.variantLabel || '',
            variantExtraPrice: Number(l.variantExtraPrice) || 0,
            quantity: Math.max(1, Number(l.quantity) || 1),
            unitPrice: Math.max(0, Number(l.unitPrice) || 0),
            taxes,
            taxRate: taxes.reduce((s, t) => s + (Number(t.rate) || 0), 0),
            taxName: taxes[0]?.name || 'VAT',
          };
        }),
        updatedAt: new Date().toISOString(),
      };

      templates[idx] = updated;
      saveStoredTemplates(templates);
      return updated;
    }
  },

  /**
   * 28. DELETE /api/quotation-templates/{templateId} (Archives template)
   */
  async deleteTemplate(id, actorUser = null) {
    try {
      await apiClient.delete(`/api/quotation-templates/${id}`, { actorUser });
      saveStoredTemplates(getStoredTemplates().filter((t) => t.id !== id));
      return { success: true };
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const templates = getStoredTemplates();
      saveStoredTemplates(templates.filter((t) => t.id !== id));
      return { success: true };
    }
  },

  /**
   * 29. POST /api/quotation-templates/{templateId}/items
   */
  async addTemplateItem(templateId, itemData, actorUser = null) {
    const res = await apiClient.post(
      `/api/quotation-templates/${templateId}/items`,
      buildApiItemBody(itemData),
      { actorUser }
    );
    const { products } = getCachedCatalogLookups();
    return normalizeTemplateItemFromApi(res?.item || res, products);
  },

  /**
   * 30. PATCH /api/quotation-templates/{templateId}/items/{itemId}
   */
  async updateTemplateItem(templateId, itemId, itemData, actorUser = null) {
    const body = {};
    if (itemData.quantity !== undefined) {
      body.quantity = Math.max(1, Number(itemData.quantity) || 1);
    }
    if (itemData.unitPrice !== undefined) {
      body.unitPrice = Math.max(0, Number(itemData.unitPrice) || 0);
    }
    if (itemData.taxes !== undefined || itemData.taxRate !== undefined) {
      body.taxes = normalizeTaxesInput(itemData);
    }
    const res = await apiClient.patch(
      `/api/quotation-templates/${templateId}/items/${itemId}`,
      body,
      { actorUser }
    );
    const { products } = getCachedCatalogLookups();
    return normalizeTemplateItemFromApi(res?.item || res, products);
  },

  /**
   * 31. DELETE /api/quotation-templates/{templateId}/items/{itemId}
   */
  async removeTemplateItem(templateId, itemId, actorUser = null) {
    return apiClient.delete(
      `/api/quotation-templates/${templateId}/items/${itemId}`,
      { actorUser }
    );
  },
};
