/**
 * Discount Rules Service Layer
 *
 * Enforces:
 * - Strictly Administrator-only creation, editing, toggling, and deletion of discount rules
 * - Percentage (%) or Fixed Amount (₹) discounts
 * - Minimum seat/item quantity and/or minimum purchase amount thresholds
 * - Start date and End date validity window (automatically stops when expired)
 * - Usage limit counter across generated invoices (automatically stops when limit is reached)
 * - Scope targeting either specific products or whole subscriptions
 */

const STORAGE_KEY = 'brightloop_discount_rules_v1';

const SEED_DISCOUNT_RULES = [
  {
    id: 'disc_seats_10pct',
    name: 'Volume Seat Discount (10+ Seats)',
    type: 'percentage',
    value: 10,
    appliesTo: 'product',
    productId: 'prod_core_01',
    productName: 'Brightloop Core Recurring Engine',
    minQuantity: 10,
    minPurchase: 0,
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    usageLimit: 12,
    usedCount: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'disc_sub_flat_2500',
    name: 'High-Volume Subscription Rebate',
    type: 'fixed',
    value: 2500,
    appliesTo: 'subscription',
    productId: '',
    productName: 'Whole Subscription',
    minQuantity: 1,
    minPurchase: 25000,
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    usageLimit: 5,
    usedCount: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getStoredDiscountRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_DISCOUNT_RULES));
      return SEED_DISCOUNT_RULES.map((r) => ({ ...r }));
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
      : SEED_DISCOUNT_RULES.map((r) => ({ ...r }));
  } catch {
    return SEED_DISCOUNT_RULES.map((r) => ({ ...r }));
  }
}

function saveStoredDiscountRules(rules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to persist discount rules', err);
  }
}

function requireAdminActor(actorUser) {
  if (!actorUser || actorUser.role !== 'admin') {
    throw new Error('Only administrators can create or modify discount rules.');
  }
}

/**
 * Determine lifecycle status of a discount rule on a given date (YYYY-MM-DD).
 * Returns: 'active' | 'disabled' | 'scheduled' | 'expired' | 'exhausted'
 */
export function getDiscountRuleStatus(rule, evalDateStr = null) {
  if (!rule || rule.isActive === false) return 'disabled';
  const evalDate = evalDateStr || new Date().toISOString().slice(0, 10);

  const limit = Number(rule.usageLimit) || 0;
  const used = Number(rule.usedCount) || 0;
  if (limit > 0 && used >= limit) {
    return 'exhausted';
  }
  if (rule.startDate && evalDate < rule.startDate) {
    return 'scheduled';
  }
  if (rule.endDate && evalDate > rule.endDate) {
    return 'expired';
  }
  return 'active';
}

