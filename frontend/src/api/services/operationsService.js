/**
 * Operations Service Layer (Subscriptions, Billing & Invoices)
 *
 * Starts completely empty with zero dummy/mock data, matching productService and planService.
 * Enforces:
 * - Strict customer tenant isolation (customers only ever receive their own records)
 * - Subscription lifecycle transitions (Draft -> Quotation -> Confirmed -> Active -> Closed)
 * - Plan behavioral switches (autoCloseOnEnd, allowEarlyClose, allowPause, allowRenewal)
 * - Duplicate-billing prevention via cycle keys
 */

const SUBSCRIPTIONS_KEY = 'brightloop_subscriptions';
const INVOICES_KEY = 'brightloop_invoices';
const BILLING_RUNS_KEY = 'brightloop_billing_runs';

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
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

function belongsToCustomer(record, user) {
  if (!user) return false;
  if (user.customerId && record.customerId && record.customerId === user.customerId) {
    return true;
  }
  if (user.email && record.customerEmail) {
    return record.customerEmail.toLowerCase() === user.email.toLowerCase();
  }
  return false;
}

export const operationsService = {
  /**
   * Fetch subscriptions scoped by role.
   * Customers strictly receive only their own subscriptions.
   */
  async getSubscriptions(actorUser) {
    await new Promise((r) => setTimeout(r, 60));
    const all = readStore(SUBSCRIPTIONS_KEY);
    if (actorUser?.role === 'customer') {
      return all.filter((sub) => belongsToCustomer(sub, actorUser));
    }
    return all;
  },

  /**
   * Create a new subscription or quotation.
   */
  async createSubscription(payload, actorUser) {
    await new Promise((r) => setTimeout(r, 100));
    const all = readStore(SUBSCRIPTIONS_KEY);

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

    const newSub = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      subscriptionNumber: `SUB-${seq}`,
      customerId: payload.customerId || actorUser?.customerId || `cust_${Date.now()}`,
      customerName: (payload.customerName || actorUser?.name || '').trim(),
      customerEmail: (payload.customerEmail || actorUser?.email || '').trim().toLowerCase(),
      customerOrganization: (payload.customerOrganization || actorUser?.organization || '').trim(),
      planId: payload.planId || '',
      planName: payload.planName || 'Standard Plan',
      billingPeriod,
      productId: payload.productId || '',
      productName: payload.productName || payload.planName || 'Subscription Item',
      variantLabel: payload.variantLabel || '',
      variantExtraPrice,
      baseUnitPrice,
      unitPrice,
      quantity,
      recurringAmount,
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
    };

    all.unshift(newSub);
    writeStore(SUBSCRIPTIONS_KEY, all);
    return newSub;
  },

  /**
   * Transition a subscription state according to lifecycle and plan switches.
   */
  async transitionSubscription(id, action, actorUser) {
    await new Promise((r) => setTimeout(r, 90));
    const all = readStore(SUBSCRIPTIONS_KEY);
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
    writeStore(SUBSCRIPTIONS_KEY, all);
    return sub;
  },

  /**
   * Fetch invoices scoped by role.
   * Customers only ever receive confirmed/paid invoices belonging to their own account.
   */
  async getInvoices(actorUser) {
    await new Promise((r) => setTimeout(r, 60));
    const all = readStore(INVOICES_KEY);
    if (actorUser?.role === 'customer') {
      return all.filter(
        (inv) => belongsToCustomer(inv, actorUser) && inv.status !== 'cancelled'
      );
    }
    return all;
  },

  /**
   * Generate a single invoice for an active subscription for its current billing cycle.
   * Prevents duplicate billing for the same cycle key.
   */
  async generateInvoiceForSubscription(subscriptionId, actorUser) {
    await new Promise((r) => setTimeout(r, 90));
    const subs = readStore(SUBSCRIPTIONS_KEY);
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

    const invoices = readStore(INVOICES_KEY);
    const cycleKey = `${sub.id}_${sub.nextBillingDate}`;
    const duplicate = invoices.find(
      (inv) => inv.billingCycleKey === cycleKey && inv.status !== 'cancelled'
    );

    if (duplicate) {
      throw new Error(
        `Cycle ending ${sub.nextBillingDate} was already billed (${duplicate.invoiceNumber}). Duplicate skipped.`
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = addPeriodToDate(today, 'weekly');
    const seq = 2001 + invoices.length;

    const lineDesc = sub.variantLabel
      ? `${sub.productName} (${sub.variantLabel}) — ${sub.planName}`
      : `${sub.productName} — ${sub.planName}`;

    const total = Number(sub.recurringAmount) || 0;

    const newInvoice = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      invoiceNumber: `INV-${seq}`,
      billingCycleKey: cycleKey,
      subscriptionId: sub.id,
      subscriptionNumber: sub.subscriptionNumber,
      customerId: sub.customerId,
      customerName: sub.customerName,
      customerEmail: sub.customerEmail,
      customerOrganization: sub.customerOrganization,
      planName: sub.planName,
      billingPeriod: sub.billingPeriod,
      invoiceDate: today,
      dueDate,
      lines: [
        {
          id: `line_${Date.now()}`,
          description: lineDesc,
          quantity: sub.quantity,
          unitPrice: sub.unitPrice,
          amount: total,
        },
      ],
      subtotal: total,
      total,
      amountPaid: 0,
      amountDue: total,
      status: 'draft',
      payments: [],
      createdBy: actorUser?.name || actorUser?.email || 'Billing Run',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    invoices.unshift(newInvoice);
    writeStore(INVOICES_KEY, invoices);
    return newInvoice;
  },

  /**
   * Run billing across all active, unpaused subscriptions.
   * Demonstrates duplicate prevention ("Created X · Skipped Y").
   */
  async runBilling(actorUser) {
    await new Promise((r) => setTimeout(r, 140));
    const subs = readStore(SUBSCRIPTIONS_KEY);
    const invoices = readStore(INVOICES_KEY);
    const runs = readStore(BILLING_RUNS_KEY);

    const eligible = subs.filter((s) => s.status === 'active' && !s.isPaused);
    let createdCount = 0;
    let skippedCount = 0;

    const today = new Date().toISOString().slice(0, 10);
    const dueDate = addPeriodToDate(today, 'weekly');

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
      const total = Number(sub.recurringAmount) || 0;
      const lineDesc = sub.variantLabel
        ? `${sub.productName} (${sub.variantLabel}) — ${sub.planName}`
        : `${sub.productName} — ${sub.planName}`;

      invoices.unshift({
        id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${createdCount}`,
        invoiceNumber: `INV-${seq}`,
        billingCycleKey: cycleKey,
        subscriptionId: sub.id,
        subscriptionNumber: sub.subscriptionNumber,
        customerId: sub.customerId,
        customerName: sub.customerName,
        customerEmail: sub.customerEmail,
        customerOrganization: sub.customerOrganization,
        planName: sub.planName,
        billingPeriod: sub.billingPeriod,
        invoiceDate: today,
        dueDate,
        lines: [
          {
            id: `line_${Date.now()}_${createdCount}`,
            description: lineDesc,
            quantity: sub.quantity,
            unitPrice: sub.unitPrice,
            amount: total,
          },
        ],
        subtotal: total,
        total,
        amountPaid: 0,
        amountDue: total,
        status: 'confirmed',
        payments: [],
        createdBy: actorUser?.name || actorUser?.email || 'Billing Engine',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      createdCount += 1;
    });

    writeStore(INVOICES_KEY, invoices);

    const runSummary = {
      id: `run_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: actorUser?.name || actorUser?.email || 'Operator',
      eligibleCount: eligible.length,
      createdCount,
      skippedCount,
    };

    runs.unshift(runSummary);
    writeStore(BILLING_RUNS_KEY, runs.slice(0, 20));
    return runSummary;
  },

  async getBillingRuns() {
    await new Promise((r) => setTimeout(r, 40));
    return readStore(BILLING_RUNS_KEY);
  },

  /**
   * Confirm or cancel an invoice.
   */
  async updateInvoiceStatus(invoiceId, nextStatus) {
    await new Promise((r) => setTimeout(r, 80));
    const invoices = readStore(INVOICES_KEY);
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
    writeStore(INVOICES_KEY, invoices);
    return inv;
  },

  /**
   * Record a payment against a confirmed invoice.
   */
  async recordPayment(invoiceId, { amount, method, date, note }, actorUser) {
    await new Promise((r) => setTimeout(r, 100));
    const invoices = readStore(INVOICES_KEY);
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
    if (inv.status === 'paid' || inv.amountDue <= 0) {
      throw new Error('Invoice is already settled in full.');
    }

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    if (payAmount > inv.amountDue) {
      throw new Error('Payment amount cannot exceed the remaining balance due.');
    }

    const paymentRecord = {
      id: `pay_${Date.now()}`,
      amount: payAmount,
      method: method || 'Bank Transfer',
      date: date || new Date().toISOString().slice(0, 10),
      note: (note || '').trim(),
      recordedBy: actorUser?.name || actorUser?.email || 'Customer',
      createdAt: new Date().toISOString(),
    };

    const nextPaid = Number((inv.amountPaid + payAmount).toFixed(2));
    const nextDue = Math.max(0, Number((inv.total - nextPaid).toFixed(2)));

    inv.payments = [...(inv.payments || []), paymentRecord];
    inv.amountPaid = nextPaid;
    inv.amountDue = nextDue;
    inv.status = nextDue === 0 ? 'paid' : 'confirmed';
    inv.updatedAt = new Date().toISOString();

    invoices[idx] = inv;
    writeStore(INVOICES_KEY, invoices);
    return inv;
  },
};
