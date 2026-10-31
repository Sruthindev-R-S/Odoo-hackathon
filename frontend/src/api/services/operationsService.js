/**
 * Operations Service Layer (Subscriptions, Billing Day, Invoices & Payments)
 *
 * Integrates live backend Subscription endpoints at http://192.168.0.155:3000:
 *  39. POST   /api/subscriptions
 *  40. GET    /api/subscriptions?page=1&limit=100&status=...&planId=...&customerId=...&search=...
 *  41. GET    /api/subscriptions/{subscriptionId}
 *  42. PATCH  /api/subscriptions/{subscriptionId}
 *  43. POST   /api/subscriptions/{subscriptionId}/quote
 *  44. POST   /api/subscriptions/{subscriptionId}/confirm
 *  45. POST   /api/subscriptions/{subscriptionId}/activate
 *  46. POST   /api/subscriptions/{subscriptionId}/close
 *  47. GET    /api/subscriptions/{subscriptionId}/items
 *  48. POST   /api/subscriptions/{subscriptionId}/items
 *  49. PATCH  /api/subscriptions/{subscriptionId}/items/{itemId}
 *  50. DELETE /api/subscriptions/{subscriptionId}/items/{itemId}
 *  51. GET    /api/subscriptions/{subscriptionId}/history
 *
 * Unifies storage seamlessly with CustomerBillingPage (billingService.js) while enforcing:
 * - Strict customer tenant isolation when signed in as a customer
 * - Subscription lifecycle transitions (Draft -> Quotation -> Confirmed -> Active -> Closed)
 * - Plan behavioral switches (autoCloseOnEnd, allowEarlyClose, allowPause, allowRenewal)
 * - Automatic volume & subscription discount rules with usage/expiry auto-stop
 * - Billing Day bulk invoice creation, tax rules, invoice lifecycle, and payment collections
 */

import {
  apiClient,
  isNetworkOfflineError,
  isUuid,
  resolveCompanyUserId,
} from '../client.js';
import { rememberKnownCustomer } from '../../services/authService.js';
import { calculateTaxesFromRules, taxService } from './taxService.js';
import {
  evaluateApplicableDiscount,
  consumeDiscountRuleUsage,
  releaseDiscountRuleUsage,
} from './discountService.js';

const SUBSCRIPTIONS_KEY = 'brightloop_subscriptions_v1';
const LEGACY_SUBSCRIPTIONS_KEY = 'brightloop_subscriptions';
const SUBSCRIPTION_META_KEY = 'brightloop_subscription_meta_v1';
const INVOICES_KEY = 'brightloop_invoices_v1';
const LEGACY_INVOICES_KEY = 'brightloop_invoices';
const BILLING_RUNS_KEY = 'brightloop_billing_runs';
const PRODUCTS_KEY = 'brightloop_products';
const PLANS_KEY = 'brightloop_plans';

const STATUS_HISTORY_LABELS = {
  draft: 'Subscription created in Draft',
  quotation: 'Moved from Draft to Quotation',
  confirmed: 'Quotation confirmed',
  active: 'Subscription activated',
  closed: 'Subscription closed',
};

function readRawArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStore(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error(`Failed to persist ${key}`, err);
  }
}

