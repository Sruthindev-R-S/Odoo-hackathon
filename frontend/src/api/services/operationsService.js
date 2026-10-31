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

import { calculateTaxesFromRules, taxService } from './taxService';

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
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const d = new Date(base);
  if (period === 'daily') d.setDate(d.getDate() + 1);
  else if (period === 'weekly') d.setDate(d.getDate() + 7);
  else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeSubscription(raw) {
  if (!raw) return raw;
  const firstItem = Array.isArray(raw.lineItems) && raw.lineItems.length > 0 ? raw.lineItems[0] : null;
  const quantity = Math.max(1, Number(raw.quantity) || 1);
  const unitPrice = Number(raw.unitPrice ?? raw.baseUnitPrice) || 0;
  // Pre-tax recurring base amount so taxes are never compounded on renewal billing runs
  const preTaxSubtotal =
    Number(
      raw.subtotal ??
        raw.recurringAmount ??
        (unitPrice > 0 ? unitPrice * quantity : raw.amount)
    ) || 0;

  const productName =
    raw.productName ||
    (firstItem?.name ? firstItem.name : '') ||
    raw.planName ||
    'Subscription Item';
  const variantLabel = raw.variantLabel ?? firstItem?.variant ?? '';

  const lineItems =
    Array.isArray(raw.lineItems) && raw.lineItems.length > 0
      ? raw.lineItems.map((item, idx) => {
          const desc =
            item.description ||
            (item.variant ? `${item.name} (${item.variant})` : item.name || productName);
          return {
            id: item.id || `line_${raw.id}_${idx}`,
            name: item.name || desc,
            description: desc,
            variant: item.variant || null,
            productId: item.productId || (idx === 0 ? raw.productId || '' : ''),
            productType: item.productType || '',
            quantity: Math.max(1, Number(item.quantity) || 1),
            unitPrice: Number(item.unitPrice) || 0,
            amount: Number(item.amount) || 0,
          };
        })
      : [
          {
            id: `line_${raw.id || 'sub'}_0`,
            name: `${raw.planName || 'Plan'} (${productName})`,
            description: variantLabel
              ? `${productName} (${variantLabel}) — ${raw.planName || 'Plan'}`
              : `${productName} — ${raw.planName || 'Plan'}`,
            variant: variantLabel || null,
            productId: raw.productId || '',
            productType: '',
            quantity,
            unitPrice,
            amount: preTaxSubtotal,
          },
        ];

  const startDate = raw.startDate || new Date().toISOString().slice(0, 10);
  const nextBillingDate =
    raw.nextBillingDate ||
    raw.currentPeriodEnd ||
    addPeriodToDate(startDate, raw.billingPeriod || 'monthly');

  return {
    ...raw,
    customerName: raw.customerName || 'Customer',
    customerEmail: raw.customerEmail || '',
    customerOrganization: raw.customerOrganization || raw.organization || '',
    organization: raw.organization || raw.customerOrganization || '',
    billingAddress: raw.billingAddress || '',
    planName: raw.planName || 'Subscription Plan',
    billingPeriod: raw.billingPeriod || 'monthly',
    productId: raw.productId || '',
    productName,
    variantLabel,
    variantExtraPrice: Number(raw.variantExtraPrice) || 0,
    baseUnitPrice: Number(raw.baseUnitPrice ?? unitPrice) || 0,
    unitPrice,
    quantity,
    subtotal: preTaxSubtotal,
    recurringAmount: preTaxSubtotal,
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
  if (!user) return true; // Unauthenticated demo mode previews local session records
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

function buildInvoiceFromSubscription(sub, seqNumber, actorUser, productsById) {
  const today = new Date().toISOString().slice(0, 10);
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
            amount: sub.recurringAmount,
          },
        ];

  const lines = rawLines.map((item, idx) => {
    const desc =
      item.description ||
      (item.variant ? `${item.name} (${item.variant})` : item.name);
    return {
      id: `inv_line_${Date.now()}_${seqNumber}_${idx}`,
      name: item.name || desc,
      description: desc,
      variant: item.variant || null,
      productId: item.productId || (idx === 0 ? sub.productId || '' : ''),
      productType: item.productType || '',
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitPrice: Number(item.unitPrice) || 0,
      amount: Number(item.amount) || 0,
    };
  });

  const defaultProductType = sub.productId
    ? productsById.get(sub.productId)?.type || ''
    : '';

  const taxCalc = calculateTaxesFromRules(lines, {
    billingPeriod: sub.billingPeriod,
    defaultProductId: sub.productId,
    defaultProductType,
    productsById,
  });

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
    const all = readUnifiedSubscriptions();
    if (!actorUser || actorUser.role === 'customer') {
      if (actorUser?.role === 'customer') {
        return all.filter((sub) => belongsToCustomer(sub, actorUser));
      }
    }
    return all;
  },

  /**
   * Create a new subscription or quotation.
   */
  async createSubscription(payload, actorUser) {
    await new Promise((r) => setTimeout(r, 90));
    const all = readUnifiedSubscriptions();

    const quantity = Math.max(1, Number(payload.quantity) || 1);
    const minQty = Number(payload.minQuantity) || 1;
    if (quantity < minQty) {
      throw new Error(`Quantity must be at least the plan minimum (${minQty}).`);
    }

    const baseUnitPrice = Number(payload.baseUnitPrice) || 0;
    const variantExtraPrice = Number(payload.variantExtraPrice) || 0;
    const unitPrice = baseUnitPrice + variantExtraPrice;
    const recurringAmount = unitPrice * quantity;

    const today = new Date().toISOString().slice(0, 10);
    const startDate = payload.startDate || today;
    const billingPeriod = payload.billingPeriod || 'monthly';
    const nextBillingDate = addPeriodToDate(startDate, billingPeriod);
    const expiryDate = payload.expiryDate || nextBillingDate;

    const initialStatus = payload.initialStatus || 'draft';
    const seq = 1001 + all.length;

    const productName = payload.productName || payload.planName || 'Subscription Item';
    const variantLabel = payload.variantLabel || '';
    const lineDesc = variantLabel
      ? `${productName} (${variantLabel}) — ${payload.planName || 'Standard Plan'}`
      : `${productName} — ${payload.planName || 'Standard Plan'}`;

    const newSub = normalizeSubscription({
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subscriptionNumber: `SUB-${seq}`,
      customerId:
        payload.customerId ||
        actorUser?.customerId ||
        actorUser?.id ||
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
      planName: payload.planName || 'Standard Plan',
      billingPeriod,
      productId: payload.productId || '',
      productName,
      variantLabel,
      variantExtraPrice,
      baseUnitPrice,
      unitPrice,
      quantity,
      subtotal: recurringAmount,
      recurringAmount,
      lineItems: [
        {
          id: `line_${Date.now()}`,
          name: `${payload.planName || 'Standard Plan'} (${productName})`,
          description: lineDesc,
          variant: variantLabel || null,
          productId: payload.productId || '',
          quantity,
          unitPrice,
          amount: recurringAmount,
        },
      ],
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
          label:
            initialStatus === 'active'
              ? 'Subscription started via self-service portal'
              : initialStatus === 'quotation'
              ? 'Quotation created'
              : 'Draft created',
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
   * Transition a subscription state according to lifecycle and plan switches.
   */
  async transitionSubscription(id, action, actorUser) {
    await new Promise((r) => setTimeout(r, 80));
    const all = readUnifiedSubscriptions();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new Error('Subscription not found.');
    }

    const sub = { ...all[idx] };

    if (actorUser?.role === 'customer' && !belongsToCustomer(sub, actorUser)) {
      throw new Error('You do not have permission to modify this subscription.');
    }

    let eventLabel = '';
    const actorName = actorUser?.name || actorUser?.email || 'Operator';

    switch (action) {
      case 'send_quotation': {
        if (sub.status !== 'draft') {
          throw new Error('Only Draft records can be sent as a Quotation.');
        }
        sub.status = 'quotation';
        eventLabel = 'Sent quotation to customer';
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
        if (sub.status === 'active' && !sub.planRules?.allowEarlyClose) {
          throw new Error('This plan does not permit early closure.');
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
   * Customers receive confirmed, paid, or explicitly sent invoices belonging to their account.
   */
  async getInvoices(actorUser) {
    await new Promise((r) => setTimeout(r, 50));
    const all = readUnifiedInvoices();
    if (actorUser?.role === 'customer') {
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
  async generateInvoiceForSubscription(subscriptionId, actorUser) {
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
    const newInvoice = buildInvoiceFromSubscription(sub, seq, actorUser, productsById);

    invoices.unshift(newInvoice);
    saveUnifiedInvoices(invoices, subs);
    return newInvoice;
  },

  /**
   * Billing Day Run:
   * Automatically generates Draft invoices across all eligible active, unpaused subscriptions,
   * pre-filling customer details, product & variant lines, automatic taxes from Admin rules,
   * and totals. Guarantees nothing is billed twice or unexpectedly skipped.
   */
  async runBilling(actorUser) {
    await new Promise((r) => setTimeout(r, 140));
    const subs = readUnifiedSubscriptions();
    const invoices = readUnifiedInvoices(subs);
    const runs = readRawArray(BILLING_RUNS_KEY);
    const productsById = getProductsMap();
    const today = new Date().toISOString().slice(0, 10);

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
      const draftInv = buildInvoiceFromSubscription(sub, seq, actorUser, productsById);
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

    const runSummary = {
      id: `run_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: actorUser?.name || actorUser?.email || 'Operator',
      eligibleCount: eligible.length,
      createdCount,
      skippedCount,
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

    const payAmount = Number(amount);
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
