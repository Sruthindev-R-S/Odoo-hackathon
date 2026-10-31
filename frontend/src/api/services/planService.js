/**
 * Subscription Plan Service Layer
 *
 * Integrates live backend endpoints at http://192.168.0.155:3000:
 *  18. POST   /api/plans                 (Authorization: Bearer admin JWT)
 *  19. GET    /api/plans                 (?page, ?limit, ?billingFrequency, ?active, ?search)
 *  20. GET    /api/plans/{planId}
 *  21. PATCH  /api/plans/{planId}        (Authorization: Bearer admin JWT)
 *  22. DELETE /api/plans/{planId}       (Authorization: Bearer admin JWT)
 *  23. PATCH  /api/plans/{planId}/status (Authorization: Bearer admin JWT, { active })
 */

import { apiClient, isNetworkOfflineError, isUuid } from '../client.js';

const STORAGE_KEY = 'brightloop_plans';
const PLAN_PRODUCT_MAP_KEY = 'brightloop_plan_product_map_v1';

const SEED_PLANS = [
  {
    id: 'plan_pro_monthly',
    name: 'Brightloop Pro Growth',
    productId: 'prod_core_01',
    productName: 'Brightloop Core Recurring Engine',
    price: 1560,
    billingPeriod: 'monthly',
    minQuantity: 1,
    availableFrom: '2026-01-01',
    availableTo: '2026-12-31',
    autoClose: 'none',
    autoCloseOnEnd: false,
    allowEarlyClose: true,
    allowPause: true,
    allowRenewal: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan_enterprise_annual',
    name: 'Enterprise Annual Suite',
    productId: 'prod_core_01',
    productName: 'Brightloop Core Recurring Engine',
    price: 14900,
    billingPeriod: 'yearly',
    minQuantity: 2,
    availableFrom: '2026-01-01',
    availableTo: '2027-12-31',
    autoClose: 'end_of_term',
    autoCloseOnEnd: true,
    allowEarlyClose: false,
    allowPause: true,
    allowRenewal: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'plan_starter_monthly',
    name: 'Starter Business Monthly',
    productId: 'prod_analytics_02',
    productName: 'Advanced Revenue Analytics & Reporting',
    price: 499,
    billingPeriod: 'monthly',
    minQuantity: 1,
    availableFrom: '2026-01-01',
    availableTo: '2026-12-31',
    autoClose: 'none',
    autoCloseOnEnd: false,
    allowEarlyClose: true,
    allowPause: true,
    allowRenewal: true,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getStoredPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_PLANS));
      return SEED_PLANS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_PLANS;
  } catch {
    return SEED_PLANS;
  }
}

function setStoredPlans(plans) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Failed to persist plans to storage', err);
  }
}