function computeRuleDiscountForLines(rule, lines = []) {
  const grossSubtotal =
    Math.round(
      lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100
    ) / 100;
  if (grossSubtotal <= 0) return null;

  const minQty = Math.max(0, Number(rule.minQuantity) || 0);
  const minPurchase = Math.max(0, Number(rule.minPurchase) || 0);
  const val = Math.max(0, Number(rule.value) || 0);
  if (val <= 0) return null;

  if (rule.appliesTo === 'product') {
    if (!rule.productId) return null;
    const matchingLines = lines.filter((l) => l.productId === rule.productId);
    if (matchingLines.length === 0) return null;

    const matchingQty = matchingLines.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0),
      0
    );
    const matchingSubtotal =
      Math.round(
        matchingLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100
      ) / 100;

    if (matchingQty < minQty || matchingSubtotal < minPurchase) {
      return null;
    }

    const rawDiscount =
      rule.type === 'percentage'
        ? (matchingSubtotal * Math.min(100, val)) / 100
        : Math.min(val, matchingSubtotal);
    const discountAmount =
      Math.round(Math.min(matchingSubtotal, rawDiscount) * 100) / 100;
    if (discountAmount <= 0) return null;

    // Distribute product discount proportionally across matching product lines for accurate tax calculation
    const discountedLines = lines.map((line) => {
      const lineAmt = Number(line.amount) || 0;
      if (line.productId !== rule.productId || matchingSubtotal <= 0) {
        return { ...line, discountShare: 0, netAmount: lineAmt };
      }
      const share =
        Math.round((lineAmt / matchingSubtotal) * discountAmount * 100) / 100;
      return {
        ...line,
        discountShare: share,
        netAmount: Math.max(0, Math.round((lineAmt - share) * 100) / 100),
      };
    });

    return {
      rule,
      discountAmount,
      discountedLines,
    };
  }

  // Whole subscription scope
  const totalQty = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0),
    0
  );
  if (totalQty < minQty || grossSubtotal < minPurchase) {
    return null;
  }

  const rawDiscount =
    rule.type === 'percentage'
      ? (grossSubtotal * Math.min(100, val)) / 100
      : Math.min(val, grossSubtotal);
  const discountAmount =
    Math.round(Math.min(grossSubtotal, rawDiscount) * 100) / 100;
  if (discountAmount <= 0) return null;

  const discountedLines = lines.map((line) => {
    const lineAmt = Number(line.amount) || 0;
    const share =
      grossSubtotal > 0
        ? Math.round((lineAmt / grossSubtotal) * discountAmount * 100) / 100
        : 0;
    return {
      ...line,
      discountShare: share,
      netAmount: Math.max(0, Math.round((lineAmt - share) * 100) / 100),
    };
  });

  return {
    rule,
    discountAmount,
    discountedLines,
  };
}

/**
 * Synchronous discount evaluation engine used by Quotations, Subscriptions, and Billing Day runs.
 * Automatically checks start/end dates, remaining usage limit, seat/purchase thresholds, and product/subscription scope.
 * Stops automatically when a rule expires or reaches its usage limit.
 */
export function evaluateApplicableDiscount(
  lines = [],
  context = {},
  explicitRules = null
) {
  const rules = Array.isArray(explicitRules)
    ? explicitRules
    : getStoredDiscountRules();
  const evalDate = context.evalDate || new Date().toISOString().slice(0, 10);
  const preferredRuleId = context.preferredRuleId || '';

  const grossSubtotal =
    Math.round(
      lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100
    ) / 100;

  const noDiscountResult = (stoppedReason = '') => ({
    rule: null,
    discountRuleId: '',
    discountName: '',
    discountLabel: '',
    discountType: '',
    discountValue: 0,
    grossSubtotal,
    discountAmount: 0,
    netSubtotal: grossSubtotal,
    stoppedReason,
    discountedLines: lines.map((l) => ({
      ...l,
      discountShare: 0,
      netAmount: Number(l.amount) || 0,
    })),
  });

  if (grossSubtotal <= 0 || rules.length === 0) {
    return noDiscountResult();
  }

  if (preferredRuleId === 'none') {
    return noDiscountResult();
  }

  // If a specific rule was attached to the subscription, check it first; stop cleanly if expired or exhausted
  if (preferredRuleId && preferredRuleId !== 'auto') {
    const pinned = rules.find((r) => r.id === preferredRuleId);
    if (!pinned) {
      return noDiscountResult('Discount rule removed');
    }
    const status = getDiscountRuleStatus(pinned, evalDate);
    if (status === 'expired') {
      return noDiscountResult(`"${pinned.name}" expired on ${pinned.endDate}`);
    }
    if (status === 'exhausted') {
      return noDiscountResult(
        `"${pinned.name}" reached its ${pinned.usageLimit}-use limit`
      );
    }
    if (status !== 'active') {
      return noDiscountResult(`"${pinned.name}" is not active on ${evalDate}`);
    }

    const match = computeRuleDiscountForLines(pinned, lines);
    if (!match) {
      return noDiscountResult(
        `"${pinned.name}" minimum quantity or purchase threshold not met`
      );
    }

    const netSubtotal = Math.max(
      0,
      Math.round((grossSubtotal - match.discountAmount) * 100) / 100
    );
    const badge =
      pinned.type === 'percentage'
        ? `${pinned.value}% off`
        : `₹${pinned.value} off`;

    return {
      rule: pinned,
      discountRuleId: pinned.id,
      discountName: pinned.name,
      discountLabel: `${pinned.name} (${badge})`,
      discountType: pinned.type,
      discountValue: pinned.value,
      grossSubtotal,
      discountAmount: match.discountAmount,
      netSubtotal,
      stoppedReason: '',
      discountedLines: match.discountedLines,
    };
  }

  // Automatic mode: evaluate all active, un-expired, un-exhausted rules and pick the highest saving rule
  let bestMatch = null;
  rules.forEach((rule) => {
    if (getDiscountRuleStatus(rule, evalDate) !== 'active') return;
    const candidate = computeRuleDiscountForLines(rule, lines);
    if (
      candidate &&
      (!bestMatch || candidate.discountAmount > bestMatch.discountAmount)
    ) {
      bestMatch = candidate;
    }
  });

  if (!bestMatch) {
    return noDiscountResult();
  }

  const chosen = bestMatch.rule;
  const netSubtotal = Math.max(
    0,
    Math.round((grossSubtotal - bestMatch.discountAmount) * 100) / 100
  );
  const badge =
    chosen.type === 'percentage'
      ? `${chosen.value}% off`
      : `₹${chosen.value} off`;

  return {
    rule: chosen,
    discountRuleId: chosen.id,
    discountName: chosen.name,
    discountLabel: `${chosen.name} (${badge})`,
    discountType: chosen.type,
    discountValue: chosen.value,
    grossSubtotal,
    discountAmount: bestMatch.discountAmount,
    netSubtotal,
    stoppedReason: '',
    discountedLines: bestMatch.discountedLines,
  };
}

