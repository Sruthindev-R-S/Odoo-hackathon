/**
 * Operations Service Layer (Subscriptions, Billing Day & Invoices)
 *
 * Unifies storage seamlessly with CustomerBillingPage (billingService.js) while enforcing:
 * - Strict customer tenant isolation when signed in as a customer
 * - Subscription lifecycle transitions (Draft -> Quotation -> Confirmed -> Active -> Closed)
 * - Plan behavioral switches (autoCloseOnEnd, allowEarlyClose, allowPause, allowRenewal)
 * - Billing Day bulk invoice creation from subscriptions (customer details, product lines,
 *   automatic tax calculation from Admin tax rules, and totals pre-filled)
 * - Invoice lifecycle (Draft -> Confirmed -> Paid, plus Cancel, Send, and Print)
 * - Duplicate-billing & skip prevention via deterministic billing cycle keys
 */

import { calculateTaxesFromRules, taxService } from './taxService.js';
import {
  evaluateApplicableDiscount,
  consumeDiscountRuleUsage,
  releaseDiscountRuleUsage,
} from './discountService.js';

const SUBSCRIPTIONS_KEY = 'brightloop_subscriptions_v1';
const LEGACY_SUBSCRIPTIONS_KEY = 'brightloop_subscriptions';
const INVOICES_KEY = 'brightloop_invoices_v1';
const LEGACY_INVOICES_KEY = 'brightloop_invoices';
const BILLING_RUNS_KEY = 'brightloop_billing_runs';
const PRODUCTS_KEY = 'brightloop_products';

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

function getProductsMap() {
  const products = readRawArray(PRODUCTS_KEY);
  const map = new Map();
  products.forEach((p) => {
    if (p && p.id) map.set(p.id, p);
  });
  return map;
}