function getPlanProductMap() {
  try {
    const raw = localStorage.getItem(PLAN_PRODUCT_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePlanProductAssociation(planId, productId, productName) {
  if (!planId) return;
  try {
    const map = getPlanProductMap();
    if (productId) {
      map[planId] = { productId, productName: productName || '' };
    } else {
      delete map[planId];
    }
    localStorage.setItem(PLAN_PRODUCT_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function toIsoDateOnly(val) {
  if (!val) return null;
  const s = String(val);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizePlanFromApi(raw) {
  if (!raw) return null;
  const assocMap = getPlanProductMap();
  const assoc = assocMap[raw.id] || {};
  const autoClosePolicy =
    raw.auto_close ??
    raw.autoClose ??
    (raw.autoCloseOnEnd ? 'end_of_term' : 'none');

  return {
    id: raw.id,
    name: raw.name || '',
    productId: raw.productId || assoc.productId || '',
    productName: raw.productName || assoc.productName || '',
    price: Number(raw.price ?? 0),
    billingPeriod: raw.billing_frequency ?? raw.billingFrequency ?? raw.billingPeriod ?? 'monthly',
    billingFrequency:
      raw.billing_frequency ?? raw.billingFrequency ?? raw.billingPeriod ?? 'monthly',
    minQuantity: Number(raw.minimum_quantity ?? raw.minimumQuantity ?? raw.minQuantity ?? 1),
    availableFrom: toIsoDateOnly(raw.available_from ?? raw.availableFrom),
    availableTo: toIsoDateOnly(raw.available_until ?? raw.availableUntil ?? raw.availableTo),
    autoClose: autoClosePolicy,
    autoCloseOnEnd:
      autoClosePolicy === 'end_of_term' || autoClosePolicy === 'immediate',
    allowEarlyClose: Boolean(raw.allow_early_close ?? raw.allowEarlyClose),
    allowPause: Boolean(raw.allow_pause ?? raw.allowPause),
    allowRenewal:
      raw.allow_renew !== undefined
        ? Boolean(raw.allow_renew)
        : raw.allowRenew !== undefined
        ? Boolean(raw.allowRenew)
        : raw.allowRenewal !== undefined
        ? Boolean(raw.allowRenewal)
        : true,
    active: raw.active !== false,
    isActive: raw.active !== false,
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

function buildPlanApiPayload(planData, partial = false) {
  const payload = {};
  if (!partial || planData.name !== undefined) {
    payload.name = String(planData.name || '').trim();
  }
  if (!partial || planData.price !== undefined) {
    payload.price = Number(planData.price) || 0;
  }
  if (
    !partial ||
    planData.billingPeriod !== undefined ||
    planData.billingFrequency !== undefined
  ) {
    payload.billingFrequency =
      planData.billingFrequency || planData.billingPeriod || 'monthly';
  }
  if (
    !partial ||
    planData.minQuantity !== undefined ||
    planData.minimumQuantity !== undefined
  ) {
    payload.minimumQuantity = Math.max(
      1,
      Math.round(Number(planData.minimumQuantity ?? planData.minQuantity) || 1)
    );
  }
  if (!partial || planData.availableFrom !== undefined) {
    payload.availableFrom = planData.availableFrom
      ? String(planData.availableFrom).slice(0, 10)
      : null;
  }
  if (
    !partial ||
    planData.availableTo !== undefined ||
    planData.availableUntil !== undefined
  ) {
    const untilVal = planData.availableUntil ?? planData.availableTo;
    payload.availableUntil = untilVal ? String(untilVal).slice(0, 10) : null;
  }
  if (
    !partial ||
    planData.autoClose !== undefined ||
    planData.autoCloseOnEnd !== undefined
  ) {
    payload.autoClose =
      planData.autoClose ||
      (planData.autoCloseOnEnd ? 'end_of_term' : 'none');
  }
  if (!partial || planData.allowEarlyClose !== undefined) {
    payload.allowEarlyClose = Boolean(planData.allowEarlyClose);
  }
  if (!partial || planData.allowPause !== undefined) {
    payload.allowPause = Boolean(planData.allowPause);
  }
  if (
    !partial ||
    planData.allowRenewal !== undefined ||
    planData.allowRenew !== undefined
  ) {
    payload.allowRenew = Boolean(
      planData.allowRenew ?? planData.allowRenewal ?? true
    );
  }
  return payload;
}

export const planService = {
  /**
   * 19. GET /api/plans (?page, ?limit, ?billingFrequency, ?active, ?search)
   */
  async getPlans(filters = {}) {
    try {
      const res = await apiClient.get('/api/plans', {
        includeCompanyHeader: false,
        query: {
          page: filters.page || 1,
          limit: filters.limit || 100,
          billingFrequency:
            filters.billingFrequency && filters.billingFrequency !== 'all'
              ? filters.billingFrequency
              : undefined,
          active:
            filters.active !== undefined && filters.active !== 'all'
              ? String(filters.active)
              : undefined,
          search: filters.search ? filters.search.trim() : undefined,
        },
      });
      const rows = Array.isArray(res) ? res : res?.plans || [];
      const normalized = rows.map(normalizePlanFromApi).filter(Boolean);
      setStoredPlans(normalized);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      return getStoredPlans();
    }
  },

  /**
   * 20. GET /api/plans/{planId}
   */
  async getPlanById(id) {
    try {
      const res = await apiClient.get(`/api/plans/${id}`, {
        includeCompanyHeader: false,
      });
      return normalizePlanFromApi(res?.plan || res);
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        if (err.status === 404) return null;
        throw err;
      }
      return getStoredPlans().find((p) => p.id === id) || null;
    }
  },

  /**
  * 18. POST /api/plans (Authorization: Bearer admin JWT)
   */
  async createPlan(planData, actorUser = null) {
    try {
      const res = await apiClient.post(
        '/api/plans',
        buildPlanApiPayload(planData, false),
        { actorUser }
      );
      const rawPlan = res?.plan || res;
      if (rawPlan?.id && planData.productId) {
        savePlanProductAssociation(
          rawPlan.id,
          planData.productId,
          planData.productName
        );
      }
      const normalized = normalizePlanFromApi(rawPlan);
      const cached = getStoredPlans().filter((p) => isUuid(p.id));
      setStoredPlans([normalized, ...cached]);
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const plans = getStoredPlans();
      const newPlan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: planData.name.trim(),
        productId: planData.productId || '',
        productName: planData.productName || '',
        price: Number(planData.price) || 0,
        billingPeriod: planData.billingPeriod || 'monthly',
        minQuantity: Number(planData.minQuantity) || 1,
        availableFrom: planData.availableFrom || null,
        availableTo: planData.availableTo || null,
        autoClose:
          planData.autoClose ||
          (planData.autoCloseOnEnd ? 'end_of_term' : 'none'),
        autoCloseOnEnd: Boolean(planData.autoCloseOnEnd),
        allowEarlyClose: Boolean(planData.allowEarlyClose),
        allowPause: Boolean(planData.allowPause),
        allowRenewal: Boolean(planData.allowRenewal),
        active: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      plans.unshift(newPlan);
      setStoredPlans(plans);
      return newPlan;
    }
  },

  /**
  * 21. PATCH /api/plans/{planId} (Authorization: Bearer admin JWT)
   */
  async updatePlan(id, planData, actorUser = null) {
    try {
      const res = await apiClient.patch(
        `/api/plans/${id}`,
        buildPlanApiPayload(planData, true),
        { actorUser }
      );
      const rawPlan = res?.plan || res;
      if (planData.productId !== undefined) {
        savePlanProductAssociation(
          id,
          planData.productId,
          planData.productName
        );
      }
      const normalized = normalizePlanFromApi(rawPlan);
      setStoredPlans(
        getStoredPlans().map((p) => (p.id === id ? normalized : p))
      );
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }

      const plans = getStoredPlans();
      const index = plans.findIndex((p) => p.id === id);
      if (index === -1) {
        throw new Error(`Plan with ID "${id}" not found.`);
      }

      const updated = {
        ...plans[index],
        name:
          planData.name !== undefined
            ? planData.name.trim()
            : plans[index].name,
        productId:
          planData.productId !== undefined
            ? planData.productId
            : plans[index].productId,
        productName:
          planData.productName !== undefined
            ? planData.productName
            : plans[index].productName,
        price:
          planData.price !== undefined
            ? Number(planData.price)
            : plans[index].price,
        billingPeriod:
          planData.billingPeriod !== undefined
            ? planData.billingPeriod
            : plans[index].billingPeriod,
        minQuantity:
          planData.minQuantity !== undefined
            ? Number(planData.minQuantity)
            : plans[index].minQuantity,
        availableFrom:
          planData.availableFrom !== undefined
            ? planData.availableFrom
            : plans[index].availableFrom,
        availableTo:
          planData.availableTo !== undefined
            ? planData.availableTo
            : plans[index].availableTo,
        autoClose:
          planData.autoClose !== undefined
            ? planData.autoClose
            : planData.autoCloseOnEnd !== undefined
            ? planData.autoCloseOnEnd
              ? 'end_of_term'
              : 'none'
            : plans[index].autoClose,
        autoCloseOnEnd:
          planData.autoCloseOnEnd !== undefined
            ? Boolean(planData.autoCloseOnEnd)
            : plans[index].autoCloseOnEnd,
        allowEarlyClose:
          planData.allowEarlyClose !== undefined
            ? Boolean(planData.allowEarlyClose)
            : plans[index].allowEarlyClose,
        allowPause:
          planData.allowPause !== undefined
            ? Boolean(planData.allowPause)
            : plans[index].allowPause,
        allowRenewal:
          planData.allowRenewal !== undefined
            ? Boolean(planData.allowRenewal)
            : plans[index].allowRenewal,
        updatedAt: new Date().toISOString(),
      };

      plans[index] = updated;
      setStoredPlans(plans);
      return updated;
    }
  },

  /**
  * 23. PATCH /api/plans/{planId}/status (Authorization: Bearer admin JWT, { active })
   */
  async updatePlanStatus(id, active, actorUser = null) {
    const nextActive = Boolean(active);
    try {
      const res = await apiClient.patch(
        `/api/plans/${id}/status`,
        { active: nextActive },
        { actorUser }
      );
      const normalized = normalizePlanFromApi(res?.plan || res);
      setStoredPlans(
        getStoredPlans().map((p) => (p.id === id ? normalized : p))
      );
      return normalized;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const plans = getStoredPlans();
      const idx = plans.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error('Plan not found.');
      plans[idx] = {
        ...plans[idx],
        active: nextActive,
        isActive: nextActive,
        updatedAt: new Date().toISOString(),
      };
      setStoredPlans(plans);
      return plans[idx];
    }
  },

  /**
   * 22. DELETE /api/plans/{planId} (Archives subscription plan on backend)
   */
  async deletePlan(id, actorUser = null) {
    try {
      const res = await apiClient.delete(`/api/plans/${id}`, { actorUser });
      const rawPlan = res?.plan;
      if (rawPlan) {
        const normalized = normalizePlanFromApi(rawPlan);
        setStoredPlans(
          getStoredPlans().map((p) => (p.id === id ? normalized : p))
        );
      } else {
        setStoredPlans(getStoredPlans().filter((p) => p.id !== id));
      }
      return true;
    } catch (err) {
      if (!isNetworkOfflineError(err)) {
        throw err;
      }
      const plans = getStoredPlans();
      const filtered = plans.filter((p) => p.id !== id);
      if (filtered.length === plans.length) {
        throw new Error(`Plan with ID "${id}" not found.`);
      }
      setStoredPlans(filtered);
      return true;
    }
  },
};