function getSubscriptionMetaMap() {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSubscriptionMeta(subId, metaPatch) {
  if (!subId) return;
  try {
    const map = getSubscriptionMetaMap();
    map[subId] = { ...(map[subId] || {}), ...metaPatch };
    localStorage.setItem(SUBSCRIPTION_META_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function getProductsMap() {
  const products = readRawArray(PRODUCTS_KEY);
  const map = new Map();
  products.forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  return map;
}

function getPlansMap() {
  const plans = readRawArray(PLANS_KEY);
  const map = new Map();
  plans.forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  return map;
}

function addPeriodToDate(dateStr, period) {
  const base = dateStr ? new Date(`${dateStr.slice(0, 10)}T00:00:00Z`) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const d = new Date(base);
  if (period === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (period === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (period === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeTaxesInput(line) {
  if (Array.isArray(line?.taxes) && line.taxes.length > 0) {
    return line.taxes.map((t) => ({
      name: String(t.name || 'VAT').trim() || 'VAT',
      rate: Math.max(0, Number(t.rate ?? t.percentage ?? 0)),
    }));
  }
  if (line?.taxRatePercent !== undefined && line?.taxRatePercent !== '') {
    const rate = Math.max(0, Number(line.taxRatePercent) || 0);
    return rate > 0
      ? [{ name: String(line.taxName || 'VAT').trim() || 'VAT', rate }]
      : [];
  }
  if (
    typeof line?.taxRate === 'number' ||
    (typeof line?.taxRate === 'string' && /^\d+(\.\d+)?$/.test(line.taxRate.trim()))
  ) {
    const rate = Math.max(0, Number(line.taxRate) || 0);
    return rate > 0
      ? [{ name: String(line.taxName || 'VAT').trim() || 'VAT', rate }]
      : [];
  }
  return [{ name: 'VAT', rate: 18 }];
}

function buildApiSubscriptionItem(line) {
  const item = {
    productId: line.productId || line.product_id,
    quantity: Math.max(1, Number(line.quantity) || 1),
    unitPrice: Math.max(0, Number(line.unitPrice ?? line.unit_price) || 0),
    taxes: normalizeTaxesInput(line),
  };
  const variantId = line.variantId || line.variant_id;
  if (variantId && isUuid(variantId)) {
    item.variantId = variantId;
  } else if (variantId) {
    item.variantId = variantId;
  }
  return item;
}

function calculateExplicitItemTaxes(linesWithTaxes) {
  const subtotal =
    Math.round(
      linesWithTaxes.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100
    ) / 100;
  const bucketMap = new Map();

  linesWithTaxes.forEach((line) => {
    const lineAmt = Number(line.amount) || 0;
    const taxes = Array.isArray(line.taxes) ? line.taxes : [];
    taxes.forEach((t) => {
      const name = String(t.name || 'VAT').trim() || 'VAT';
      const rate = Math.max(0, Number(t.rate ?? t.percentage ?? 0));
      if (rate <= 0) return;
      const key = `${name}::${rate}`;
      const prev = bucketMap.get(key) || {
        id: `tax_${name.toLowerCase()}_${rate}`,
        name,
        rate,
        taxableAmount: 0,
        amount: 0,
      };
      prev.taxableAmount = Math.round((prev.taxableAmount + lineAmt) * 100) / 100;
      prev.amount =
        Math.round((prev.amount + (lineAmt * rate) / 100) * 100) / 100;
      bucketMap.set(key, prev);
    });
  });

  const taxLines = Array.from(bucketMap.values());
  const taxAmount =
    Math.round(taxLines.reduce((s, tl) => s + tl.amount, 0) * 100) / 100;
  const taxRate =
    taxLines.length > 0
      ? taxLines.map((t) => `${t.rate}% ${t.name}`).join(' + ')
      : '0%';

  return {
    subtotal,
    taxLines,
    taxRate,
    taxAmount,
    total: Math.round((subtotal + taxAmount) * 100) / 100,
  };
}

function mapApiHistoryRows(rows = [], extraEvents = []) {
  const apiEvents = (Array.isArray(rows) ? rows : []).map((row, idx) => {
    if (row.label && row.timestamp) return row;
    return {
      id: row.id || `hist_${idx}`,
      status: row.status || 'draft',
      label:
        STATUS_HISTORY_LABELS[row.status] ||
        `Status changed to ${row.status || 'draft'}`,
      actor: row.changed_by
        ? `Company User #${row.changed_by}`
        : row.actor || 'System',
      changedBy: row.changed_by ?? null,
      timestamp: row.changed_at || row.timestamp || new Date().toISOString(),
    };
  });
  return [...apiEvents, ...(Array.isArray(extraEvents) ? extraEvents : [])];
}

function mapApiSubscriptionToRaw(apiSub, historyRows = null) {
  if (!apiSub) return null;
  const metaMap = getSubscriptionMetaMap();
  const meta = metaMap[apiSub.id] || {};
  const plansById = getPlansMap();
  const planId = apiSub.plan_id ?? apiSub.planId ?? '';
  const cachedPlan = plansById.get(planId);

  if (apiSub.customer_id !== undefined && apiSub.customer_id !== null) {
    rememberKnownCustomer({
      id: apiSub.customer_id,
      customerId: apiSub.customer_id,
      name: apiSub.customer_name || meta.customerName || `Customer #${apiSub.customer_id}`,
      email: meta.customerEmail || '',
      organization: meta.customerOrganization || '',
    });
  }

  const apiItems = Array.isArray(apiSub.items) ? apiSub.items : [];
  const mappedApiLines = apiItems.map((it, idx) => ({
    id: it.id || `sitem_${idx}`,
    productId: it.product_id ?? it.productId ?? '',
    productName: it.product_name ?? it.productName ?? 'Product',
    name: it.product_name ?? it.productName ?? 'Product',
    variantId: it.variant_id ?? it.variantId ?? '',
    variant: it.variant_name ?? it.variantName ?? it.variantLabel ?? null,
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unit_price ?? it.unitPrice ?? 0),
    amount:
      Math.round(
        (Number(it.quantity) || 1) *
          Number(it.unit_price ?? it.unitPrice ?? 0) *
          100
      ) / 100,
    taxes: Array.isArray(it.taxes) ? it.taxes : [],
  }));

  const effectiveLines =
    apiSub.status !== 'draft' &&
    Array.isArray(meta.seatOverrideLines) &&
    meta.seatOverrideLines.length > 0
      ? meta.seatOverrideLines
      : mappedApiLines.length > 0
      ? mappedApiLines
      : [
          {
            id: `line_${apiSub.id}_0`,
            productId: cachedPlan?.productId || meta.productId || '',
            productName:
              cachedPlan?.productName ||
              apiSub.plan_name ||
              meta.planName ||
              'Subscription Plan',
            name:
              cachedPlan?.productName ||
              apiSub.plan_name ||
              meta.planName ||
              'Subscription Plan',
            quantity: Math.max(1, Number(apiSub.quantity) || 1),
            unitPrice: Number(apiSub.agreed_price ?? cachedPlan?.price ?? 0),
            amount:
              Math.round(
                Math.max(1, Number(apiSub.quantity) || 1) *
                  Number(apiSub.agreed_price ?? cachedPlan?.price ?? 0) *
                  100
              ) / 100,
          },
        ];

  const billingPeriod =
    apiSub.agreed_billing_frequency ||
    apiSub.billingPeriod ||
    cachedPlan?.billingPeriod ||
    meta.billingPeriod ||
    'monthly';
  const startDate = apiSub.start_date
    ? String(apiSub.start_date).slice(0, 10)
    : meta.startDate || new Date().toISOString().slice(0, 10);
  const nextBillingDate =
    meta.nextBillingDate || addPeriodToDate(startDate, billingPeriod);
  const expiryDate = apiSub.expiry_date
    ? String(apiSub.expiry_date).slice(0, 10)
    : meta.expiryDate || nextBillingDate;

  return {
    id: apiSub.id,
    subscriptionNumber:
      apiSub.subscription_number ||
      apiSub.subscriptionNumber ||
      `SUB-${String(apiSub.id).slice(0, 8)}`,
    customerId: apiSub.customer_id ?? apiSub.customerId ?? meta.customerId,
    customerName:
      apiSub.customer_name ||
      meta.customerName ||
      `Customer #${apiSub.customer_id ?? ''}`,
    customerEmail: meta.customerEmail || '',
    customerOrganization: meta.customerOrganization || '',
    billingAddress: meta.billingAddress || '',
    planId,
    planName:
      apiSub.plan_name || cachedPlan?.name || meta.planName || 'Subscription Plan',
    billingPeriod,
    templateId: meta.templateId || '',
    templateName: meta.templateName || '',
    validityDays: meta.validityDays ?? null,
    preferredDiscountRuleId: meta.preferredDiscountRuleId || '',
    appliedDiscountRuleId: meta.appliedDiscountRuleId || '',
    paymentTerms:
      apiSub.payment_terms || meta.paymentTerms || 'Due on receipt',
    status: apiSub.status || 'draft',
    isPaused: Boolean(meta.isPaused),
    startDate,
    expiryDate,
    nextBillingDate,
    quantity: Math.max(1, Number(apiSub.quantity) || 1),
    lineItems: effectiveLines,
    planRules: meta.planRules || {
      autoCloseOnEnd:
        cachedPlan?.autoCloseOnEnd !== undefined
          ? Boolean(cachedPlan.autoCloseOnEnd)
          : true,
      allowEarlyClose:
        cachedPlan?.allowEarlyClose !== undefined
          ? Boolean(cachedPlan.allowEarlyClose)
          : true,
      allowPause:
        cachedPlan?.allowPause !== undefined
          ? Boolean(cachedPlan.allowPause)
          : true,
      allowRenewal:
        cachedPlan?.allowRenewal !== undefined
          ? Boolean(cachedPlan.allowRenewal)
          : true,
    },
    history: mapApiHistoryRows(
      historyRows || apiSub.history || [],
      meta.localEvents || []
    ),
    createdAt:
      apiSub.created_at || apiSub.createdAt || new Date().toISOString(),
    updatedAt:
      apiSub.updated_at || apiSub.updatedAt || new Date().toISOString(),
  };
}

function normalizeSubscription(raw) {
  if (!raw) return raw;
  const productsById = getProductsMap();
  const billingPeriod = raw.billingPeriod || 'monthly';
  const firstItem =
    Array.isArray(raw.lineItems) && raw.lineItems.length > 0
      ? raw.lineItems[0]
      : null;
  const fallbackQuantity = Math.max(1, Number(raw.quantity) || 1);
  const fallbackUnitPrice = Number(raw.unitPrice ?? raw.baseUnitPrice) || 0;
  const fallbackPreTaxSubtotal =
    Number(
      raw.subtotal ??
        raw.recurringAmount ??
        (fallbackUnitPrice > 0
          ? fallbackUnitPrice * fallbackQuantity
          : raw.amount)
    ) || 0;

  const primaryProductName =
    raw.productName ||
    firstItem?.productName ||
    firstItem?.name ||
    raw.planName ||
    'Subscription Item';
  const primaryVariantLabel = raw.variantLabel ?? firstItem?.variant ?? '';

  const rawLines =
    Array.isArray(raw.lineItems) && raw.lineItems.length > 0
      ? raw.lineItems
      : [
          {
            id: `line_${raw.id || 'sub'}_0`,
            productId: raw.productId || '',
            productName: primaryProductName,
            name: primaryProductName,
            description: primaryVariantLabel
              ? `${primaryProductName} (${primaryVariantLabel})`
              : primaryProductName,
            variant: primaryVariantLabel || null,
            variantExtraPrice: Number(raw.variantExtraPrice) || 0,
            quantity: fallbackQuantity,
            unitPrice: fallbackUnitPrice,
            amount: fallbackPreTaxSubtotal,
          },
        ];

  const hasExplicitLineTaxes = rawLines.some(
    (it) => Array.isArray(it.taxes) && it.taxes.length > 0
  );

  const lineItems = rawLines.map((item, idx) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const uPrice = Number(item.unitPrice) || 0;
    const untaxedAmount = Math.round(uPrice * qty * 100) / 100;
    const prodId = item.productId || (idx === 0 ? raw.productId || '' : '');
    const prodName =
      item.productName ||
      item.name ||
      (idx === 0 ? primaryProductName : 'Product');
    const variantText = item.variant || item.variantLabel || null;
    const desc =
      item.description ||
      (variantText ? `${prodName} (${variantText})` : prodName);

    let lineTax;
    if (Array.isArray(item.taxes) && item.taxes.length > 0) {
      lineTax = calculateExplicitItemTaxes([
        { amount: untaxedAmount, taxes: item.taxes },
      ]);
    } else if (hasExplicitLineTaxes && Array.isArray(item.taxes)) {
      lineTax = {
        taxRate: '0%',
        taxAmount: 0,
        total: untaxedAmount,
      };
    } else {
      lineTax = calculateTaxesFromRules(
        [
          {
            productId: prodId,
            productType: item.productType || '',
            amount: untaxedAmount,
          },
        ],
        {
          billingPeriod,
          defaultProductId: prodId,
          defaultProductType: prodId
            ? productsById.get(prodId)?.type || ''
            : '',
          productsById,
        }
      );
    }

    const explicitRatePercent = Array.isArray(item.taxes)
      ? item.taxes.reduce(
          (s, t) => s + (Number(t.rate ?? t.percentage) || 0),
          0
        )
      : undefined;

    return {
      id: item.id || `line_${raw.id || 'sub'}_${idx}`,
      productId: prodId,
      productName: prodName,
      name: item.name || prodName,
      description: desc,
      variantId: item.variantId || '',
      variant: variantText,
      variantExtraPrice: Number(item.variantExtraPrice) || 0,
      productType: item.productType || '',
      quantity: qty,
      unitPrice: uPrice,
      amount: untaxedAmount,
      ...(Array.isArray(item.taxes) ? { taxes: item.taxes } : {}),
      ...(explicitRatePercent !== undefined
        ? { taxRatePercent: explicitRatePercent }
        : {}),
      taxRate: lineTax.taxRate,
      taxAmount: lineTax.taxAmount,
      totalWithTax: lineTax.total,
    };
  });

  const preferredDiscountRuleId = raw.preferredDiscountRuleId || '';
  const appliedDiscountRuleId = raw.appliedDiscountRuleId || '';
  const discCalc = evaluateApplicableDiscount(lineItems, {
    evalDate: new Date().toISOString().slice(0, 10),
    preferredRuleId: preferredDiscountRuleId,
    appliedRuleId: appliedDiscountRuleId,
  });

  const taxableLines = discCalc.discountedLines.map((dl) => ({
    ...dl,
    amount: dl.netAmount,
  }));

  const subTaxCalc = hasExplicitLineTaxes
    ? calculateExplicitItemTaxes(taxableLines)
    : calculateTaxesFromRules(taxableLines, {
        billingPeriod,
        defaultProductId: raw.productId || lineItems[0]?.productId || '',
        productsById,
      });

  const startDate = raw.startDate
    ? String(raw.startDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const nextBillingDate =
    raw.nextBillingDate ||
    raw.currentPeriodEnd ||
    addPeriodToDate(startDate, billingPeriod);

  const leadLine = lineItems[0];

  return {
    ...raw,
    templateId: raw.templateId || '',
    templateName: raw.templateName || '',
    validityDays:
      raw.validityDays !== undefined &&
      raw.validityDays !== null &&
      raw.validityDays !== ''
        ? Number(raw.validityDays)
        : null,
    preferredDiscountRuleId,
    appliedDiscountRuleId,
    customerName: raw.customerName || 'Customer',
    customerEmail: raw.customerEmail || '',
    customerOrganization: raw.customerOrganization || raw.organization || '',
    organization: raw.organization || raw.customerOrganization || '',
    billingAddress: raw.billingAddress || '',
    planName: raw.planName || 'Subscription Plan',
    billingPeriod,
    productId: raw.productId || leadLine?.productId || '',
    productName: leadLine?.productName || primaryProductName,
    variantLabel:
      raw.variantLabel !== undefined
        ? raw.variantLabel
        : leadLine?.variant || '',
    variantExtraPrice:
      Number(raw.variantExtraPrice ?? leadLine?.variantExtraPrice) || 0,
    baseUnitPrice:
      Number(raw.baseUnitPrice ?? leadLine?.unitPrice ?? fallbackUnitPrice) ||
      0,
    unitPrice: Number(leadLine?.unitPrice ?? fallbackUnitPrice) || 0,
    quantity: Number(leadLine?.quantity ?? fallbackQuantity) || 1,
    grossSubtotal: discCalc.grossSubtotal,
    discountRuleId: discCalc.discountRuleId,
    discountName: discCalc.discountName,
    discountLabel: discCalc.discountLabel,
    discountAmount: discCalc.discountAmount,
    discountStoppedReason: discCalc.stoppedReason,
    subtotal: discCalc.netSubtotal,
    recurringAmount: discCalc.netSubtotal,
    taxLines: subTaxCalc.taxLines,
    taxRate: subTaxCalc.taxRate,
    taxAmount: subTaxCalc.taxAmount,
    totalWithTax: subTaxCalc.total,
    paymentTerms: raw.paymentTerms || 'Due on receipt',
    status: raw.status || 'draft',
    isPaused: Boolean(raw.isPaused),
    startDate,
    nextBillingDate,
    expiryDate: raw.expiryDate
      ? String(raw.expiryDate).slice(0, 10)
      : raw.currentPeriodEnd || nextBillingDate,
    lineItems,
    planRules: {
      autoCloseOnEnd:
        raw.planRules?.autoCloseOnEnd !== undefined
          ? Boolean(raw.planRules.autoCloseOnEnd)
          : Boolean(raw.autoCloseOnEnd),
      allowEarlyClose:
        raw.planRules?.allowEarlyClose !== undefined
          ? Boolean(raw.planRules.allowEarlyClose)
          : raw.canCloseEarly !== false,
      allowPause:
        raw.planRules?.allowPause !== undefined
          ? Boolean(raw.planRules.allowPause)
          : raw.canPause !== false,
      allowRenewal:
        raw.planRules?.allowRenewal !== undefined
          ? Boolean(raw.planRules.allowRenewal)
          : raw.canRenew !== false,
    },
    history:
      Array.isArray(raw.history) && raw.history.length > 0
        ? raw.history
        : [
            {
              id: `evt_init_${raw.id}`,
              status: raw.status || 'active',
              label: 'Subscription created via Billing Checkout',
              actor: raw.customerName || 'Customer',
              timestamp: raw.createdAt || new Date().toISOString(),
            },
          ],
  };
}

function normalizeInvoice(raw, subsById = new Map()) {
  if (!raw) return raw;
  const linkedSub = raw.subscriptionId ? subsById.get(raw.subscriptionId) : null;
  const rawLines =
    Array.isArray(raw.lines) && raw.lines.length > 0
      ? raw.lines
      : Array.isArray(raw.lineItems)
      ? raw.lineItems
      : [];

  const normalizedLines = rawLines.map((line, idx) => {
    const desc =
      line.description ||
      (line.variant
        ? `${line.name} (${line.variant})`
        : line.name || 'Subscription Line');
    return {
      id: line.id || `inv_line_${raw.id}_${idx}`,
      name: line.name || desc,
      description: desc,
      variant: line.variant || null,
      quantity: Math.max(1, Number(line.quantity) || 1),
      unitPrice: Number(line.unitPrice) || 0,
      amount: Number(line.amount) || 0,
    };
  });

  const computedLineSum = normalizedLines.reduce(
    (sum, l) => sum + (Number(l.amount) || 0),
    0
  );
  const subtotal =
    Math.round(
      Number(raw.subtotal ?? (computedLineSum || raw.total || 0)) * 100
    ) / 100;
  const taxAmount = Math.round((Number(raw.taxAmount) || 0) * 100) / 100;
  const total =
    Math.round(Number(raw.total ?? subtotal + taxAmount) * 100) / 100;

  const status = raw.status || 'draft';
  const amountPaid =
    status === 'paid' && raw.amountPaid === undefined
      ? total
      : Math.round((Number(raw.amountPaid) || 0) * 100) / 100;
  const amountDue =
    status === 'cancelled' || status === 'paid'
      ? 0
      : Math.max(
          0,
          Math.round(Number(raw.amountDue ?? total - amountPaid) * 100) / 100
        );

  const invoiceDate =
    raw.invoiceDate || raw.date || new Date().toISOString().slice(0, 10);
  const dueDate = raw.dueDate || invoiceDate;

  const taxLines =
    Array.isArray(raw.taxLines) && raw.taxLines.length > 0
      ? raw.taxLines
      : taxAmount > 0
      ? [
          {
            id: 'tax_recorded',
            name: raw.taxRate || 'GST (18%)',
            rate:
              subtotal > 0
                ? Math.round((taxAmount / subtotal) * 10000) / 100
                : 18,
            taxableAmount: subtotal,
            amount: taxAmount,
          },
        ]
      : [];

  const payments =
    Array.isArray(raw.payments) && raw.payments.length > 0
      ? raw.payments
      : status === 'paid' && amountPaid > 0
      ? [
          {
            id: `pay_checkout_${raw.id}`,
            amount: amountPaid,
            method: raw.paymentMethod || 'Online Checkout',
            date: invoiceDate,
            note: 'Settled during subscription checkout',
            recordedBy: raw.customerName || 'Customer',
            createdAt: raw.paidAt || raw.createdAt || new Date().toISOString(),
          },
        ]
      : [];

  const billingCycleKey =
    raw.billingCycleKey ||
    (raw.subscriptionId && linkedSub
      ? `${raw.subscriptionId}_${linkedSub.nextBillingDate}`
      : '');

  return {
    ...raw,
    billingCycleKey,
    subscriptionId: raw.subscriptionId || '',
    subscriptionNumber:
      raw.subscriptionNumber || linkedSub?.subscriptionNumber || '—',
    customerId: raw.customerId ?? linkedSub?.customerId ?? '',
    customerName: raw.customerName || linkedSub?.customerName || 'Customer',
    customerEmail: raw.customerEmail || linkedSub?.customerEmail || '',
    customerOrganization:
      raw.customerOrganization ||
      raw.organization ||
      linkedSub?.customerOrganization ||
      '',
    organization:
      raw.organization ||
      raw.customerOrganization ||
      linkedSub?.customerOrganization ||
      '',
    billingAddress: raw.billingAddress || linkedSub?.billingAddress || '',
    planName:
      raw.planName ||
      linkedSub?.planName ||
      normalizedLines[0]?.name ||
      'Subscription Plan',
    billingPeriod: raw.billingPeriod || linkedSub?.billingPeriod || 'monthly',
    invoiceDate,
    date: invoiceDate,
    dueDate,
    period:
      raw.period ||
      (linkedSub ? `${linkedSub.startDate} — ${linkedSub.nextBillingDate}` : ''),
    lines: normalizedLines,
    lineItems: normalizedLines,
    grossSubtotal:
      Math.round(
        Number(raw.grossSubtotal ?? (computedLineSum || subtotal)) * 100
      ) / 100,
    discountRuleId: raw.discountRuleId || '',
    discountName: raw.discountName || '',
    discountLabel: raw.discountLabel || '',
    discountAmount: Math.round((Number(raw.discountAmount) || 0) * 100) / 100,
    discountUsageConsumed: Boolean(raw.discountUsageConsumed),
    subtotal,
    taxLines,
    taxRate:
      raw.taxRate ||
      (taxLines.length > 0
        ? taxLines.map((t) => `${t.rate}% ${t.name}`).join(' + ')
        : '0%'),
    taxAmount,
    total,
    amountPaid,
    amountDue,
    status,
    sentAt: raw.sentAt || null,
    sentTo: raw.sentTo || null,
    sentBy: raw.sentBy || null,
    sentCount: Number(raw.sentCount) || 0,
    payments,
  };
}

function readUnifiedSubscriptions() {
  const primary = readRawArray(SUBSCRIPTIONS_KEY);
  const legacy = readRawArray(LEGACY_SUBSCRIPTIONS_KEY);

  if (legacy.length === 0) {
    return primary.map(normalizeSubscription);
  }

  const seen = new Set(primary.map((s) => s.id));
  const merged = [...primary];
  legacy.forEach((item) => {
    if (item && item.id && !seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  });

  const normalized = merged.map(normalizeSubscription);
  writeStore(SUBSCRIPTIONS_KEY, normalized);
  try {
    localStorage.removeItem(LEGACY_SUBSCRIPTIONS_KEY);
  } catch {
    // ignore storage removal failure
  }
  return normalized;
}

function saveUnifiedSubscriptions(subs) {
  const normalized = subs.map(normalizeSubscription);
  writeStore(SUBSCRIPTIONS_KEY, normalized);
  return normalized;
}

function upsertUnifiedSubscription(subObj) {
  const normalized = normalizeSubscription(subObj);
  const all = readUnifiedSubscriptions();
  const idx = all.findIndex((s) => s.id === normalized.id);
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.unshift(normalized);
  }
  writeStore(SUBSCRIPTIONS_KEY, all);
  return normalized;
}

function readUnifiedInvoices(existingSubs = null) {
  const subs = existingSubs || readUnifiedSubscriptions();
  const subsById = new Map(subs.map((s) => [s.id, s]));

  const primary = readRawArray(INVOICES_KEY);
  const legacy = readRawArray(LEGACY_INVOICES_KEY);

  let combined = primary;
  if (legacy.length > 0) {
    const seen = new Set(primary.map((i) => i.id));
    combined = [...primary];
    legacy.forEach((item) => {
      if (item && item.id && !seen.has(item.id)) {
        seen.add(item.id);
        combined.push(item);
      }
    });
    writeStore(
      INVOICES_KEY,
      combined.map((i) => normalizeInvoice(i, subsById))
    );
    try {
      localStorage.removeItem(LEGACY_INVOICES_KEY);
    } catch {
      // ignore storage removal failure
    }
  }

  return combined.map((inv) => normalizeInvoice(inv, subsById));
}

function saveUnifiedInvoices(invoices, existingSubs = null) {
  const subs = existingSubs || readUnifiedSubscriptions();
  const subsById = new Map(subs.map((s) => [s.id, s]));
  const normalized = invoices.map((inv) => normalizeInvoice(inv, subsById));
  writeStore(INVOICES_KEY, normalized);
  return normalized;
}

function belongsToCustomer(record, user) {
  if (!user) return false;
  if (
    user.customerId !== undefined &&
    user.customerId !== null &&
    record.customerId !== undefined &&
    record.customerId !== null &&
    String(record.customerId) === String(user.customerId)
  ) {
    return true;
  }
  if (
    user.id !== undefined &&
    user.id !== null &&
    record.customerId !== undefined &&
    record.customerId !== null &&
    String(record.customerId) === String(user.id)
  ) {
    return true;
  }
  if (user.email && record.customerEmail) {
    return record.customerEmail.toLowerCase() === user.email.toLowerCase();
  }
  if (user.name && record.customerName && !record.customerEmail) {
    return record.customerName.toLowerCase() === user.name.toLowerCase();
  }
  return false;
}

function filterLocalSubscriptions(list, filters = {}) {
  return list.filter((sub) => {
    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'paused') {
        if (!(sub.status === 'active' && sub.isPaused)) return false;
      } else if (sub.status !== filters.status) {
        return false;
      }
    }
    if (
      filters.planId &&
      filters.planId !== 'all' &&
      sub.planId !== filters.planId
    ) {
      return false;
    }
    if (
      filters.customerId &&
      String(sub.customerId) !== String(filters.customerId)
    ) {
      return false;
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const hay = [
        sub.subscriptionNumber,
        sub.customerName,
        sub.customerEmail,
        sub.customerOrganization,
        sub.planName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function buildInvoiceFromSubscription(
  sub,
  seqNumber,
  actorUser,
  productsById,
  evalDateOverride = null
) {
  const today = evalDateOverride || new Date().toISOString().slice(0, 10);
  const dueDate = addPeriodToDate(today, 'weekly');
  const cycleKey = `${sub.id}_${sub.nextBillingDate}`;

  const rawLines =
    Array.isArray(sub.lineItems) && sub.lineItems.length > 0
      ? sub.lineItems
      : [
          {
            id: `line_${Date.now()}_0`,
            name: `${sub.planName} (${sub.productName})`,
            description: sub.variantLabel
              ? `${sub.productName} (${sub.variantLabel}) — ${sub.planName}`
              : `${sub.productName} — ${sub.planName}`,
            variant: sub.variantLabel || null,
            productId: sub.productId || '',
            quantity: sub.quantity,
            unitPrice: sub.unitPrice,
            amount: sub.grossSubtotal ?? sub.recurringAmount,
          },
        ];

  const lines = rawLines.map((item, idx) => {
    const desc =
      item.description ||
      (item.variant ? `${item.name} (${item.variant})` : item.name);
    const qty = Math.max(1, Number(item.quantity) || 1);
    const uPrice = Number(item.unitPrice) || 0;
    const lineAmt =
      item.amount !== undefined && Number(item.amount) > 0
        ? Number(item.amount)
        : Math.round(qty * uPrice * 100) / 100;
    return {
      id: `inv_line_${Date.now()}_${seqNumber}_${idx}`,
      name: item.name || desc,
      description: desc,
      variant: item.variant || null,
      productId: item.productId || (idx === 0 ? sub.productId || '' : ''),
      productType: item.productType || '',
      quantity: qty,
      unitPrice: uPrice,
      amount: lineAmt,
    };
  });

  const discCalc = evaluateApplicableDiscount(lines, {
    evalDate: today,
    preferredRuleId: sub.preferredDiscountRuleId || '',
    appliedRuleId: sub.appliedDiscountRuleId || '',
  });

  const taxableLines = discCalc.discountedLines.map((dl) => ({
    ...dl,
    amount: dl.netAmount,
  }));

  const defaultProductType = sub.productId
    ? productsById.get(sub.productId)?.type || ''
    : '';

  const taxCalc = calculateTaxesFromRules(taxableLines, {
    billingPeriod: sub.billingPeriod,
    defaultProductId: sub.productId,
    defaultProductType,
    productsById,
  });

  let discountUsageConsumed = false;
  if (discCalc.discountAmount > 0 && discCalc.discountRuleId) {
    consumeDiscountRuleUsage(discCalc.discountRuleId);
    discountUsageConsumed = true;
  }

  const nowIso = new Date().toISOString();

  return {
    id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${seqNumber}`,
    invoiceNumber: `INV-${seqNumber}`,
    billingCycleKey: cycleKey,
    subscriptionId: sub.id,
    subscriptionNumber: sub.subscriptionNumber,
    customerId: sub.customerId,
    customerName: sub.customerName,
    customerEmail: sub.customerEmail,
    customerOrganization: sub.customerOrganization || sub.organization || '',
    organization: sub.organization || sub.customerOrganization || '',
    billingAddress: sub.billingAddress || '',
    planName: sub.planName,
    billingPeriod: sub.billingPeriod,
    period: `${sub.startDate} — ${sub.nextBillingDate}`,
    invoiceDate: today,
    date: today,
    dueDate,
    lines,
    lineItems: lines,
    grossSubtotal: discCalc.grossSubtotal,
    discountRuleId: discCalc.discountRuleId,
    discountName: discCalc.discountName,
    discountLabel: discCalc.discountLabel,
    discountAmount: discCalc.discountAmount,
    discountUsageConsumed,
    subtotal: taxCalc.subtotal,
    taxLines: taxCalc.taxLines,
    taxRate: taxCalc.taxRate,
    taxAmount: taxCalc.taxAmount,
    total: taxCalc.total,
    amountPaid: 0,
    amountDue: taxCalc.total,
    status: 'draft',
    sentAt: null,
    sentTo: null,
    sentBy: null,
    sentCount: 0,
    payments: [],
    createdBy: actorUser?.name || actorUser?.email || 'Billing Day Engine',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export const operationsService = {
  /**
   * 40. GET /api/subscriptions?page=1&limit=100&status=...&planId=...&customerId=...&search=...
   * Hydrates child items (#41) and status history (#51) for company users.
   * Signed-in customers strictly receive only their own subscriptions.
   */
  async getSubscriptions(actorUser, filters = {}) {
    if (!actorUser) return [];

    if (actorUser.role === 'customer') {
      const all = readUnifiedSubscriptions();
      return filterLocalSubscriptions(
        all.filter((sub) => belongsToCustomer(sub, actorUser)),
        filters
      );
    }

    if (resolveCompanyUserId(actorUser)) {
      try {
        const apiStatus =
          filters.status &&
          filters.status !== 'all' &&
          filters.status !== 'paused'
            ? filters.status
            : undefined;
        const listRes = await apiClient.get('/api/subscriptions', {
          actorUser,
          query: {
            page: filters.page || 1,
            limit: Math.min(Number(filters.limit || 100), 100),
            status: apiStatus,
            planId:
              filters.planId && filters.planId !== 'all'
                ? filters.planId
                : undefined,
            customerId: filters.customerId || undefined,
            search: filters.search ? filters.search.trim() : undefined,
          },
        });
        const rows = Array.isArray(listRes)
          ? listRes
          : listRes?.subscriptions || [];

        const hydrated = await Promise.all(
          rows.map(async (row) => {
            try {
              const [detailRes, histRes] = await Promise.all([
                Array.isArray(row.items)
                  ? Promise.resolve({ subscription: row })
                  : apiClient.get(`/api/subscriptions/${row.id}`, {
                      actorUser,
                    }),
                apiClient
                  .get(`/api/subscriptions/${row.id}/history`, { actorUser })
                  .catch(() => ({ history: [] })),
              ]);
              return normalizeSubscription(
                mapApiSubscriptionToRaw(
                  detailRes?.subscription || detailRes,
                  histRes?.history || []
                )
              );
            } catch {
              return normalizeSubscription(mapApiSubscriptionToRaw(row, []));
            }
          })
        );

        const cleanApiSubs = hydrated.filter(Boolean);
        // Preserve any locally created self-service checkout subscriptions alongside live backend UUID rows
        const localOnlySubs = readUnifiedSubscriptions().filter(
          (s) => !isUuid(s.id)
        );
        const combined = [...cleanApiSubs, ...localOnlySubs];

        const isUnfiltered =
          (!filters.status || filters.status === 'all') &&
          (!filters.planId || filters.planId === 'all') &&
          !filters.customerId &&
          !filters.search;
        if (isUnfiltered) {
          saveUnifiedSubscriptions(combined);
        } else {
          cleanApiSubs.forEach((s) => upsertUnifiedSubscription(s));
        }

        return filterLocalSubscriptions(combined, filters);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const all = readUnifiedSubscriptions();
    return filterLocalSubscriptions(all, filters);
  },

  /**
   * 41. GET /api/subscriptions/{subscriptionId}
   * (+ 51. GET /api/subscriptions/{subscriptionId}/history)
   */
  async getSubscriptionById(subscriptionId, actorUser = null) {
    if (resolveCompanyUserId(actorUser) && isUuid(subscriptionId)) {
      try {
        const [detailRes, histRes] = await Promise.all([
          apiClient.get(`/api/subscriptions/${subscriptionId}`, { actorUser }),
          apiClient
            .get(`/api/subscriptions/${subscriptionId}/history`, { actorUser })
            .catch(() => ({ history: [] })),
        ]);
        const raw = mapApiSubscriptionToRaw(
          detailRes?.subscription || detailRes,
          histRes?.history || []
        );
        return upsertUnifiedSubscription(raw);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          if (err.status === 404) return null;
          throw err;
        }
      }
    }

    const found =
      readUnifiedSubscriptions().find((s) => s.id === subscriptionId) || null;
    if (
      found &&
      actorUser?.role === 'customer' &&
      !belongsToCustomer(found, actorUser)
    ) {
      throw new Error('Unauthorized subscription access.');
    }
    return found;
  },

  /**
   * 39. POST /api/subscriptions
   * Supports Quotation Templates, multi-product lines, and optional initialStatus
   * chaining (/quote #43 -> /confirm #44 -> /activate #45).
   */
  async createSubscription(payload, actorUser) {
    if (!actorUser) {
      throw new Error('Authentication required.');
    }
    const minQty = Number(payload.minQuantity) || 1;
    const planLabel = payload.planName || 'Standard Plan';

    let preparedLines = [];
    if (
      Array.isArray(payload.items || payload.lines) &&
      (payload.items || payload.lines).length > 0
    ) {
      const sourceLines = payload.items || payload.lines;
      preparedLines = sourceLines.map((line, idx) => {
        const qty = Math.max(1, Number(line.quantity) || 1);
        const uPrice = Math.max(
          0,
          Number(line.unitPrice ?? line.unit_price) || 0
        );
        const pName =
          line.productName || line.product_name || line.name || 'Product';
        const vLabel =
          line.variantLabel || line.variant_name || line.variant || '';
        const desc = vLabel ? `${pName} (${vLabel})` : pName;
        return {
          id: line.id || `line_${Date.now()}_${idx}`,
          productId: line.productId || line.product_id || '',
          productName: pName,
          name: pName,
          description: desc,
          variantId: line.variantId || line.variant_id || '',
          variant: vLabel || null,
          variantExtraPrice: Number(line.variantExtraPrice) || 0,
          quantity: qty,
          unitPrice: uPrice,
          amount: Math.round(qty * uPrice * 100) / 100,
          ...(Array.isArray(line.taxes)
            ? { taxes: line.taxes }
            : line.taxRatePercent !== undefined || line.taxRate !== undefined
            ? { taxes: normalizeTaxesInput(line) }
            : {}),
        };
      });

      const primaryLine =
        preparedLines.find(
          (l) => payload.productId && l.productId === payload.productId
        ) || preparedLines[0];

      if ((primaryLine?.quantity || 0) < minQty) {
        throw new Error(
          `Primary plan line quantity must be at least the plan minimum (${minQty}).`
        );
      }
    } else {
      const quantity = Math.max(1, Number(payload.quantity) || 1);
      if (quantity < minQty) {
        throw new Error(
          `Quantity must be at least the plan minimum (${minQty}).`
        );
      }
      const baseUnitPrice = Number(payload.baseUnitPrice) || 0;
      const variantExtraPrice = Number(payload.variantExtraPrice) || 0;
      const unitPrice = baseUnitPrice + variantExtraPrice;
      const lineAmount = Math.round(unitPrice * quantity * 100) / 100;
      const productName = payload.productName || planLabel;
      const variantLabel = payload.variantLabel || '';
      const lineDesc = variantLabel
        ? `${productName} (${variantLabel}) — ${planLabel}`
        : `${productName} — ${planLabel}`;

      preparedLines = [
        {
          id: `line_${Date.now()}_0`,
          productId: payload.productId || '',
          productName,
          name: productName,
          description: lineDesc,
          variantId: payload.variantId || '',
          variant: variantLabel || null,
          variantExtraPrice,
          quantity,
          unitPrice,
          amount: lineAmount,
        },
      ];
    }

    const leadLine = preparedLines[0];
    const today = new Date().toISOString().slice(0, 10);
    const startDate = payload.startDate || today;
    const billingPeriod = payload.billingPeriod || 'monthly';
    const nextBillingDate = addPeriodToDate(startDate, billingPeriod);
    const expiryDate = payload.expiryDate || nextBillingDate;
    const initialStatus = payload.initialStatus || 'draft';

    // Live backend path when authenticated as a company user (Admin / Staff)
    if (resolveCompanyUserId(actorUser)) {
      try {
        const customerIdNum = Number(payload.customerId);
        const apiBody = {
          customerId:
            Number.isInteger(customerIdNum) && customerIdNum > 0
              ? customerIdNum
              : payload.customerId,
          planId: payload.planId,
          quantity: Math.max(
            1,
            Math.round(Number(payload.quantity ?? leadLine?.quantity) || 1)
          ),
          startDate,
          expiryDate,
          paymentTerms: payload.paymentTerms || 'Net 30',
          items: preparedLines.map(buildApiSubscriptionItem),
        };

        const createRes = await apiClient.post('/api/subscriptions', apiBody, {
          actorUser,
        });
        let apiSub = createRes?.subscription || createRes;

        if (apiSub?.id) {
          saveSubscriptionMeta(apiSub.id, {
            customerId: apiSub.customer_id ?? payload.customerId,
            customerName: (payload.customerName || apiSub.customer_name || '').trim(),
            customerEmail: (payload.customerEmail || '').trim().toLowerCase(),
            customerOrganization: (payload.customerOrganization || '').trim(),
            planName: planLabel,
            billingPeriod,
            templateId: payload.templateId || '',
            templateName: payload.templateName || '',
            validityDays: payload.validityDays
              ? Number(payload.validityDays)
              : null,
            preferredDiscountRuleId: payload.preferredDiscountRuleId || '',
            paymentTerms: payload.paymentTerms || 'Net 30',
            startDate,
            expiryDate,
            nextBillingDate,
            planRules: {
              autoCloseOnEnd: payload.planRules?.autoCloseOnEnd ?? true,
              allowEarlyClose: payload.planRules?.allowEarlyClose ?? true,
              allowPause: payload.planRules?.allowPause ?? true,
              allowRenewal: payload.planRules?.allowRenewal ?? true,
            },
          });

          // Chain requested initialStatus transitions through backend endpoints #43 -> #44 -> #45
          if (
            initialStatus === 'quotation' ||
            initialStatus === 'confirmed' ||
            initialStatus === 'active'
          ) {
            const qRes = await apiClient.post(
              `/api/subscriptions/${apiSub.id}/quote`,
              undefined,
              { actorUser }
            );
            apiSub = qRes?.subscription || qRes;
          }
          if (initialStatus === 'confirmed' || initialStatus === 'active') {
            const cRes = await apiClient.post(
              `/api/subscriptions/${apiSub.id}/confirm`,
              undefined,
              { actorUser }
            );
            apiSub = cRes?.subscription || cRes;
          }
          if (initialStatus === 'active') {
            const aRes = await apiClient.post(
              `/api/subscriptions/${apiSub.id}/activate`,
              undefined,
              { actorUser }
            );
            apiSub = aRes?.subscription || aRes;
          }

          const histRes = await apiClient
            .get(`/api/subscriptions/${apiSub.id}/history`, { actorUser })
            .catch(() => ({ history: [] }));

          return upsertUnifiedSubscription(
            mapApiSubscriptionToRaw(apiSub, histRes?.history || [])
          );
        }
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    // Offline / Customer Self-Service Checkout fallback
    const all = readUnifiedSubscriptions();
    const subtotal =
      Math.round(preparedLines.reduce((sum, l) => sum + l.amount, 0) * 100) /
      100;
    const seq = 1001 + all.length;

    const templateSuffix = payload.templateName
      ? ` from template "${payload.templateName}"`
      : '';
    const initLabel =
      initialStatus === 'active'
        ? 'Subscription started via self-service portal'
        : initialStatus === 'quotation'
        ? `Quotation created${templateSuffix}`
        : `Draft created${templateSuffix}`;

    const newSub = normalizeSubscription({
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subscriptionNumber: `SUB-${seq}`,
      templateId: payload.templateId || '',
      templateName: payload.templateName || '',
      validityDays: payload.validityDays ? Number(payload.validityDays) : null,
      preferredDiscountRuleId: payload.preferredDiscountRuleId || '',
      customerId:
        payload.customerId ||
        (actorUser?.role === 'customer'
          ? actorUser.customerId || actorUser.id
          : undefined) ||
        `cust_${Date.now()}`,
      customerName: (
        payload.customerName ||
        actorUser?.name ||
        'Customer'
      ).trim(),
      customerEmail: (payload.customerEmail || actorUser?.email || '')
        .trim()
        .toLowerCase(),
      customerOrganization: (
        payload.customerOrganization ||
        actorUser?.organization ||
        ''
      ).trim(),
      planId: payload.planId || '',
      planName: planLabel,
      billingPeriod,
      productId: leadLine?.productId || payload.productId || '',
      productName: leadLine?.productName || planLabel,
      variantLabel: leadLine?.variant || '',
      variantExtraPrice: Number(leadLine?.variantExtraPrice) || 0,
      baseUnitPrice: Number(leadLine?.unitPrice) || 0,
      unitPrice: Number(leadLine?.unitPrice) || 0,
      quantity: Number(leadLine?.quantity) || 1,
      subtotal,
      recurringAmount: subtotal,
      lineItems: preparedLines,
      paymentTerms: payload.paymentTerms || 'Due on receipt',
      status: initialStatus,
      isPaused: false,
      startDate,
      expiryDate,
      nextBillingDate,
      planRules: {
        autoCloseOnEnd: payload.planRules?.autoCloseOnEnd ?? true,
        allowEarlyClose: payload.planRules?.allowEarlyClose ?? true,
        allowPause: payload.planRules?.allowPause ?? true,
        allowRenewal: payload.planRules?.allowRenewal ?? true,
      },
      history: [
        {
          id: `evt_${Date.now()}`,
          status: initialStatus,
          label: initLabel,
          actor: actorUser?.name || actorUser?.email || 'System',
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    all.unshift(newSub);
    saveUnifiedSubscriptions(all);
    return newSub;
  },

  /**
   * 42. PATCH /api/subscriptions/{subscriptionId}
   * Updates startDate, expiryDate, and paymentTerms on draft or quotation subscriptions.
   */
  async updateSubscriptionDetails(
    subscriptionId,
    { startDate, expiryDate, paymentTerms },
    actorUser
  ) {
    if (!actorUser) {
      throw new Error('Authentication required.');
    }

    if (resolveCompanyUserId(actorUser) && isUuid(subscriptionId)) {
      try {
        const body = {};
        if (startDate !== undefined) body.startDate = startDate || null;
        if (expiryDate !== undefined) body.expiryDate = expiryDate || null;
        if (paymentTerms !== undefined) body.paymentTerms = paymentTerms || null;

        const res = await apiClient.patch(
          `/api/subscriptions/${subscriptionId}`,
          body,
          { actorUser }
        );
        saveSubscriptionMeta(subscriptionId, {
          ...(startDate !== undefined ? { startDate } : {}),
          ...(expiryDate !== undefined ? { expiryDate } : {}),
          ...(paymentTerms !== undefined ? { paymentTerms } : {}),
        });
        const histRes = await apiClient
          .get(`/api/subscriptions/${subscriptionId}/history`, { actorUser })
          .catch(() => ({ history: [] }));
        return upsertUnifiedSubscription(
          mapApiSubscriptionToRaw(
            res?.subscription || res,
            histRes?.history || []
          )
        );
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === subscriptionId);
    if (idx === -1) throw new Error('Subscription not found.');
    if (all[idx].status !== 'draft' && all[idx].status !== 'quotation') {
      throw new Error('Only draft or quotation subscriptions can be updated.');
    }
    const updated = normalizeSubscription({
      ...all[idx],
      ...(startDate !== undefined ? { startDate } : {}),
      ...(expiryDate !== undefined ? { expiryDate } : {}),
      ...(paymentTerms !== undefined ? { paymentTerms } : {}),
      updatedAt: new Date().toISOString(),
    });
    all[idx] = updated;
    saveUnifiedSubscriptions(all);
    return updated;
  },

  /**
   * 47. GET /api/subscriptions/{subscriptionId}/items
   */
  async getSubscriptionItems(subscriptionId, actorUser = null) {
    if (resolveCompanyUserId(actorUser) && isUuid(subscriptionId)) {
      try {
        const res = await apiClient.get(
          `/api/subscriptions/${subscriptionId}/items`,
          { actorUser }
        );
        return Array.isArray(res) ? res : res?.items || [];
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }
    const sub = readUnifiedSubscriptions().find((s) => s.id === subscriptionId);
    return sub?.lineItems || [];
  },

  /**
   * 48. POST /api/subscriptions/{subscriptionId}/items (Draft status only)
   */
  async addSubscriptionItem(subscriptionId, itemData, actorUser = null) {
    if (resolveCompanyUserId(actorUser) && isUuid(subscriptionId)) {
      try {
        await apiClient.post(
          `/api/subscriptions/${subscriptionId}/items`,
          buildApiSubscriptionItem(itemData),
          { actorUser }
        );
        saveSubscriptionMeta(subscriptionId, { seatOverrideLines: null });
        return this.getSubscriptionById(subscriptionId, actorUser);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === subscriptionId);
    if (idx === -1) throw new Error('Subscription not found.');
    if (all[idx].status !== 'draft') {
      throw new Error('Only draft subscriptions can receive items.');
    }
    const nextLines = [
      ...(all[idx].lineItems || []),
      {
        id: `line_${Date.now()}`,
        productId: itemData.productId || '',
        productName: itemData.productName || 'Product',
        name: itemData.productName || 'Product',
        variantId: itemData.variantId || '',
        variant: itemData.variantLabel || itemData.variant || null,
        quantity: Math.max(1, Number(itemData.quantity) || 1),
        unitPrice: Math.max(0, Number(itemData.unitPrice) || 0),
        taxes: normalizeTaxesInput(itemData),
      },
    ];
    all[idx] = normalizeSubscription({
      ...all[idx],
      lineItems: nextLines,
      updatedAt: new Date().toISOString(),
    });
    saveUnifiedSubscriptions(all);
    return all[idx];
  },

  /**
   * 49. PATCH /api/subscriptions/{subscriptionId}/items/{itemId} (Draft status only)
   */
  async updateSubscriptionItem(
    subscriptionId,
    itemId,
    itemData,
    actorUser = null
  ) {
    if (
      resolveCompanyUserId(actorUser) &&
      isUuid(subscriptionId) &&
      isUuid(itemId)
    ) {
      try {
        const body = {};
        if (itemData.quantity !== undefined) {
          body.quantity = Math.max(1, Number(itemData.quantity) || 1);
        }
        if (itemData.unitPrice !== undefined) {
          body.unitPrice = Math.max(0, Number(itemData.unitPrice) || 0);
        }
        if (
          itemData.taxes !== undefined ||
          itemData.taxRatePercent !== undefined ||
          itemData.taxRate !== undefined
        ) {
          body.taxes = normalizeTaxesInput(itemData);
        }
        await apiClient.patch(
          `/api/subscriptions/${subscriptionId}/items/${itemId}`,
          body,
          { actorUser }
        );
        saveSubscriptionMeta(subscriptionId, { seatOverrideLines: null });
        return this.getSubscriptionById(subscriptionId, actorUser);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === subscriptionId);
    if (idx === -1) throw new Error('Subscription not found.');
    if (all[idx].status !== 'draft') {
      throw new Error('Only draft subscription items can be updated.');
    }
    const nextLines = (all[idx].lineItems || []).map((l) =>
      l.id === itemId
        ? {
            ...l,
            ...(itemData.quantity !== undefined
              ? { quantity: Math.max(1, Number(itemData.quantity) || 1) }
              : {}),
            ...(itemData.unitPrice !== undefined
              ? { unitPrice: Math.max(0, Number(itemData.unitPrice) || 0) }
              : {}),
            ...(itemData.taxes !== undefined ||
            itemData.taxRatePercent !== undefined
              ? { taxes: normalizeTaxesInput(itemData) }
              : {}),
          }
        : l
    );
    all[idx] = normalizeSubscription({
      ...all[idx],
      lineItems: nextLines,
      updatedAt: new Date().toISOString(),
    });
    saveUnifiedSubscriptions(all);
    return all[idx];
  },

  /**
   * 50. DELETE /api/subscriptions/{subscriptionId}/items/{itemId} (Draft status only)
   */
  async removeSubscriptionItem(subscriptionId, itemId, actorUser = null) {
    if (
      resolveCompanyUserId(actorUser) &&
      isUuid(subscriptionId) &&
      isUuid(itemId)
    ) {
      try {
        await apiClient.delete(
          `/api/subscriptions/${subscriptionId}/items/${itemId}`,
          { actorUser }
        );
        saveSubscriptionMeta(subscriptionId, { seatOverrideLines: null });
        return this.getSubscriptionById(subscriptionId, actorUser);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === subscriptionId);
    if (idx === -1) throw new Error('Subscription not found.');
    if (all[idx].status !== 'draft') {
      throw new Error('Only draft subscription items can be removed.');
    }
    const nextLines = (all[idx].lineItems || []).filter((l) => l.id !== itemId);
    all[idx] = normalizeSubscription({
      ...all[idx],
      lineItems: nextLines,
      updatedAt: new Date().toISOString(),
    });
    saveUnifiedSubscriptions(all);
    return all[idx];
  },

  /**
   * 51. GET /api/subscriptions/{subscriptionId}/history
   */
  async getSubscriptionHistory(subscriptionId, actorUser = null) {
    if (resolveCompanyUserId(actorUser) && isUuid(subscriptionId)) {
      try {
        const res = await apiClient.get(
          `/api/subscriptions/${subscriptionId}/history`,
          { actorUser }
        );
        const rows = Array.isArray(res) ? res : res?.history || [];
        return mapApiHistoryRows(rows);
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }
    const sub = readUnifiedSubscriptions().find((s) => s.id === subscriptionId);
    return sub?.history || [];
  },

  /**
   * Update seat quantities / product lines and discount preference on a non-closed subscription
   * (e.g. when a customer asks for a better price for taking more seats).
   * If the subscription is a backend Draft subscription and actor is a company user,
   * also syncs item quantities/prices via 49. PATCH /api/subscriptions/{id}/items/{itemId}.
   */
  async updateSubscriptionSeatsAndDiscount(
    id,
    { lines, preferredDiscountRuleId },
    actorUser
  ) {
    if (!actorUser) {
      throw new Error('Authentication required.');
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error('Subscription not found.');
    }

    const existing = all[idx];
    if (
      actorUser.role === 'customer' &&
      !belongsToCustomer(existing, actorUser)
    ) {
      throw new Error(
        'You do not have permission to modify this subscription.'
      );
    }
    if (existing.status === 'closed') {
      throw new Error('Closed subscriptions cannot be modified.');
    }

    const nextLines =
      Array.isArray(lines) && lines.length > 0
        ? lines.map((line, lIdx) => {
            const origLine = existing.lineItems?.[lIdx] || {};
            const qty = Math.max(1, Number(line.quantity) || 1);
            const uPrice =
              actorUser.role === 'customer'
                ? Math.max(0, Number(origLine.unitPrice ?? line.unitPrice) || 0)
                : Math.max(0, Number(line.unitPrice) || 0);
            const pName = line.productName || line.name || 'Product';
            const vLabel = line.variantLabel ?? line.variant ?? '';
            const desc = vLabel ? `${pName} (${vLabel})` : pName;
            return {
              ...origLine,
              ...line,
              id: line.id || origLine.id || `line_${Date.now()}_${lIdx}`,
              productId: line.productId || origLine.productId || '',
              productName: pName,
              name: pName,
              description: desc,
              variant: vLabel || null,
              quantity: qty,
              unitPrice: uPrice,
              amount: Math.round(qty * uPrice * 100) / 100,
            };
          })
        : existing.lineItems;

    const nextRulePref =
      actorUser.role === 'customer'
        ? existing.preferredDiscountRuleId || ''
        : preferredDiscountRuleId !== undefined
        ? preferredDiscountRuleId
        : existing.preferredDiscountRuleId || '';

    // Sync Draft item edits directly to backend endpoint #49 when online
    if (
      resolveCompanyUserId(actorUser) &&
      isUuid(id) &&
      existing.status === 'draft'
    ) {
      try {
        for (const nl of nextLines) {
          if (nl.id && isUuid(nl.id)) {
            await apiClient.patch(
              `/api/subscriptions/${id}/items/${nl.id}`,
              {
                quantity: nl.quantity,
                unitPrice: nl.unitPrice,
                ...(Array.isArray(nl.taxes) ? { taxes: nl.taxes } : {}),
              },
              { actorUser }
            );
          }
        }
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    const leadLine = nextLines[0] || existing.lineItems?.[0];
    const nowIso = new Date().toISOString();

    const normalized = normalizeSubscription({
      ...existing,
      preferredDiscountRuleId: nextRulePref,
      appliedDiscountRuleId: '',
      quantity: Number(leadLine?.quantity ?? existing.quantity) || 1,
      unitPrice: Number(leadLine?.unitPrice ?? existing.unitPrice) || 0,
      lineItems: nextLines,
      updatedAt: nowIso,
    });

    const totalSeats = normalized.lineItems.reduce(
      (sum, l) => sum + (Number(l.quantity) || 0),
      0
    );
    const discountNote =
      normalized.discountAmount > 0
        ? ` — ${normalized.discountLabel} active`
        : '';

    const seatEvent = {
      id: `evt_seats_${Date.now()}`,
      status: normalized.status,
      label: `Updated seats/pricing (${totalSeats} total qty)${discountNote}`,
      actor: actorUser.name || actorUser.email || 'Operator',
      timestamp: nowIso,
    };

    normalized.history = [...(existing.history || []), seatEvent];

    if (isUuid(id)) {
      const prevMeta = getSubscriptionMetaMap()[id] || {};
      saveSubscriptionMeta(id, {
        preferredDiscountRuleId: nextRulePref,
        appliedDiscountRuleId: '',
        ...(existing.status !== 'draft'
          ? { seatOverrideLines: nextLines }
          : { seatOverrideLines: null }),
        localEvents: [...(prevMeta.localEvents || []), seatEvent],
      });
    }

    all[idx] = normalized;
    saveUnifiedSubscriptions(all);
    return normalized;
  },

  /**
   * Transition a subscription state according to lifecycle and plan switches.
   * Calls live backend endpoints #43 (/quote), #44 (/confirm), #45 (/activate), #46 (/close).
   */
  async transitionSubscription(id, action, actorUser) {
    if (!actorUser) {
      throw new Error('Authentication required.');
    }
    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === id);
    const existing = idx >= 0 ? all[idx] : null;

    if (
      existing &&
      actorUser.role === 'customer' &&
      !belongsToCustomer(existing, actorUser)
    ) {
      throw new Error(
        'You do not have permission to modify this subscription.'
      );
    }

    // Enforce plan early-close policy before calling /close
    if (action === 'close' && existing) {
      const today = new Date().toISOString().slice(0, 10);
      const isBeforeExpiry = !existing.expiryDate || today < existing.expiryDate;
      if (
        existing.status === 'active' &&
        isBeforeExpiry &&
        !existing.planRules?.allowEarlyClose &&
        actorUser.role !== 'admin'
      ) {
        throw new Error(
          'This plan does not permit early closure before its expiry date.'
        );
      }
    }

    const backendEndpointByAction = {
      quote: 'quote',
      send_quotation: 'quote',
      confirm: 'confirm',
      activate: 'activate',
      close: 'close',
    };
    const backendSlug = backendEndpointByAction[action];

    if (resolveCompanyUserId(actorUser) && isUuid(id) && backendSlug) {
      try {
        if (action === 'confirm' && existing?.status === 'draft') {
          await apiClient.post(`/api/subscriptions/${id}/quote`, undefined, {
            actorUser,
          });
        }
        const res = await apiClient.post(
          `/api/subscriptions/${id}/${backendSlug}`,
          undefined,
          { actorUser }
        );
        if (action === 'activate' || action === 'close') {
          saveSubscriptionMeta(id, { isPaused: false });
        }
        const histRes = await apiClient
          .get(`/api/subscriptions/${id}/history`, { actorUser })
          .catch(() => ({ history: [] }));
        return upsertUnifiedSubscription(
          mapApiSubscriptionToRaw(
            res?.subscription || res,
            histRes?.history || []
          )
        );
      } catch (err) {
        if (!isNetworkOfflineError(err)) {
          throw err;
        }
      }
    }

    if (idx === -1) {
      throw new Error('Subscription not found.');
    }

    const sub = { ...all[idx] };
    let eventLabel = '';
    const actorName = actorUser.name || actorUser.email || 'Operator';

    switch (action) {
      case 'quote':
      case 'send_quotation': {
        if (sub.status !== 'draft') {
          throw new Error('Only Draft records can be sent as a Quotation.');
        }
        sub.status = 'quotation';
        eventLabel = 'Moved from Draft to Quotation';
        break;
      }
      case 'confirm': {
        if (sub.status !== 'quotation' && sub.status !== 'draft') {
          throw new Error('Only Draft or Quotation records can be confirmed.');
        }
        sub.status = 'confirmed';
        eventLabel = 'Quotation confirmed';
        break;
      }
      case 'activate': {
        if (sub.status !== 'confirmed') {
          throw new Error('Subscription must be Confirmed before activation.');
        }
        sub.status = 'active';
        sub.isPaused = false;
        eventLabel = 'Subscription activated';
        break;
      }
      case 'pause': {
        if (sub.status !== 'active') {
          throw new Error('Only Active subscriptions can be paused.');
        }
        if (!sub.planRules?.allowPause) {
          throw new Error('This plan does not allow pausing.');
        }
        sub.isPaused = true;
        eventLabel = 'Subscription paused';
        break;
      }
      case 'resume': {
        if (sub.status !== 'active' || !sub.isPaused) {
          throw new Error('Subscription is not currently paused.');
        }
        sub.isPaused = false;
        eventLabel = 'Subscription resumed';
        break;
      }
      case 'renew': {
        if (sub.status !== 'active' && sub.status !== 'closed') {
          throw new Error('Only Active or Closed subscriptions can be renewed.');
        }
        if (!sub.planRules?.allowRenewal) {
          throw new Error('This plan does not allow renewal.');
        }
        sub.status = 'active';
        sub.isPaused = false;
        sub.expiryDate = addPeriodToDate(sub.expiryDate, sub.billingPeriod);
        sub.nextBillingDate = addPeriodToDate(
          sub.nextBillingDate,
          sub.billingPeriod
        );
        eventLabel = `Renewed through ${sub.expiryDate}`;
        break;
      }
      case 'close': {
        if (sub.status === 'closed') {
          throw new Error('Subscription is already closed.');
        }
        sub.status = 'closed';
        sub.isPaused = false;
        eventLabel = 'Subscription closed';
        break;
      }
      default:
        throw new Error(`Unsupported transition: ${action}`);
    }

    sub.updatedAt = new Date().toISOString();
    const localEvt = {
      id: `evt_${Date.now()}`,
      status: sub.status,
      label: eventLabel,
      actor: actorName,
      timestamp: sub.updatedAt,
    };
    sub.history = [...(sub.history || []), localEvt];

    if (isUuid(id)) {
      const prevMeta = getSubscriptionMetaMap()[id] || {};
      saveSubscriptionMeta(id, {
        isPaused: sub.isPaused,
        expiryDate: sub.expiryDate,
        nextBillingDate: sub.nextBillingDate,
        localEvents: [...(prevMeta.localEvents || []), localEvt],
      });
    }

    all[idx] = sub;
    saveUnifiedSubscriptions(all);
    return sub;
  },

  /**
   * Fetch invoices scoped by role.
   * Customers strictly receive only their own confirmed, paid, or sent invoices.
   */
  async getInvoices(actorUser) {
    if (!actorUser) return [];
    const all = readUnifiedInvoices();
    if (actorUser.role === 'customer') {
      return all.filter(
        (inv) =>
          belongsToCustomer(inv, actorUser) &&
          inv.status !== 'cancelled' &&
          (inv.status === 'confirmed' ||
            inv.status === 'paid' ||
            Boolean(inv.sentAt))
      );
    }
    return all;
  },

  /**
   * Generate a single Draft invoice for an active subscription for its current billing cycle.
   */
  async generateInvoiceForSubscription(
    subscriptionId,
    actorUser,
    options = {}
  ) {
    const subs = readUnifiedSubscriptions();
    const subIdx = subs.findIndex((s) => s.id === subscriptionId);
    if (subIdx === -1) {
      throw new Error('Subscription not found.');
    }

    const sub = subs[subIdx];
    if (sub.status !== 'active') {
      throw new Error(
        'Invoices can only be generated for Active subscriptions.'
      );
    }
    if (sub.isPaused) {
      throw new Error('Paused subscriptions are skipped until resumed.');
    }

    const invoices = readUnifiedInvoices(subs);
    const cycleKey = `${sub.id}_${sub.nextBillingDate}`;
    const duplicate = invoices.find(
      (inv) => inv.billingCycleKey === cycleKey && inv.status !== 'cancelled'
    );

    if (duplicate) {
      throw new Error(
        `Cycle ending ${sub.nextBillingDate} was already billed (${duplicate.invoiceNumber}). Duplicate skipped.`
      );
    }

    const productsById = getProductsMap();
    const seq = 2001 + invoices.length;
    const newInvoice = buildInvoiceFromSubscription(
      sub,
      seq,
      actorUser,
      productsById,
      options.billingDate || null
    );

    if (newInvoice.discountRuleId && !sub.appliedDiscountRuleId) {
      subs[subIdx] = {
        ...sub,
        appliedDiscountRuleId: newInvoice.discountRuleId,
      };
      if (isUuid(sub.id)) {
        saveSubscriptionMeta(sub.id, {
          appliedDiscountRuleId: newInvoice.discountRuleId,
        });
      }
      saveUnifiedSubscriptions(subs);
    }

    invoices.unshift(newInvoice);
    saveUnifiedInvoices(invoices, subs);
    return newInvoice;
  },

  /**
   * Billing Day Run:
   * Automatically generates Draft invoices across all eligible active, unpaused subscriptions.
   */
  async runBilling(actorUser, options = {}) {
    if (resolveCompanyUserId(actorUser)) {
      try {
        await this.getSubscriptions(actorUser);
      } catch {
        // proceed with cached subscriptions if offline
      }
    }

    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const runs = readRawArray(BILLING_RUNS_KEY);
    const productsById = getProductsMap();
    const today = options.billingDate || new Date().toISOString().slice(0, 10);

    let subsModified = false;
    let autoClosedCount = 0;
    for (let idx = 0; idx < subs.length; idx += 1) {
      const sub = subs[idx];
      if (
        sub.status === 'active' &&
        sub.planRules?.autoCloseOnEnd &&
        sub.expiryDate &&
        sub.expiryDate < today
      ) {
        if (resolveCompanyUserId(actorUser) && isUuid(sub.id)) {
          try {
            await apiClient.post(
              `/api/subscriptions/${sub.id}/close`,
              undefined,
              { actorUser }
            );
          } catch {
            // continue local auto-close update if offline
          }
        }
        subs[idx] = {
          ...sub,
          status: 'closed',
          isPaused: false,
          updatedAt: new Date().toISOString(),
          history: [
            ...(sub.history || []),
            {
              id: `evt_autoclose_${Date.now()}_${idx}`,
              status: 'closed',
              label: 'Automatically closed at plan end date',
              actor: 'Billing Day Engine',
              timestamp: new Date().toISOString(),
            },
          ],
        };
        subsModified = true;
        autoClosedCount += 1;
      }
    }

    if (subsModified) {
      saveUnifiedSubscriptions(subs);
    }

    const pausedCount = subs.filter(
      (s) => s.status === 'active' && s.isPaused
    ).length;
    const eligible = subs.filter((s) => s.status === 'active' && !s.isPaused);
    let createdCount = 0;
    let skippedCount = 0;
    let discountedCount = 0;
    let subsDiscountLocked = false;

    eligible.forEach((sub) => {
      const cycleKey = `${sub.id}_${sub.nextBillingDate}`;
      const exists = invoices.some(
        (inv) => inv.billingCycleKey === cycleKey && inv.status !== 'cancelled'
      );

      if (exists) {
        skippedCount += 1;
        return;
      }

      const seq = 2001 + invoices.length;
      const draftInv = buildInvoiceFromSubscription(
        sub,
        seq,
        actorUser,
        productsById,
        today
      );
      if (draftInv.discountAmount > 0) {
        discountedCount += 1;
        if (draftInv.discountRuleId && !sub.appliedDiscountRuleId) {
          const sIdx = subs.findIndex((s) => s.id === sub.id);
          if (sIdx !== -1) {
            subs[sIdx] = {
              ...subs[sIdx],
              appliedDiscountRuleId: draftInv.discountRuleId,
            };
            if (isUuid(sub.id)) {
              saveSubscriptionMeta(sub.id, {
                appliedDiscountRuleId: draftInv.discountRuleId,
              });
            }
            subsDiscountLocked = true;
          }
        }
      }
      invoices.unshift(draftInv);
      createdCount += 1;
    });

    if (subsDiscountLocked) {
      saveUnifiedSubscriptions(subs);
    }
    saveUnifiedInvoices(invoices, subs);

    const activeRules = taxService
      .getTaxRulesSync()
      .filter((r) => r.isActive !== false);
    const appliedTaxSummary =
      activeRules.length > 0
        ? activeRules.map((r) => `${r.name} (${r.rate}%)`).join(', ')
        : '0% (No active tax rules)';

    const nowIso = new Date().toISOString();
    const runSummary = {
      id: `run_${Date.now()}`,
      timestamp: nowIso,
      createdAt: nowIso,
      runDate: today,
      actor: actorUser?.name || actorUser?.email || 'Operator',
      eligibleCount: eligible.length,
      createdCount,
      skippedCount,
      discountedCount,
      failedCount: 0,
      created: createdCount,
      skipped: skippedCount,
      failed: 0,
      pausedCount,
      autoClosedCount,
      appliedTaxSummary,
    };

    runs.unshift(runSummary);
    writeStore(BILLING_RUNS_KEY, runs.slice(0, 20));
    return runSummary;
  },

  async getBillingRuns() {
    return readRawArray(BILLING_RUNS_KEY);
  },

  async updateInvoiceStatus(invoiceId, nextStatus) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const idx = invoices.findIndex((i) => i.id === invoiceId);
    if (idx === -1) {
      throw new Error('Invoice not found.');
    }

    const inv = { ...invoices[idx] };
    if (nextStatus === 'confirmed') {
      if (inv.status !== 'draft') {
        throw new Error('Only Draft invoices can be confirmed.');
      }
      inv.status = 'confirmed';
    } else if (nextStatus === 'cancelled') {
      if (inv.status === 'paid' || inv.amountPaid > 0) {
        throw new Error('Paid or partially paid invoices cannot be cancelled.');
      }
      if (inv.discountUsageConsumed && inv.discountRuleId) {
        releaseDiscountRuleUsage(inv.discountRuleId);
        inv.discountUsageConsumed = false;
      }
      inv.status = 'cancelled';
      inv.amountDue = 0;
    } else {
      throw new Error('Invalid invoice status update.');
    }

    inv.updatedAt = new Date().toISOString();
    invoices[idx] = inv;
    saveUnifiedInvoices(invoices, subs);
    return inv;
  },

  async confirmInvoice(invoiceId) {
    return this.updateInvoiceStatus(invoiceId, 'confirmed');
  },

  async cancelInvoice(invoiceId) {
    return this.updateInvoiceStatus(invoiceId, 'cancelled');
  },

  async confirmAllDraftInvoices() {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    let confirmedCount = 0;
    const nowIso = new Date().toISOString();

    const updated = invoices.map((inv) => {
      if (inv.status === 'draft') {
        confirmedCount += 1;
        return {
          ...inv,
          status: 'confirmed',
          updatedAt: nowIso,
        };
      }
      return inv;
    });

    if (confirmedCount > 0) {
      saveUnifiedInvoices(updated, subs);
    }
    return { confirmedCount };
  },

  async sendInvoice(invoiceId, actorUser) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const idx = invoices.findIndex((i) => i.id === invoiceId);
    if (idx === -1) {
      throw new Error('Invoice not found.');
    }

    const inv = { ...invoices[idx] };
    if (inv.status === 'cancelled') {
      throw new Error('Cancelled invoices cannot be sent.');
    }

    const nowIso = new Date().toISOString();
    inv.sentAt = nowIso;
    inv.sentTo = inv.customerEmail || 'customer@brightloop.io';
    inv.sentBy = actorUser?.name || actorUser?.email || 'Billing Team';
    inv.sentCount = (Number(inv.sentCount) || 0) + 1;
    inv.updatedAt = nowIso;

    invoices[idx] = inv;
    saveUnifiedInvoices(invoices, subs);
    return inv;
  },

  async recordPayment(invoiceId, { amount, method, date, note }, actorUser) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const idx = invoices.findIndex((i) => i.id === invoiceId);
    if (idx === -1) {
      throw new Error('Invoice not found.');
    }

    const inv = { ...invoices[idx] };
    if (actorUser?.role === 'customer' && !belongsToCustomer(inv, actorUser)) {
      throw new Error('Unauthorized invoice access.');
    }

    if (inv.status === 'cancelled') {
      throw new Error('Cannot record payment on a cancelled invoice.');
    }
    if (inv.status === 'draft') {
      throw new Error(
        'Please confirm the Draft invoice before recording payment.'
      );
    }
    if (inv.status === 'paid' || inv.amountDue <= 0) {
      throw new Error('Invoice is already settled in full.');
    }

    const payAmount =
      amount !== undefined && amount !== null && amount !== ''
        ? Number(amount)
        : Number(inv.amountDue);
    if (!payAmount || payAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    if (payAmount > inv.amountDue + 0.005) {
      throw new Error(
        'Payment amount cannot exceed the remaining balance due.'
      );
    }

    const paymentRecord = {
      id: `pay_${Date.now()}`,
      amount: Math.round(payAmount * 100) / 100,
      method: method || 'Bank Transfer',
      date: date || new Date().toISOString().slice(0, 10),
      note: (note || '').trim(),
      recordedBy: actorUser?.name || actorUser?.email || 'Customer',
      createdAt: new Date().toISOString(),
    };

    const nextPaid =
      Math.round((inv.amountPaid + paymentRecord.amount) * 100) / 100;
    const nextDue = Math.max(
      0,
      Math.round((inv.total - nextPaid) * 100) / 100
    );

    inv.payments = [...(inv.payments || []), paymentRecord];
    inv.amountPaid = nextPaid;
    inv.amountDue = nextDue;
    inv.status = nextDue === 0 ? 'paid' : 'confirmed';
    if (inv.status === 'paid') {
      inv.paidAt = new Date().toISOString();
    }
    inv.updatedAt = new Date().toISOString();

    invoices[idx] = inv;
    saveUnifiedInvoices(invoices, subs);
    return inv;
  },

  async getPayments(filters = {}, actorUser) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);

    const scopedInvoices =
      actorUser?.role === 'customer'
        ? invoices.filter((i) => belongsToCustomer(i, actorUser))
        : invoices;

    const allPayments = [];
    scopedInvoices.forEach((inv) => {
      if (Array.isArray(inv.payments)) {
        inv.payments.forEach((p) => {
          allPayments.push({
            ...p,
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerId: inv.customerId,
            customerName: inv.customerName,
            customerEmail: inv.customerEmail,
            organization: inv.organization,
            subscriptionNumber: inv.subscriptionNumber,
            invoiceTotal: inv.total,
            invoiceStatus: inv.status,
            invoiceAmountDue: inv.amountDue,
          });
        });
      }
    });

    allPayments.sort(
      (a, b) =>
        new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
    );

    const { method, search, fromDate, toDate } = filters;
    return allPayments.filter((p) => {
      if (method && method !== 'all' && p.method !== method) {
        return false;
      }
      if (fromDate && p.date && p.date < fromDate) {
        return false;
      }
      if (toDate && p.date && p.date > toDate) {
        return false;
      }
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesInv = p.invoiceNumber?.toLowerCase().includes(q);
        const matchesCust = p.customerName?.toLowerCase().includes(q);
        const matchesOrg = p.organization?.toLowerCase().includes(q);
        const matchesNote = p.note?.toLowerCase().includes(q);
        const matchesMethod = p.method?.toLowerCase().includes(q);
        const matchesId = p.id?.toLowerCase().includes(q);
        if (
          !matchesInv &&
          !matchesCust &&
          !matchesOrg &&
          !matchesNote &&
          !matchesMethod &&
          !matchesId
        ) {
          return false;
        }
      }
      return true;
    });
  },

  async getPaymentSummary(actorUser) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);

    const scopedInvoices =
      actorUser?.role === 'customer'
        ? invoices.filter((i) => belongsToCustomer(i, actorUser))
        : invoices;

    let totalCollected = 0;
    let totalOutstanding = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let paymentCount = 0;
    let confirmedCount = 0;
    let paidCount = 0;

    const todayStr = new Date().toISOString().slice(0, 10);

    scopedInvoices.forEach((inv) => {
      if (inv.status === 'paid') {
        paidCount += 1;
      }
      if (inv.status === 'confirmed') {
        confirmedCount += 1;
        totalOutstanding += inv.amountDue || 0;
        if (inv.dueDate && inv.dueDate < todayStr && (inv.amountDue || 0) > 0) {
          overdueCount += 1;
          overdueAmount += inv.amountDue || 0;
        }
      }
      if (Array.isArray(inv.payments)) {
        inv.payments.forEach((p) => {
          paymentCount += 1;
          totalCollected += Number(p.amount) || 0;
        });
      }
    });

    return {
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      overdueCount,
      paymentCount,
      confirmedCount,
      paidCount,
      totalInvoices: scopedInvoices.length,
    };
  },

  async sendPaymentReminder(invoiceId) {
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const idx = invoices.findIndex((i) => i.id === invoiceId);
    if (idx === -1) throw new Error('Invoice not found.');

    const inv = { ...invoices[idx] };
    inv.lastReminderSentAt = new Date().toISOString();
    inv.reminderCount = (inv.reminderCount || 0) + 1;
    inv.updatedAt = new Date().toISOString();

    invoices[idx] = inv;
    saveUnifiedInvoices(invoices, subs);
    return inv;
  },
};
