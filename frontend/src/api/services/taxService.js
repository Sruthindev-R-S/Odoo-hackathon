/**
 * Tax Rules Service Layer
 *
 * Manages administrator-configured tax rules and performs automated tax
 * calculations across subscription product lines during Billing Day runs
 * and individual invoice generation.
 */

const STORAGE_KEY = 'brightloop_tax_rules_v1';

const SEED_TAX_RULES = [
  {
    id: 'tax_gst_18',
    name: 'GST',
    rate: 18,
    scope: 'all',
    scopeValue: '',
    scopeLabel: 'All Subscriptions & Products',
    description: 'Standard Goods & Services Tax applied automatically on recurring invoices',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function getStoredTaxRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_TAX_RULES));
      return [...SEED_TAX_RULES];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...SEED_TAX_RULES];
  } catch {
    return [...SEED_TAX_RULES];
  }
}

function saveStoredTaxRules(rules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch (err) {
    console.error('Failed to persist tax rules', err);
  }
}

function ruleMatchesLine(rule, line, context = {}) {
  if (!rule || rule.isActive === false) return false;
  const scope = rule.scope || 'all';
  if (scope === 'all') return true;

  if (scope === 'billing_period') {
    return (context.billingPeriod || '').toLowerCase() === (rule.scopeValue || '').toLowerCase();
  }

  if (scope === 'product_type') {
    const lineType =
      line.productType ||
      (line.productId && context.productsById?.get(line.productId)?.type) ||
      context.defaultProductType ||
      '';
    return lineType.toLowerCase() === (rule.scopeValue || '').toLowerCase();
  }

  if (scope === 'product') {
    const prodId = line.productId || context.defaultProductId || '';
    return Boolean(prodId) && prodId === rule.scopeValue;
  }

  return false;
}

/**
 * Synchronous tax calculation engine used by Billing Day runs and invoice generation.
 * Evaluates all active administrator tax rules against each invoice line item.
 */
export function calculateTaxesFromRules(lines = [], context = {}, explicitRules = null) {
  const rules = Array.isArray(explicitRules) ? explicitRules : getStoredTaxRules();
  const activeRules = rules.filter((r) => r.isActive !== false && Number(r.rate) >= 0);

  const subtotal = Math.round(
    lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100
  ) / 100;

  if (subtotal <= 0 || activeRules.length === 0) {
    return {
      subtotal,
      taxLines: [],
      taxRate: '0% (No active tax)',
      taxAmount: 0,
      total: subtotal,
    };
  }

  const ruleTotalsMap = new Map();

  lines.forEach((line) => {
    const lineAmount = Number(line.amount) || 0;
    if (lineAmount <= 0) return;

    activeRules.forEach((rule) => {
      if (!ruleMatchesLine(rule, line, context)) return;
      const rate = Number(rule.rate) || 0;
      const taxForLine = (lineAmount * rate) / 100;
      const existing = ruleTotalsMap.get(rule.id) || {
        id: rule.id,
        name: rule.name,
        rate,
        taxableAmount: 0,
        amount: 0,
      };
      existing.taxableAmount += lineAmount;
      existing.amount += taxForLine;
      ruleTotalsMap.set(rule.id, existing);
    });
  });

  const taxLines = Array.from(ruleTotalsMap.values()).map((entry) => ({
    ...entry,
    taxableAmount: Math.round(entry.taxableAmount * 100) / 100,
    amount: Math.round(entry.amount * 100) / 100,
  }));

  const taxAmount = Math.round(
    taxLines.reduce((sum, tl) => sum + tl.amount, 0) * 100
  ) / 100;

  const taxRate =
    taxLines.length === 0
      ? '0%'
      : taxLines.map((tl) => `${tl.rate}% ${tl.name}`).join(' + ');

  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  return {
    subtotal,
    taxLines,
    taxRate,
    taxAmount,
    total,
  };
}

export const taxService = {
  getTaxRulesSync() {
    return getStoredTaxRules();
  },

  async getTaxRules() {
    await new Promise((r) => setTimeout(r, 50));
    return getStoredTaxRules();
  },

  async createTaxRule(payload) {
    await new Promise((r) => setTimeout(r, 80));
    const name = (payload.name || '').trim();
    if (!name) {
      throw new Error('Tax rule name is required.');
    }

    const rate = Number(payload.rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      throw new Error('Tax rate must be between 0% and 100%.');
    }

    const scope = payload.scope || 'all';
    if (scope !== 'all' && !payload.scopeValue) {
      throw new Error('Please choose a target for the selected rule scope.');
    }

    const rules = getStoredTaxRules();
    const now = new Date().toISOString();
    const newRule = {
      id: `tax_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      rate: Math.round(rate * 100) / 100,
      scope,
      scopeValue: scope === 'all' ? '' : payload.scopeValue,
      scopeLabel: payload.scopeLabel || 'All Subscriptions & Products',
      description: (payload.description || '').trim(),
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    rules.unshift(newRule);
    saveStoredTaxRules(rules);
    return newRule;
  },

  async updateTaxRule(id, payload) {
    await new Promise((r) => setTimeout(r, 80));
    const rules = getStoredTaxRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error('Tax rule not found.');
    }

    const name = (payload.name ?? rules[idx].name ?? '').trim();
    if (!name) {
      throw new Error('Tax rule name is required.');
    }

    const rate = Number(payload.rate ?? rules[idx].rate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      throw new Error('Tax rate must be between 0% and 100%.');
    }

    const scope = payload.scope || rules[idx].scope || 'all';
    if (scope !== 'all' && !payload.scopeValue) {
      throw new Error('Please choose a target for the selected rule scope.');
    }

    const updated = {
      ...rules[idx],
      name,
      rate: Math.round(rate * 100) / 100,
      scope,
      scopeValue: scope === 'all' ? '' : payload.scopeValue,
      scopeLabel: payload.scopeLabel || rules[idx].scopeLabel,
      description:
        payload.description !== undefined
          ? payload.description.trim()
          : rules[idx].description,
      isActive:
        payload.isActive !== undefined ? Boolean(payload.isActive) : rules[idx].isActive,
      updatedAt: new Date().toISOString(),
    };

    rules[idx] = updated;
    saveStoredTaxRules(rules);
    return updated;
  },

  async toggleTaxRule(id) {
    await new Promise((r) => setTimeout(r, 60));
    const rules = getStoredTaxRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error('Tax rule not found.');
    }
    rules[idx] = {
      ...rules[idx],
      isActive: !rules[idx].isActive,
      updatedAt: new Date().toISOString(),
    };
    saveStoredTaxRules(rules);
    return rules[idx];
  },

  async deleteTaxRule(id) {
    await new Promise((r) => setTimeout(r, 60));
    const rules = getStoredTaxRules();
    const filtered = rules.filter((r) => r.id !== id);
    saveStoredTaxRules(filtered);
    return { success: true };
  },
};

