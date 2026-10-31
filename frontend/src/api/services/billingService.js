/**
 * Billing & Subscription Checkout Service
 * 
 * Manages customer checkout transactions, recurring subscription creation,
 * and automated invoice generation upon successful billing.
 */

import { operationsService } from './operationsService.js';
import {
  evaluateApplicableDiscount,
  consumeDiscountRuleUsage,
} from './discountService.js';

const STORAGE_SUBSCRIPTIONS_KEY = 'brightloop_subscriptions_v1';
const STORAGE_INVOICES_KEY = 'brightloop_invoices_v1';

function getStoredSubscriptions() {
  try {
    const raw = localStorage.getItem(STORAGE_SUBSCRIPTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredSubscriptions(subscriptions) {
  try {
    localStorage.setItem(STORAGE_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
  } catch (err) {
    console.error('Failed to persist subscriptions', err);
  }
}

function getStoredInvoices() {
  try {
    const raw = localStorage.getItem(STORAGE_INVOICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredInvoices(invoices) {
  try {
    localStorage.setItem(STORAGE_INVOICES_KEY, JSON.stringify(invoices));
  } catch (err) {
    console.error('Failed to persist invoices', err);
  }
}

export function computeNextBillingDate(interval = 'monthly') {
  const d = new Date();
  switch (interval) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    case 'monthly':
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d.toISOString().substring(0, 10);
}

export const billingService = {
  /**
   * Process customer checkout: creates active subscription and paid invoice
   */
  async processBillingCheckout({
    plan,
    product,
    selectedVariant = null,
    quantity = 1,
    addOns = [],
    customer = {},
    payment = {},
  }) {
    // Simulate real asynchronous payment gateway roundtrip
    await new Promise((resolve) => setTimeout(resolve, 800));

    const qty = Math.max(Number(quantity) || 1, plan.minQuantity || 1);
    const baseExtra = selectedVariant ? Number(selectedVariant.extraPrice) || 0 : 0;
    const planUnitPrice = (Number(plan.price) || 0) + baseExtra;
    const planTotal = planUnitPrice * qty;

    // Line items
    const primaryProductId = product?.id || plan.productId || '';
    const lineItems = [
      {
        id: `line_plan_${Date.now()}`,
        productId: primaryProductId,
        productName: product ? product.name : plan.productName || plan.name,
        name: `${plan.name} (${product ? product.name : 'Subscription'})`,
        variant: selectedVariant ? `${selectedVariant.attribute}: ${selectedVariant.value}` : null,
        quantity: qty,
        unitPrice: planUnitPrice,
        amount: planTotal,
      },
    ];

    // Add-on line items
    addOns.forEach((addon, idx) => {
      const addonExtra = addon.selectedVariant ? Number(addon.selectedVariant.extraPrice) || 0 : 0;
      const addonPrice = (Number(addon.salesPrice) || 0) + addonExtra;
      const addonQty = Number(addon.quantity) || 1;
      const addonAmount = addonPrice * addonQty;

      lineItems.push({
        id: `line_addon_${Date.now()}_${idx}`,
        productId: addon.id || '',
        productName: addon.name || 'Add-on',
        name: `Add-on: ${addon.name}`,
        variant: addon.selectedVariant ? `${addon.selectedVariant.attribute}: ${addon.selectedVariant.value}` : null,
        quantity: addonQty,
        unitPrice: addonPrice,
        amount: addonAmount,
      });
    });

    const startDate = new Date().toISOString().substring(0, 10);
    const discCalc = evaluateApplicableDiscount(lineItems, { evalDate: startDate });
    if (discCalc.discountAmount > 0 && discCalc.discountRuleId) {
      consumeDiscountRuleUsage(discCalc.discountRuleId);
    }

    const grossSubtotal = discCalc.grossSubtotal;
    const subtotal = discCalc.netSubtotal;
    const taxRate = 0.18; // 18% GST standard
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    const nextBillingDate = computeNextBillingDate(plan.billingPeriod);
    const serial = Math.floor(1000 + Math.random() * 9000);

    const subscription = {
      id: `sub_${Date.now()}_${serial}`,
      subscriptionNumber: `SUB-2026-${serial}`,
      customerId: customer.id || `cust_${Date.now()}`,
      customerName: customer.name || 'Brightloop Customer',
      customerEmail: customer.email || 'customer@brightloop.io',
      organization: customer.organization || 'Acme Enterprises',
      planId: plan.id,
      planName: plan.name,
      productId: primaryProductId,
      billingPeriod: plan.billingPeriod || 'monthly',
      status: 'active',
      startDate,
      currentPeriodEnd: nextBillingDate,
      nextBillingDate,
      quantity: qty,
      unitPrice: planUnitPrice,
      grossSubtotal,
      discountRuleId: discCalc.discountRuleId,
      discountName: discCalc.discountName,
      discountLabel: discCalc.discountLabel,
      discountAmount: discCalc.discountAmount,
      appliedDiscountRuleId:
        discCalc.discountAmount > 0 ? discCalc.discountRuleId : '',
      amount: totalAmount,
      subtotal,
      taxAmount,
      canCloseEarly: plan.allowEarlyClose !== false,
      canPause: plan.allowPause !== false,
      canRenew: plan.allowRenewal !== false,
      autoCloseOnEnd: Boolean(plan.autoCloseOnEnd),
      lineItems,
      createdAt: new Date().toISOString(),
    };

    const invoice = {
      id: `inv_${Date.now()}_${serial}`,
      invoiceNumber: `INV-2026-${serial}`,
      subscriptionId: subscription.id,
      subscriptionNumber: subscription.subscriptionNumber,
      customerId: subscription.customerId,
      customerName: subscription.customerName,
      customerEmail: subscription.customerEmail,
      organization: subscription.organization,
      billingAddress: customer.billingAddress || '742 Evergreen Terrace, Sector 4',
      date: startDate,
      dueDate: startDate,
      period: `${startDate} — ${nextBillingDate}`,
      grossSubtotal,
      discountRuleId: discCalc.discountRuleId,
      discountName: discCalc.discountName,
      discountLabel: discCalc.discountLabel,
      discountAmount: discCalc.discountAmount,
      discountUsageConsumed: discCalc.discountAmount > 0,
      subtotal,
      taxRate: '18% GST',
      taxAmount,
      total: totalAmount,
      amountPaid: totalAmount,
      amountDue: 0,
      status: 'paid',
      paidAt: new Date().toISOString(),
      paymentMethod: payment.methodTitle || 'Credit Card (ending 4242)',
      lineItems,
      createdAt: new Date().toISOString(),
    };

    // Save to persistent localStorage
    const existingSubs = getStoredSubscriptions();
    existingSubs.unshift(subscription);
    saveStoredSubscriptions(existingSubs);

    const existingInvs = getStoredInvoices();
    existingInvs.unshift(invoice);
    saveStoredInvoices(existingInvs);

    return {
      success: true,
      subscription,
      invoice,
    };
  },

  /**
   * Get all subscriptions
   */
  async getSubscriptions(customerId = null) {
    const subs = getStoredSubscriptions();
    if (customerId) {
      return subs.filter((s) => s.customerId === customerId);
    }
    return subs;
  },

  /**
   * Get all invoices
   */
  async getInvoices(customerId = null) {
    const invs = getStoredInvoices();
    if (customerId) {
      return invs.filter((i) => i.customerId === customerId);
    }
    return invs;
  },

  /**
   * Billing run operations delegated to unified operationsService
   */
  async getBillingRuns() {
    return operationsService.getBillingRuns();
  },

  async runBilling(actorUser) {
    return operationsService.runBilling(actorUser);
  },

  async confirmInvoice(invoiceId, actorUser) {
    return operationsService.confirmInvoice(invoiceId, actorUser);
  },

  async sendInvoice(invoiceId, actorUser) {
    return operationsService.sendInvoice(invoiceId, actorUser);
  },

  async recordInvoicePayment(invoiceId, paymentData, actorUser) {
    return operationsService.recordPayment(invoiceId, paymentData, actorUser);
  },

  async cancelInvoice(invoiceId, actorUser) {
    return operationsService.cancelInvoice(invoiceId, actorUser);
  },
};
