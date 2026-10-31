/**
 * Quotation Service Layer
 *
 * Integrates live backend endpoints at http://192.168.0.155:3000:
 *  32. POST  /api/quotations
 *  33. POST  /api/quotations/from-template/{templateId}
 *  34. GET   /api/quotations?page=1&limit=20&status=...&customerId=...
 *  35. GET   /api/quotations/{quotationId}
 *  36. PATCH /api/quotations/{quotationId}
 *  37. POST  /api/quotations/{quotationId}/send
 *  38. POST  /api/quotations/{quotationId}/confirm
 *
 * All live endpoints require a JWT Bearer token (attached automatically by apiClient).
 * Falls back cleanly to localStorage only when the backend host is unreachable offline.
 */

import {
  apiClient,
  isNetworkOfflineError,
  resolveCompanyUserId,
} from '../client.js';
import { rememberKnownCustomer } from '../../services/authService.js';
import { quotationTemplateService } from './quotationTemplateService.js';

const STORAGE_QUOTATIONS_KEY = 'brightloop_quotations_v1';

function getStoredQuotations() {
  try {
    const raw = localStorage.getItem(STORAGE_QUOTATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredQuotations(list) {
  try {
    localStorage.setItem(STORAGE_QUOTATIONS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to persist quotations', err);
  }
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

function buildApiQuotationItem(line) {
  const item = {
    productId: line.productId || line.product_id,
    quantity: Math.max(1, Number(line.quantity) || 1),
    unitPrice: Math.max(0, Number(line.unitPrice ?? line.unit_price) || 0),
    taxes: normalizeTaxesInput(line),
  };
  const variantId = line.variantId || line.variant_id;
  if (variantId) {
    item.variantId = variantId;
  }
  return item;
}

function calculateLocalTotals(items = []) {
  let subtotal = 0;
  let taxTotal = 0;
  const normalizedItems = items.map((item, idx) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Math.max(
      0,
      Number(item.unit_price ?? item.unitPrice ?? 0)
    );
    const taxes = normalizeTaxesInput(item);
    const lineAmount = Math.round(quantity * unitPrice * 100) / 100;
    const taxAmount =
      Math.round(
        taxes.reduce(
          (sum, t) => sum + (lineAmount * (Number(t.rate) || 0)) / 100,
          0
        ) * 100
      ) / 100;
    subtotal += lineAmount;
    taxTotal += taxAmount;
    return {
      id: item.id || `qi_${Date.now()}_${idx}`,
      productId: item.product_id ?? item.productId ?? '',
      variantId: item.variant_id ?? item.variantId ?? '',
      productName: item.product_name ?? item.productName ?? 'Product',
      variantName: item.variant_name ?? item.variantLabel ?? '',
      quantity,
      unitPrice,
      taxes,
      taxAmount,
      lineAmount,
    };
  });

  return {
    items: normalizedItems,
    subtotal: Number(subtotal.toFixed(2)),
    taxTotal: Number(taxTotal.toFixed(2)),
    total: Number((subtotal + taxTotal).toFixed(2)),
  };
}

function normalizeQuotationFromApi(raw) {
  if (!raw) return null;
  if (raw.customer_id !== undefined && raw.customer_id !== null) {
    rememberKnownCustomer({
      id: raw.customer_id,
      customerId: raw.customer_id,
      name: raw.customer_name || `Customer #${raw.customer_id}`,
    });
  }

  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items = rawItems.map((it, idx) => {
    const taxes = Array.isArray(it.taxes)
      ? it.taxes.map((t) => ({
          name: t.name || 'VAT',
          rate: Number(t.rate ?? t.percentage ?? 0),
        }))
      : [];
    const quantity = Number(it.quantity) || 1;
    const unitPrice = Number(it.unit_price ?? it.unitPrice ?? 0);
    const lineAmount = Number(
      it.line_amount ?? it.lineAmount ?? (quantity * unitPrice).toFixed(2)
    );
    const taxAmount = Number(
      it.tax_amount ??
        it.taxAmount ??
        (
          taxes.reduce((s, t) => s + (lineAmount * (Number(t.rate) || 0)) / 100, 0)
        ).toFixed(2)
    );
    return {
      id: it.id || `qi_${idx}`,
      productId: it.product_id ?? it.productId ?? '',
      variantId: it.variant_id ?? it.variantId ?? '',
      productName: it.product_name ?? it.productName ?? 'Product',
      variantName: it.variant_name ?? it.variantName ?? it.variantLabel ?? '',
      quantity,
      unitPrice,
      taxes,
      taxRate: taxes.reduce((s, t) => s + (Number(t.rate) || 0), 0),
      taxAmount,
      lineAmount,
    };
  });

  const expiresAt = raw.expires_at ?? raw.expiresAt ?? null;
  const isExpiredByDate =
    raw.status !== 'confirmed' &&
    expiresAt &&
    new Date(expiresAt).getTime() < Date.now();

  return {
    id: raw.id,
    quotationNumber:
      raw.quotation_number || raw.quotationNumber || `QUO-${String(raw.id).slice(0, 8)}`,
    customerId: raw.customer_id ?? raw.customerId,
    customerName:
      raw.customer_name ||
      raw.customerName ||
      `Customer #${raw.customer_id ?? raw.customerId ?? ''}`,
    planId: raw.plan_id ?? raw.planId ?? '',
    planName: raw.plan_name || raw.planName || 'Subscription Plan',
    templateId: raw.template_id ?? raw.templateId ?? null,
    validityDays: Number(raw.validity_days ?? raw.validityDays ?? 30),
    quotedAt: raw.quoted_at || raw.quotedAt || raw.created_at || new Date().toISOString(),
    expiresAt,
    expiryDate: expiresAt ? String(expiresAt).slice(0, 10) : '',
    paymentTerms: raw.payment_terms ?? raw.paymentTerms ?? 'Net 30',
    status: isExpiredByDate && raw.status !== 'expired' ? 'expired' : raw.status || 'draft',
    rawStatus: raw.status || 'draft',
    subtotal: Number(raw.subtotal ?? 0),
    taxTotal: Number(raw.tax_total ?? raw.taxTotal ?? 0),
    total: Number(raw.total ?? 0),
    items,
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

export const quotationService = {
  /**
   * 34. GET /api/quotations?page=1&limit=20&status=...&customerId=...
   * Hydrates child items via 35. GET /api/quotations/{quotationId}
   */
  async getQuotations(filters = {}, actorUser = null) {
    if (!resolveCompanyUserId(actorUser)) {
      try {
        await apiClient.get('/api/quotations', { actorUser });
      } catch (err) {
        if (isNetworkOfflineError(err) || err.status === 401 || err.status === 403) {
          return getStoredQuotations();
        }
        throw err;
      }
    }

    try {
      const res = await apiClient.get('/api/quotations', {
        actorUser,
        query: {
          page: filters.page || 1,
          limit: Math.min(Number(filters.limit || 50), 100),
          status:
            filters.status && filters.status !== 'all'
              ? filters.status
              : undefined,
          customerId: filters.customerId || undefined,
        },
      });
      const rows = Array.isArray(res) ? res : res?.quotations || [];

      const hydrated = await Promise.all(
        rows.map(async (q) => {
          if (Array.isArray(q.items)) {
            return normalizeQuotationFromApi(q);
          }
          try {
            const detail = await apiClient.get(`/api/quotations/${q.id}`, {
              actorUser,
            });
            return normalizeQuotationFromApi(detail?.quotation || detail);
          } catch {
            return normalizeQuotationFromApi({ ...q, items: [] });
          }
        })
      );

      const clean = hydrated.filter(Boolean);
      if (!filters.status || filters.status === 'all') {
        saveStoredQuotations(clean);
      }
      return clean;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const list = getStoredQuotations();
      return list.filter((q) => {
        if (filters.status && filters.status !== 'all' && q.status !== filters.status) {
          return false;
        }
        if (
          filters.customerId &&
          String(q.customerId) !== String(filters.customerId)
        ) {
          return false;
        }
        return true;
      });
    }
  },

  /**
   * 35. GET /api/quotations/{quotationId}
   */
  async getQuotationById(quotationId, actorUser = null) {
    try {
      const res = await apiClient.get(`/api/quotations/${quotationId}`, {
        actorUser,
      });
      return normalizeQuotationFromApi(res?.quotation || res);
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        if (err.status === 404) return null;
        throw err;
      }
      return getStoredQuotations().find((q) => q.id === quotationId) || null;
    }
  },

  /**
   * 32. POST /api/quotations
   */
  async createQuotation(payload, actorUser = null) {
    const customerIdNum = Number(payload.customerId);
    const validityDays = Math.max(
      0,
      Math.round(Number(payload.validityDays ?? 30))
    );
    const sourceItems = payload.items || payload.lines || [];

    try {
      const body = {
        customerId: Number.isInteger(customerIdNum) && customerIdNum > 0
          ? customerIdNum
          : payload.customerId,
        planId: payload.planId,
        validityDays,
        paymentTerms: payload.paymentTerms || 'Net 30',
        items: sourceItems.map(buildApiQuotationItem),
      };
      const res = await apiClient.post('/api/quotations', body, { actorUser });
      const normalized = normalizeQuotationFromApi(res?.quotation || res);
      saveStoredQuotations([normalized, ...getStoredQuotations()]);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const totals = calculateLocalTotals(sourceItems);
      const exp = new Date();
      exp.setDate(exp.getDate() + validityDays);
      const now = new Date().toISOString();
      const seq = String(getStoredQuotations().length + 1).padStart(6, '0');
      const localQuo = {
        id: `quo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        quotationNumber: `QUO-${now.slice(0, 10).replace(/-/g, '')}-${seq}`,
        customerId: payload.customerId,
        customerName: payload.customerName || `Customer #${payload.customerId}`,
        planId: payload.planId,
        planName: payload.planName || 'Subscription Plan',
        templateId: null,
        validityDays,
        quotedAt: now,
        expiresAt: exp.toISOString(),
        expiryDate: exp.toISOString().slice(0, 10),
        paymentTerms: payload.paymentTerms || 'Net 30',
        status: 'draft',
        rawStatus: 'draft',
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        items: totals.items,
        createdAt: now,
        updatedAt: now,
      };
      saveStoredQuotations([localQuo, ...getStoredQuotations()]);
      return localQuo;
    }
  },

  /**
   * 33. POST /api/quotations/from-template/{templateId}
   *
   * Note: Backend uses `const sourceItems = body.items || template?.items || [];`.
   * We omit `items` when no custom overrides are supplied so `template.items` are copied!
   */
  async createQuotationFromTemplate(templateId, payload = {}, actorUser = null) {
    const customerIdNum = Number(payload.customerId);
    const customItems = payload.items || payload.lines;
    const hasCustomItems = Array.isArray(customItems) && customItems.length > 0;

    try {
      const body = {
        customerId:
          Number.isInteger(customerIdNum) && customerIdNum > 0
            ? customerIdNum
            : payload.customerId,
        paymentTerms: payload.paymentTerms || 'Net 30',
      };
      if (payload.validityDays !== undefined && payload.validityDays !== '') {
        body.validityDays = Math.max(
          0,
          Math.round(Number(payload.validityDays))
        );
      }
      if (hasCustomItems) {
        body.items = customItems.map(buildApiQuotationItem);
      }

      const res = await apiClient.post(
        `/api/quotations/from-template/${templateId}`,
        body,
        { actorUser }
      );
      const normalized = normalizeQuotationFromApi(res?.quotation || res);
      saveStoredQuotations([normalized, ...getStoredQuotations()]);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const tmpl = await quotationTemplateService.getTemplateById(
        templateId,
        actorUser
      );
      if (!tmpl) {
        throw new Error('Quotation template not found.');
      }
      const validityDays = Number(
        payload.validityDays ?? tmpl.validityDays ?? 30
      );
      const totals = calculateLocalTotals(
        hasCustomItems ? customItems : tmpl.lines || []
      );
      const exp = new Date();
      exp.setDate(exp.getDate() + validityDays);
      const now = new Date().toISOString();
      const seq = String(getStoredQuotations().length + 1).padStart(6, '0');
      const localQuo = {
        id: `quo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        quotationNumber: `QUO-${now.slice(0, 10).replace(/-/g, '')}-${seq}`,
        customerId: payload.customerId,
        customerName: payload.customerName || `Customer #${payload.customerId}`,
        planId: tmpl.planId,
        planName: tmpl.planName || 'Subscription Plan',
        templateId: tmpl.id,
        validityDays,
        quotedAt: now,
        expiresAt: exp.toISOString(),
        expiryDate: exp.toISOString().slice(0, 10),
        paymentTerms: payload.paymentTerms || tmpl.paymentTerms || 'Net 30',
        status: 'draft',
        rawStatus: 'draft',
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        items: totals.items,
        createdAt: now,
        updatedAt: now,
      };
      saveStoredQuotations([localQuo, ...getStoredQuotations()]);
      return localQuo;
    }
  },

  /**
   * 36. PATCH /api/quotations/{quotationId} (Update draft quotation)
   */
  async updateQuotation(quotationId, updates = {}, actorUser = null) {
    try {
      const body = {};
      if (updates.paymentTerms !== undefined) {
        body.paymentTerms = updates.paymentTerms;
      }
      if (updates.validityDays !== undefined) {
        body.validityDays = Math.max(
          0,
          Math.round(Number(updates.validityDays))
        );
      }
      const res = await apiClient.patch(
        `/api/quotations/${quotationId}`,
        body,
        { actorUser }
      );
      const normalized = normalizeQuotationFromApi(res?.quotation || res);
      saveStoredQuotations(
        getStoredQuotations().map((q) =>
          q.id === quotationId ? normalized : q
        )
      );
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const list = getStoredQuotations();
      const idx = list.findIndex((q) => q.id === quotationId);
      if (idx === -1) throw new Error('Quotation not found.');
      if (list[idx].status !== 'draft') {
        throw new Error('Only draft quotations can be updated.');
      }
      const nextValidity =
        updates.validityDays !== undefined
          ? Math.max(0, Math.round(Number(updates.validityDays)))
          : list[idx].validityDays;
      const exp = new Date(list[idx].quotedAt || Date.now());
      exp.setDate(exp.getDate() + nextValidity);
      list[idx] = {
        ...list[idx],
        paymentTerms:
          updates.paymentTerms !== undefined
            ? updates.paymentTerms
            : list[idx].paymentTerms,
        validityDays: nextValidity,
        expiresAt: exp.toISOString(),
        expiryDate: exp.toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      };
      saveStoredQuotations(list);
      return list[idx];
    }
  },

  /**
   * 37. POST /api/quotations/{quotationId}/send
   */
  async sendQuotation(quotationId, actorUser = null) {
    try {
      const res = await apiClient.post(
        `/api/quotations/${quotationId}/send`,
        undefined,
        { actorUser }
      );
      const normalized = normalizeQuotationFromApi(res?.quotation || res);
      saveStoredQuotations(
        getStoredQuotations().map((q) =>
          q.id === quotationId ? normalized : q
        )
      );
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const list = getStoredQuotations();
      const idx = list.findIndex((q) => q.id === quotationId);
      if (idx === -1) throw new Error('Quotation not found.');
      list[idx] = {
        ...list[idx],
        status: 'sent',
        rawStatus: 'sent',
        updatedAt: new Date().toISOString(),
      };
      saveStoredQuotations(list);
      return list[idx];
    }
  },

  /**
   * 38. POST /api/quotations/{quotationId}/confirm
   */
  async confirmQuotation(quotationId, actorUser = null) {
    try {
      const res = await apiClient.post(
        `/api/quotations/${quotationId}/confirm`,
        undefined,
        { actorUser }
      );
      const normalized = normalizeQuotationFromApi(res?.quotation || res);
      saveStoredQuotations(
        getStoredQuotations().map((q) =>
          q.id === quotationId ? normalized : q
        )
      );
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const list = getStoredQuotations();
      const idx = list.findIndex((q) => q.id === quotationId);
      if (idx === -1) throw new Error('Quotation not found.');
      if (
        list[idx].expiresAt &&
        new Date(list[idx].expiresAt).getTime() < Date.now()
      ) {
        throw new Error('Quotation is expired or not found');
      }
      list[idx] = {
        ...list[idx],
        status: 'confirmed',
        rawStatus: 'confirmed',
        updatedAt: new Date().toISOString(),
      };
      saveStoredQuotations(list);
      return list[idx];
    }
  },
};