function addPeriodToDate(dateStr, period) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date();
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
        (fallbackUnitPrice > 0 ? fallbackUnitPrice * fallbackQuantity : raw.amount)
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

  const lineItems = rawLines.map((item, idx) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const uPrice = Number(item.unitPrice) || 0;
    const untaxedAmount =
      Math.round(
        (item.amount !== undefined && Number(item.amount) > 0
          ? Number(item.amount)
          : uPrice * qty) * 100
      ) / 100;
    const prodId = item.productId || (idx === 0 ? raw.productId || '' : '');
    const prodName =
      item.productName || item.name || (idx === 0 ? primaryProductName : 'Product');
    const variantText = item.variant || item.variantLabel || null;
    const desc =
      item.description ||
      (variantText ? `${prodName} (${variantText})` : prodName);

    const lineTax = calculateTaxesFromRules(
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
        defaultProductType: prodId ? productsById.get(prodId)?.type || '' : '',
        productsById,
      }
    );

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
      taxRate: lineTax.taxRate,
      taxAmount: lineTax.taxAmount,
      totalWithTax: lineTax.total,
    };
  });

  const preferredDiscountRuleId = raw.preferredDiscountRuleId || '';
  const discCalc = evaluateApplicableDiscount(lineItems, {
    evalDate: new Date().toISOString().slice(0, 10),
    preferredRuleId: preferredDiscountRuleId,
  });

  const taxableLines = discCalc.discountedLines.map((dl) => ({
    ...dl,
    amount: dl.netAmount,
  }));

  const subTaxCalc = calculateTaxesFromRules(taxableLines, {
    billingPeriod,
    defaultProductId: raw.productId || lineItems[0]?.productId || '',
    productsById,
  });

  const startDate = raw.startDate || new Date().toISOString().slice(0, 10);
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
      raw.validityDays !== undefined && raw.validityDays !== null && raw.validityDays !== ''
        ? Number(raw.validityDays)
        : null,
    preferredDiscountRuleId,
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
      Number(raw.baseUnitPrice ?? leadLine?.unitPrice ?? fallbackUnitPrice) || 0,
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
    expiryDate: raw.expiryDate || raw.currentPeriodEnd || nextBillingDate,
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
  const rawLines = Array.isArray(raw.lines) && raw.lines.length > 0
    ? raw.lines
    : Array.isArray(raw.lineItems)
    ? raw.lineItems
    : [];

  const normalizedLines = rawLines.map((line, idx) => {
    const desc =
      line.description ||
      (line.variant ? `${line.name} (${line.variant})` : line.name || 'Subscription Line');
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
  const subtotal = Math.round(
    Number(raw.subtotal ?? (computedLineSum || raw.total || 0)) * 100
  ) / 100;
  const taxAmount = Math.round((Number(raw.taxAmount) || 0) * 100) / 100;
  const total = Math.round(
    Number(raw.total ?? subtotal + taxAmount) * 100
  ) / 100;

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
            rate: subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 18,
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

  // Map checkout-generated invoices to the subscription's initial cycle key so Billing Day never double-bills
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
    customerId: raw.customerId || linkedSub?.customerId || '',
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
    billingPeriod:
      raw.billingPeriod || linkedSub?.billingPeriod || 'monthly',
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
    writeStore(INVOICES_KEY, combined.map((i) => normalizeInvoice(i, subsById)));
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
  if (user.customerId && record.customerId && record.customerId === user.customerId) {
    return true;
  }
  if (user.id && record.customerId && record.customerId === user.id) {
    return true;
  }
  if (user.email && record.customerEmail) {
    return record.customerEmail.toLowerCase() === user.email.toLowerCase();
  }
  return false;
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
   * Fetch subscriptions scoped by role.
   * Signed-in customers strictly receive only their own subscriptions.
   */
  async getSubscriptions(actorUser) {
    await new Promise((r) => setTimeout(r, 50));
    if (!actorUser) return [];
    const all = readUnifiedSubscriptions();
    if (actorUser.role === 'customer') {
      return all.filter((sub) => belongsToCustomer(sub, actorUser));
    }
    return all;
  },

  /**
   * Create a new subscription or quotation (supports Quotation Templates and multi-product lines).
   */
  async createSubscription(payload, actorUser) {
    await new Promise((r) => setTimeout(r, 90));
    if (!actorUser) {
      throw new Error('Authentication required.');
    }
    const all = readUnifiedSubscriptions();
    const minQty = Number(payload.minQuantity) || 1;
    const planLabel = payload.planName || 'Standard Plan';

    let preparedLines = [];
    if (Array.isArray(payload.lines) && payload.lines.length > 0) {
      preparedLines = payload.lines.map((line, idx) => {
        const qty = Math.max(1, Number(line.quantity) || 1);
        const uPrice = Math.max(0, Number(line.unitPrice) || 0);
        const pName = line.productName || line.name || 'Product';
        const vLabel = line.variantLabel || line.variant || '';
        const desc = vLabel ? `${pName} (${vLabel})` : pName;
        return {
          id: line.id || `line_${Date.now()}_${idx}`,
          productId: line.productId || '',
          productName: pName,
          name: pName,
          description: desc,
          variantId: line.variantId || '',
          variant: vLabel || null,
          variantExtraPrice: Number(line.variantExtraPrice) || 0,
          quantity: qty,
          unitPrice: uPrice,
          amount: Math.round(qty * uPrice * 100) / 100,
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
          variant: variantLabel || null,
          variantExtraPrice,
          quantity,
          unitPrice,
          amount: lineAmount,
        },
      ];
    }

    const subtotal = Math.round(
      preparedLines.reduce((sum, l) => sum + l.amount, 0) * 100
    ) / 100;
    const leadLine = preparedLines[0];

    const today = new Date().toISOString().slice(0, 10);
    const startDate = payload.startDate || today;
    const billingPeriod = payload.billingPeriod || 'monthly';
    const nextBillingDate = addPeriodToDate(startDate, billingPeriod);
    const expiryDate = payload.expiryDate || nextBillingDate;

    const initialStatus = payload.initialStatus || 'draft';
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
      customerName: (payload.customerName || actorUser?.name || 'Customer').trim(),
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
   * Update seat quantities / product lines and discount preference on a non-closed subscription
   * (e.g. when a customer asks for a better price for taking more seats).
   */
  async updateSubscriptionSeatsAndDiscount(
    id,
    { lines, preferredDiscountRuleId },
    actorUser
  ) {
    await new Promise((r) => setTimeout(r, 70));
    if (!actorUser || (actorUser.role !== 'admin' && actorUser.role !== 'staff')) {
      throw new Error(
        'Only internal staff or administrators can update subscription pricing or seats.'
      );
    }

    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error('Subscription not found.');
    }

    const existing = all[idx];
    if (existing.status === 'closed') {
      throw new Error('Closed subscriptions cannot be modified.');
    }

    const nextLines =
      Array.isArray(lines) && lines.length > 0
        ? lines.map((line, lIdx) => {
            const qty = Math.max(1, Number(line.quantity) || 1);
            const uPrice = Math.max(0, Number(line.unitPrice) || 0);
            const pName = line.productName || line.name || 'Product';
            const vLabel = line.variantLabel ?? line.variant ?? '';
            const desc = vLabel ? `${pName} (${vLabel})` : pName;
            return {
              ...line,
              id: line.id || `line_${Date.now()}_${lIdx}`,
              productId: line.productId || '',
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

    const leadLine = nextLines[0] || existing.lineItems?.[0];
    const nowIso = new Date().toISOString();
    const nextRulePref =
      preferredDiscountRuleId !== undefined
        ? preferredDiscountRuleId
        : existing.preferredDiscountRuleId || '';

    const normalized = normalizeSubscription({
      ...existing,
      preferredDiscountRuleId: nextRulePref,
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

    normalized.history = [
      ...(existing.history || []),
      {
        id: `evt_seats_${Date.now()}`,
        status: normalized.status,
        label: `Updated seats/pricing (${totalSeats} total qty)${discountNote}`,
        actor: actorUser.name || actorUser.email || 'Operator',
        timestamp: nowIso,
      },
    ];

    all[idx] = normalized;
    saveUnifiedSubscriptions(all);
    return normalized;
  },

  /**
   * Transition a subscription state according to lifecycle and plan switches.
   */
  async transitionSubscription(id, action, actorUser) {
    await new Promise((r) => setTimeout(r, 80));
    if (!actorUser) {
      throw new Error('Authentication required.');
    }
    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error('Subscription not found.');
    }

    const sub = { ...all[idx] };

    if (actorUser.role === 'customer' && !belongsToCustomer(sub, actorUser)) {
      throw new Error('You do not have permission to modify this subscription.');
    }

    let eventLabel = '';
    const actorName = actorUser.name || actorUser.email || 'Operator';

    switch (action) {
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
        sub.nextBillingDate = addPeriodToDate(sub.nextBillingDate, sub.billingPeriod);
        eventLabel = `Renewed through ${sub.expiryDate}`;
        break;
      }
      case 'close': {
        if (sub.status === 'closed') {
          throw new Error('Subscription is already closed.');
        }
        const today = new Date().toISOString().slice(0, 10);
        const isBeforeExpiry = !sub.expiryDate || today < sub.expiryDate;
        if (
          sub.status === 'active' &&
          isBeforeExpiry &&
          !sub.planRules?.allowEarlyClose &&
          actorUser.role !== 'admin'
        ) {
          throw new Error(
            'This plan does not permit early closure before its expiry date.'
          );
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
    sub.history = [
      ...(sub.history || []),
      {
        id: `evt_${Date.now()}`,
        status: sub.status,
        label: eventLabel,
        actor: actorName,
        timestamp: sub.updatedAt,
      },
    ];

    all[idx] = sub;
    saveUnifiedSubscriptions(all);
    return sub;
  },

  /**
   * Fetch invoices scoped by role.
   * Customers strictly receive only their own confirmed, paid, or sent invoices.
   */
  async getInvoices(actorUser) {
    await new Promise((r) => setTimeout(r, 50));
    if (!actorUser) return [];
    const all = readUnifiedInvoices();
    if (actorUser.role === 'customer') {
      return all.filter(
        (inv) =>
          belongsToCustomer(inv, actorUser) &&
          inv.status !== 'cancelled' &&
          (inv.status === 'confirmed' || inv.status === 'paid' || Boolean(inv.sentAt))
      );
    }
    return all;
  },

  /**
   * Generate a single Draft invoice for an active subscription for its current billing cycle.
   * Automatically populates customer details, product lines, taxes from Admin rules, and totals.
   * Prevents duplicate billing for the same cycle key.
   */
  async generateInvoiceForSubscription(subscriptionId, actorUser, options = {}) {
    await new Promise((r) => setTimeout(r, 80));
    const subs = readUnifiedSubscriptions();
    const subIdx = subs.findIndex((s) => s.id === subscriptionId);
    if (subIdx === -1) {
      throw new Error('Subscription not found.');
    }

    const sub = subs[subIdx];
    if (sub.status !== 'active') {
      throw new Error('Invoices can only be generated for Active subscriptions.');
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

    invoices.unshift(newInvoice);
    saveUnifiedInvoices(invoices, subs);
    return newInvoice;
  },

  /**
   * Billing Day Run:
   * Automatically generates Draft invoices across all eligible active, unpaused subscriptions,
   * pre-filling customer details, product & variant lines, automatic discounts, automatic taxes
   * from Admin rules, and totals. Guarantees nothing is billed twice or unexpectedly skipped.
   */
  async runBilling(actorUser, options = {}) {
    await new Promise((r) => setTimeout(r, 140));
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const runs = readRawArray(BILLING_RUNS_KEY);
    const productsById = getProductsMap();
    const today = options.billingDate || new Date().toISOString().slice(0, 10);

    // Enforce autoCloseOnEnd for any active subscription past its end date before billing
    let subsModified = false;
    let autoClosedCount = 0;
    subs.forEach((sub, idx) => {
      if (
        sub.status === 'active' &&
        sub.planRules?.autoCloseOnEnd &&
        sub.expiryDate &&
        sub.expiryDate < today
      ) {
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
    });

    if (subsModified) {
      saveUnifiedSubscriptions(subs);
    }

    const pausedCount = subs.filter((s) => s.status === 'active' && s.isPaused).length;
    const eligible = subs.filter((s) => s.status === 'active' && !s.isPaused);
    let createdCount = 0;
    let skippedCount = 0;

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
      invoices.unshift(draftInv);
      createdCount += 1;
    });

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
    await new Promise((r) => setTimeout(r, 40));
    return readRawArray(BILLING_RUNS_KEY);
  },

  /**
   * Confirm or cancel an invoice (Draft -> Confirmed, or Cancel unpaid Draft/Confirmed).
   */
  async updateInvoiceStatus(invoiceId, nextStatus) {
    await new Promise((r) => setTimeout(r, 70));
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

  /**
   * Bulk-confirm all Draft invoices generated during Billing Day.
   */
  async confirmAllDraftInvoices() {
    await new Promise((r) => setTimeout(r, 90));
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

  /**
   * Send an invoice statement to the customer email and publish to their portal.
   */
  async sendInvoice(invoiceId, actorUser) {
    await new Promise((r) => setTimeout(r, 80));
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

  /**
   * Record a payment against a Confirmed invoice (Confirmed -> Paid).
   */
  async recordPayment(invoiceId, { amount, method, date, note }, actorUser) {
    await new Promise((r) => setTimeout(r, 90));
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
      throw new Error('Please confirm the Draft invoice before recording payment.');
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
      throw new Error('Payment amount cannot exceed the remaining balance due.');
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

    const nextPaid = Math.round((inv.amountPaid + paymentRecord.amount) * 100) / 100;
    const nextDue = Math.max(0, Math.round((inv.total - nextPaid) * 100) / 100);

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
};