export function consumeDiscountRuleUsage(ruleId) {
  if (!ruleId) return null;
  const rules = getStoredDiscountRules();
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return null;
  rules[idx] = {
    ...rules[idx],
    usedCount: (Number(rules[idx].usedCount) || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  saveStoredDiscountRules(rules);
  return rules[idx];
}

export function releaseDiscountRuleUsage(ruleId) {
  if (!ruleId) return null;
  const rules = getStoredDiscountRules();
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx === -1) return null;
  rules[idx] = {
    ...rules[idx],
    usedCount: Math.max(0, (Number(rules[idx].usedCount) || 0) - 1),
    updatedAt: new Date().toISOString(),
  };
  saveStoredDiscountRules(rules);
  return rules[idx];
}

export const discountService = {
  getDiscountRulesSync() {
    return getStoredDiscountRules();
  },

  async getDiscountRules() {
    await new Promise((r) => setTimeout(r, 50));
    return getStoredDiscountRules();
  },

  async createDiscountRule(payload, actorUser) {
    await new Promise((r) => setTimeout(r, 80));
    requireAdminActor(actorUser);

    const name = (payload.name || '').trim();
    if (!name) {
      throw new Error('Discount rule name is required.');
    }

    const type = payload.type === 'fixed' ? 'fixed' : 'percentage';
    const value = Number(payload.value);
    if (Number.isNaN(value) || value <= 0) {
      throw new Error('Discount value must be greater than zero.');
    }
    if (type === 'percentage' && value > 100) {
      throw new Error('Percentage discount cannot exceed 100%.');
    }

    const appliesTo = payload.appliesTo === 'product' ? 'product' : 'subscription';
    if (appliesTo === 'product' && !payload.productId) {
      throw new Error('Select a target product for product-specific discounts.');
    }

    if (
      payload.startDate &&
      payload.endDate &&
      payload.endDate < payload.startDate
    ) {
      throw new Error('End date cannot be earlier than start date.');
    }

    const minQuantity = Math.max(0, Number(payload.minQuantity) || 0);
    const minPurchase = Math.max(0, Number(payload.minPurchase) || 0);
    const usageLimit =
      payload.usageLimit !== undefined &&
      payload.usageLimit !== '' &&
      Number(payload.usageLimit) > 0
        ? Math.floor(Number(payload.usageLimit))
        : null;

    const rules = getStoredDiscountRules();
    const now = new Date().toISOString();
    const created = {
      id: `disc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      type,
      value: Math.round(value * 100) / 100,
      appliesTo,
      productId: appliesTo === 'product' ? payload.productId : '',
      productName:
        appliesTo === 'product'
          ? payload.productName || 'Specific Product'
          : 'Whole Subscription',
      minQuantity,
      minPurchase,
      startDate: payload.startDate || '',
      endDate: payload.endDate || '',
      usageLimit,
      usedCount: 0,
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    rules.unshift(created);
    saveStoredDiscountRules(rules);
    return created;
  },

  async updateDiscountRule(id, payload, actorUser) {
    await new Promise((r) => setTimeout(r, 80));
    requireAdminActor(actorUser);

    const rules = getStoredDiscountRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error('Discount rule not found.');
    }

    const name = (payload.name ?? rules[idx].name ?? '').trim();
    if (!name) {
      throw new Error('Discount rule name is required.');
    }

    const type =
      (payload.type || rules[idx].type) === 'fixed' ? 'fixed' : 'percentage';
    const value = Number(payload.value ?? rules[idx].value);
    if (Number.isNaN(value) || value <= 0) {
      throw new Error('Discount value must be greater than zero.');
    }
    if (type === 'percentage' && value > 100) {
      throw new Error('Percentage discount cannot exceed 100%.');
    }

    const appliesTo =
      (payload.appliesTo || rules[idx].appliesTo) === 'product'
        ? 'product'
        : 'subscription';
    const productId =
      appliesTo === 'product'
        ? payload.productId ?? rules[idx].productId
        : '';
    if (appliesTo === 'product' && !productId) {
      throw new Error('Select a target product for product-specific discounts.');
    }

    const startDate =
      payload.startDate !== undefined ? payload.startDate : rules[idx].startDate;
    const endDate =
      payload.endDate !== undefined ? payload.endDate : rules[idx].endDate;
    if (startDate && endDate && endDate < startDate) {
      throw new Error('End date cannot be earlier than start date.');
    }

    const usageLimit =
      payload.usageLimit !== undefined
        ? payload.usageLimit !== '' && Number(payload.usageLimit) > 0
          ? Math.floor(Number(payload.usageLimit))
          : null
        : rules[idx].usageLimit;

    const updated = {
      ...rules[idx],
      name,
      type,
      value: Math.round(value * 100) / 100,
      appliesTo,
      productId,
      productName:
        appliesTo === 'product'
          ? payload.productName || rules[idx].productName || 'Specific Product'
          : 'Whole Subscription',
      minQuantity: Math.max(
        0,
        Number(payload.minQuantity ?? rules[idx].minQuantity) || 0
      ),
      minPurchase: Math.max(
        0,
        Number(payload.minPurchase ?? rules[idx].minPurchase) || 0
      ),
      startDate: startDate || '',
      endDate: endDate || '',
      usageLimit,
      isActive:
        payload.isActive !== undefined
          ? Boolean(payload.isActive)
          : rules[idx].isActive,
      updatedAt: new Date().toISOString(),
    };

    rules[idx] = updated;
    saveStoredDiscountRules(rules);
    return updated;
  },

  async toggleDiscountRule(id, actorUser) {
    await new Promise((r) => setTimeout(r, 60));
    requireAdminActor(actorUser);

    const rules = getStoredDiscountRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error('Discount rule not found.');
    }

    rules[idx] = {
      ...rules[idx],
      isActive: !rules[idx].isActive,
      updatedAt: new Date().toISOString(),
    };
    saveStoredDiscountRules(rules);
    return rules[idx];
  },

  async deleteDiscountRule(id, actorUser) {
    await new Promise((r) => setTimeout(r, 60));
    requireAdminActor(actorUser);

    const rules = getStoredDiscountRules();
    saveStoredDiscountRules(rules.filter((r) => r.id !== id));
    return { success: true };
  },
};
