import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Repeat,
  FileText,
  Plus,
  Pause,
  Play,
  RotateCcw,
  XCircle,
  CreditCard,
  Printer,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operationsService } from '../../api/services/operationsService';
import { planService } from '../../api/services/planService';
import { productService } from '../../api/services/productService';
import PortalLayout from '../../layouts/PortalLayout';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import {
  SubscriptionStatusBadge,
  InvoiceStatusBadge,
} from '../../components/domain/SubscriptionStatusBadge';
import { useToast } from '../../components/ui/useToast';
import {
  formatDate,
  formatMoney,
  getPlanAvailability,
} from '../../lib/format';

export default function CustomerPortal() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [submittingSub, setSubmittingSub] = useState(false);
  const [subForm, setSubForm] = useState({
    planId: '',
    variantId: '',
    quantity: 1,
  });

  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [closingSub, setClosingSub] = useState(null);

  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: '',
    method: 'UPI',
    note: '',
  });

  const handleNavigate = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  const loadPortalData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [subs, invs, allPlans, allProducts] = await Promise.all([
        operationsService.getSubscriptions(user),
        operationsService.getInvoices(user),
        planService.getPlans(),
        productService.getProducts(),
      ]);

      const customerVisibleInvoices = invs.filter(
        (i) => i.status === 'confirmed' || i.status === 'paid'
      );
      const activeCatalogPlans = allPlans.filter(
        (p) => getPlanAvailability(p.availableFrom, p.availableTo) === 'active'
      );

      setSubscriptions(subs);
      setInvoices(customerVisibleInvoices);
      setAvailablePlans(activeCatalogPlans);
      setProducts(allProducts);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPortalData();
  }, [loadPortalData]);

  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const nextRenewalSub = [...activeSubs]
    .filter((s) => !s.isPaused && s.nextBillingDate)
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate))[0];

  const outstandingInvoices = invoices.filter(
    (i) => i.status === 'confirmed' && i.amountDue > 0
  );
  const outstandingTotal = outstandingInvoices.reduce(
    (sum, i) => sum + (Number(i.amountDue) || 0),
    0
  );

  // Self-service Subscribe calculations
  const chosenPlan =
    availablePlans.find((p) => p.id === subForm.planId) || null;
  const chosenProduct =
    products.find((p) => p.id === chosenPlan?.productId) || null;
  const variants = chosenProduct?.variants || [];
  const chosenVariant =
    variants.find((v) => v.id === subForm.variantId) || null;

  const baseUnit = Number(chosenPlan?.price) || 0;
  const extraUnit = Number(chosenVariant?.extraPrice) || 0;
  const totalRecurring =
    (baseUnit + extraUnit) * Math.max(1, Number(subForm.quantity) || 1);

  const openSubscribeDrawer = () => {
    const first = availablePlans[0] || null;
    setSubForm({
      planId: first?.id || '',
      variantId: '',
      quantity: first?.minQuantity || 1,
    });
    setSubscribeOpen(true);
  };

  const handleSelfSubscribe = async (e) => {
    e.preventDefault();
    if (!chosenPlan) return;

    const minQty = Number(chosenPlan.minQuantity) || 1;
    if ((Number(subForm.quantity) || 0) < minQty) {
      showToast(`Minimum quantity for this plan is ${minQty}.`, 'error');
      return;
    }

    setSubmittingSub(true);
    try {
      const created = await operationsService.createSubscription(
        {
          customerId: user.customerId || `cust_${user.id}`,
          customerName: user.name,
          customerEmail: user.email,
          customerOrganization: user.organization || '',
          planId: chosenPlan.id,
          planName: chosenPlan.name,
          billingPeriod: chosenPlan.billingPeriod,
          minQuantity: chosenPlan.minQuantity,
          productId: chosenProduct?.id || chosenPlan.productId || '',
          productName:
            chosenProduct?.name || chosenPlan.productName || chosenPlan.name,
          variantLabel: chosenVariant
            ? `${chosenVariant.attribute}: ${chosenVariant.value}`
            : '',
          variantExtraPrice: extraUnit,
          baseUnitPrice: baseUnit,
          quantity: Number(subForm.quantity) || 1,
          initialStatus: 'active',
          planRules: {
            autoCloseOnEnd: chosenPlan.autoCloseOnEnd,
            allowEarlyClose: chosenPlan.allowEarlyClose,
            allowPause: chosenPlan.allowPause,
            allowRenewal: chosenPlan.allowRenewal,
          },
        },
        user
      );

      showToast(
        `Subscribed to ${created.planName} (${created.subscriptionNumber}).`,
        'success'
      );
      setSubscribeOpen(false);
      await loadPortalData();
    } catch (err) {
      showToast(err.message || 'Could not start subscription.', 'error');
    } finally {
      setSubmittingSub(false);
    }
  };

  const handleSelfTransition = async (subId, action) => {
    setActionLoadingId(subId);
    try {
      const updated = await operationsService.transitionSubscription(
        subId,
        action,
        user
      );
      setClosingSub(null);
      showToast(
        `${updated.subscriptionNumber} updated (${updated.status}${
          updated.isPaused ? ', paused' : ''
        }).`,
        'success'
      );
      await loadPortalData();
    } catch (err) {
      showToast(err.message || 'Action not permitted.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openPayModal = (inv) => {
    setPayForm({
      amount: String(inv.amountDue),
      method: 'UPI',
      note: '',
    });
    setPayingInvoice(inv);
  };

  const handleSelfPay = async (e) => {
    e.preventDefault();
    if (!payingInvoice) return;

    setPaymentSubmitting(true);
    try {
      const updated = await operationsService.recordPayment(
        payingInvoice.id,
        {
          amount: payForm.amount,
          method: payForm.method,
          date: new Date().toISOString().slice(0, 10),
          note: payForm.note,
        },
        user
      );
      showToast(
        `Payment recorded for ${updated.invoiceNumber}.`,
        'success'
      );
      setPayingInvoice(null);
      if (viewingInvoice?.id === updated.id) {
        setViewingInvoice(updated);
      }
      await loadPortalData();
    } catch (err) {
      showToast(err.message || 'Payment failed.', 'error');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  return (
    <PortalLayout currentTab={currentTab} onNavigate={handleNavigate}>
      <div className="space-y-8">
        {/* Top Greeting Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              {user?.organization || user?.name || 'My Billing Portal'}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Manage your active subscriptions, renewal preferences, and billing statements for{' '}
              <span className="font-medium text-zinc-700">{user?.email}</span>.
            </p>
          </div>
          {availablePlans.length > 0 && (
            <Button variant="primary" icon={Plus} onClick={openSubscribeDrawer}>
              Subscribe to a Plan
            </Button>
          )}
        </div>

        {/* OVERVIEW TAB */}
        {currentTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card
                hoverable
                onClick={() => handleNavigate('subscriptions')}
                className="p-6 bg-white border-zinc-200 cursor-pointer hover:border-zinc-400"
              >
                <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                  <span>Active Subscriptions</span>
                  <Repeat className="w-4 h-4 text-zinc-700" />
                </div>
                <div className="text-2xl font-bold text-zinc-900 mt-2 tabular-nums">
                  {loading ? '—' : activeSubs.length}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {subscriptions.length} total on your account
                </div>
              </Card>

              <Card
                hoverable
                onClick={() => handleNavigate('subscriptions')}
                className="p-6 bg-white border-zinc-200 cursor-pointer hover:border-zinc-400"
              >
                <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                  <span>Next Scheduled Renewal</span>
                  <Calendar className="w-4 h-4 text-zinc-700" />
                </div>
                <div className="text-2xl font-bold text-zinc-900 mt-2 tabular-nums">
                  {loading
                    ? '—'
                    : nextRenewalSub
                    ? formatMoney(nextRenewalSub.recurringAmount)
                    : 'None'}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {nextRenewalSub
                    ? `Due ${formatDate(nextRenewalSub.nextBillingDate)}`
                    : 'No upcoming renewal scheduled'}
                </div>
              </Card>

              <Card
                hoverable
                onClick={() => handleNavigate('invoices')}
                className="p-6 bg-white border-zinc-200 cursor-pointer hover:border-zinc-400"
              >
                <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
                  <span>Outstanding Balance</span>
                  <FileText className="w-4 h-4 text-zinc-700" />
                </div>
                <div className="text-2xl font-bold text-zinc-900 mt-2 tabular-nums">
                  {loading ? '—' : formatMoney(outstandingTotal)}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {outstandingInvoices.length}{' '}
                  {outstandingInvoices.length === 1
                    ? 'open invoice'
                    : 'open invoices'}
                </div>
              </Card>
            </div>

            {/* Outstanding Invoices Prompt (if any) */}
            {outstandingInvoices.length > 0 && (
              <Card className="p-5 bg-white border-zinc-200">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-zinc-900">
                    Open Invoices Awaiting Payment
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigate('invoices')}
                  >
                    All invoices
                  </Button>
                </div>
                <div className="divide-y divide-zinc-200">
                  {outstandingInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-zinc-900">
                            {inv.invoiceNumber}
                          </span>
                          <span className="text-sm font-medium text-zinc-800">
                            {inv.planName}
                          </span>
                          <InvoiceStatusBadge
                            status={inv.status}
                            dueDate={inv.dueDate}
                            amountDue={inv.amountDue}
                          />
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          Due {formatDate(inv.dueDate)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <MoneyText amount={inv.amountDue} />
                        <Button
                          variant="primary"
                          size="sm"
                          icon={CreditCard}
                          onClick={() => openPayModal(inv)}
                        >
                          Pay Now
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Subscriptions Snapshot */}
            <Card className="p-6 bg-white border-zinc-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-zinc-900">
                  Your Subscriptions
                </h2>
                {subscriptions.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigate('subscriptions')}
                  >
                    Manage all
                  </Button>
                )}
              </div>

              {subscriptions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-zinc-500 mb-4">
                    You do not have any subscriptions under this account yet.
                  </p>
                  {availablePlans.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={openSubscribeDrawer}
                    >
                      Browse Available Plans
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-200">
                  {subscriptions.slice(0, 4).map((sub) => (
                    <div
                      key={sub.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-zinc-900">
                            {sub.subscriptionNumber}
                          </span>
                          <span className="text-sm font-semibold text-zinc-900">
                            {sub.planName}
                          </span>
                          <SubscriptionStatusBadge
                            status={sub.status}
                            isPaused={sub.isPaused}
                          />
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {sub.quantity} × {sub.productName}
                          {sub.variantLabel ? ` (${sub.variantLabel})` : ''} ·
                          Next billing {formatDate(sub.nextBillingDate)}
                        </div>
                      </div>
                      <div className="text-right">
                        <MoneyText amount={sub.recurringAmount} />
                        <div className="text-[11px] text-zinc-400 capitalize">
                          per {sub.billingPeriod}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* MY SUBSCRIPTIONS TAB */}
        {currentTab === 'subscriptions' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
                Loading your subscriptions...
              </div>
            ) : subscriptions.length === 0 ? (
              <EmptyState
                icon={Repeat}
                title="No subscriptions on your account"
                description={
                  availablePlans.length > 0
                    ? 'Choose an active subscription plan to get started.'
                    : 'Your subscriptions and quotations sent by our team will appear here.'
                }
                actionLabel={
                  availablePlans.length > 0 ? 'Subscribe to a Plan' : undefined
                }
                actionIcon={Plus}
                onAction={
                  availablePlans.length > 0 ? openSubscribeDrawer : undefined
                }
              />
            ) : (
              subscriptions.map((sub) => {
                const busy = actionLoadingId === sub.id;
                return (
                  <Card
                    key={sub.id}
                    className="p-5 sm:p-6 bg-white border-zinc-200 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-zinc-500">
                            {sub.subscriptionNumber}
                          </span>
                          <h3 className="text-base font-bold text-zinc-900">
                            {sub.planName}
                          </h3>
                          <SubscriptionStatusBadge
                            status={sub.status}
                            isPaused={sub.isPaused}
                          />
                        </div>
                        <p className="text-xs text-zinc-600">
                          {sub.quantity} × {sub.productName}
                          {sub.variantLabel && (
                            <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-800">
                              {sub.variantLabel}
                              {sub.variantExtraPrice > 0 && (
                                <span className="ml-1 text-orange-700 font-semibold">
                                  +₹{sub.variantExtraPrice}
                                </span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="sm:text-right">
                        <div className="text-lg font-bold text-zinc-900 tabular-nums">
                          {formatMoney(sub.recurringAmount)}
                        </div>
                        <div className="text-xs text-zinc-500 capitalize">
                          billed {sub.billingPeriod}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-3 border-y border-zinc-100 text-xs">
                      <div>
                        <span className="text-zinc-400">Started</span>
                        <div className="font-medium text-zinc-800 mt-0.5 tabular-nums">
                          {formatDate(sub.startDate)}
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-400">Next Billing Date</span>
                        <div className="font-medium text-zinc-800 mt-0.5 tabular-nums">
                          {sub.status === 'closed'
                            ? 'Closed'
                            : formatDate(sub.nextBillingDate)}
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-400">End Policy</span>
                        <div className="font-medium text-zinc-800 mt-0.5">
                          {sub.planRules?.autoCloseOnEnd
                            ? 'Closes automatically at end'
                            : 'Continues until closed'}
                        </div>
                      </div>
                    </div>

                    {/* Self-Service Controls governed by Plan's 4 Switches */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {sub.status === 'quotation' && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CheckCircle2}
                            loading={busy}
                            onClick={() =>
                              handleSelfTransition(sub.id, 'confirm')
                            }
                          >
                            Accept Quotation
                          </Button>
                        )}

                        {sub.status === 'active' && (
                          <>
                            {sub.planRules?.allowPause &&
                              (sub.isPaused ? (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={Play}
                                  loading={busy}
                                  onClick={() =>
                                    handleSelfTransition(sub.id, 'resume')
                                  }
                                >
                                  Resume
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={Pause}
                                  loading={busy}
                                  onClick={() =>
                                    handleSelfTransition(sub.id, 'pause')
                                  }
                                >
                                  Pause
                                </Button>
                              ))}

                            {sub.planRules?.allowRenewal && (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={RotateCcw}
                                loading={busy}
                                onClick={() =>
                                  handleSelfTransition(sub.id, 'renew')
                                }
                              >
                                Renew
                              </Button>
                            )}

                            {sub.planRules?.allowEarlyClose && (
                              <Button
                                variant="outline"
                                size="sm"
                                icon={XCircle}
                                disabled={busy}
                                onClick={() => setClosingSub(sub)}
                              >
                                Close Subscription
                              </Button>
                            )}
                          </>
                        )}

                        {sub.status === 'closed' &&
                          sub.planRules?.allowRenewal && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={RotateCcw}
                              loading={busy}
                              onClick={() =>
                                handleSelfTransition(sub.id, 'renew')
                              }
                            >
                              Renew Subscription
                            </Button>
                          )}
                      </div>

                      {sub.status === 'active' &&
                        !sub.planRules?.allowPause &&
                        !sub.planRules?.allowEarlyClose &&
                        !sub.planRules?.allowRenewal && (
                          <span className="text-xs text-zinc-400">
                            Fixed-term plan · Managed by support
                          </span>
                        )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* MY INVOICES TAB */}
        {currentTab === 'invoices' && (
          <div>
            {loading ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
                Loading your invoices...
              </div>
            ) : invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No invoices on your account"
                description="Confirmed billing statements and payment receipts for your subscriptions will appear here."
              />
            ) : (
              <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <th className="py-3 px-4">Invoice</th>
                        <th className="py-3 px-4">Plan</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4 text-right">Due</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-sm">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50/70">
                          <td className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-zinc-900">
                            {inv.planName}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                            {formatDate(inv.invoiceDate)}
                          </td>
                          <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                            {formatDate(inv.dueDate)}
                          </td>
                          <td className="py-3.5 px-4">
                            <InvoiceStatusBadge
                              status={inv.status}
                              dueDate={inv.dueDate}
                              amountDue={inv.amountDue}
                            />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <MoneyText amount={inv.total} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <MoneyText amount={inv.amountDue} />
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {inv.status === 'confirmed' &&
                                inv.amountDue > 0 && (
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    icon={CreditCard}
                                    onClick={() => openPayModal(inv)}
                                  >
                                    Pay
                                  </Button>
                                )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewingInvoice(inv)}
                              >
                                Receipt
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subscribe Drawer */}
      <Drawer
        isOpen={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        title="Subscribe to a Plan"
        subtitle="Select an available plan and optional product variant."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setSubscribeOpen(false)}
              disabled={submittingSub}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submittingSub}
              onClick={handleSelfSubscribe}
              disabled={!chosenPlan}
            >
              Start Subscription
            </Button>
          </>
        }
      >
        <form onSubmit={handleSelfSubscribe} className="space-y-4">
          <Select
            label="Available Plan"
            required
            value={subForm.planId}
            options={availablePlans.map((p) => ({
              value: p.id,
              label: `${p.name} — ${formatMoney(p.price)} / ${p.billingPeriod}`,
            }))}
            onChange={(e) => {
              const pl = availablePlans.find((p) => p.id === e.target.value);
              setSubForm({
                planId: e.target.value,
                variantId: '',
                quantity: pl?.minQuantity || 1,
              });
            }}
          />

          {variants.length > 0 && (
            <Select
              label="Variant Option"
              placeholder="Standard (Base price)"
              value={subForm.variantId}
              options={variants.map((v) => ({
                value: v.id,
                label: `${v.attribute}: ${v.value}${
                  Number(v.extraPrice) > 0
                    ? ` (+${formatMoney(v.extraPrice)})`
                    : ''
                }`,
              }))}
              onChange={(e) =>
                setSubForm((p) => ({ ...p, variantId: e.target.value }))
              }
            />
          )}

          <Input
            label="Quantity"
            type="number"
            min={chosenPlan?.minQuantity || 1}
            required
            value={subForm.quantity}
            hint={
              chosenPlan
                ? `Minimum quantity: ${chosenPlan.minQuantity}`
                : undefined
            }
            onChange={(e) =>
              setSubForm((p) => ({ ...p, quantity: e.target.value }))
            }
          />

          {chosenPlan && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-600">
                <span>Base Plan ({chosenPlan.billingPeriod})</span>
                <span className="tabular-nums font-medium text-zinc-900">
                  {formatMoney(baseUnit)}
                </span>
              </div>
              {chosenVariant && (
                <div className="flex justify-between text-zinc-600">
                  <span>
                    {chosenVariant.attribute}: {chosenVariant.value}
                  </span>
                  <span className="tabular-nums font-semibold text-orange-700">
                    +{formatMoney(extraUnit)}
                  </span>
                </div>
              )}
              <div className="border-t border-zinc-200 pt-2 flex justify-between text-sm font-bold text-zinc-900">
                <span>Recurring Total</span>
                <span className="tabular-nums">
                  {formatMoney(totalRecurring)} / {chosenPlan.billingPeriod}
                </span>
              </div>
            </div>
          )}
        </form>
      </Drawer>

      {/* Close Confirmation Modal */}
      <Modal
        isOpen={Boolean(closingSub)}
        onClose={() => setClosingSub(null)}
        title="Close Subscription"
        footer={
          <>
            <Button variant="outline" onClick={() => setClosingSub(null)}>
              Keep Active
            </Button>
            <Button
              variant="danger"
              loading={actionLoadingId === closingSub?.id}
              onClick={() => handleSelfTransition(closingSub.id, 'close')}
            >
              Confirm Close
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Are you sure you want to close{' '}
          <strong className="text-zinc-900">{closingSub?.planName}</strong> (
          <span className="font-mono text-xs">
            {closingSub?.subscriptionNumber}
          </span>
          )?
        </p>
      </Modal>

      {/* Self-Service Pay Invoice Modal */}
      <Modal
        isOpen={Boolean(payingInvoice)}
        onClose={() => setPayingInvoice(null)}
        title={
          payingInvoice
            ? `Pay Invoice ${payingInvoice.invoiceNumber}`
            : 'Pay Invoice'
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setPayingInvoice(null)}
              disabled={paymentSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={paymentSubmitting}
              onClick={handleSelfPay}
            >
              Confirm Payment
            </Button>
          </>
        }
      >
        {payingInvoice && (
          <form onSubmit={handleSelfPay} className="space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex justify-between text-xs">
              <span className="text-zinc-600">{payingInvoice.planName}</span>
              <span className="font-semibold text-zinc-900 tabular-nums">
                Amount Due: {formatMoney(payingInvoice.amountDue)}
              </span>
            </div>
            <Input
              label="Amount"
              type="number"
              step="0.01"
              min="0.01"
              max={payingInvoice.amountDue}
              prefix="₹"
              required
              value={payForm.amount}
              onChange={(e) =>
                setPayForm((p) => ({ ...p, amount: e.target.value }))
              }
            />
            <Select
              label="Payment Method"
              value={payForm.method}
              options={[
                { value: 'UPI', label: 'UPI' },
                { value: 'Card', label: 'Credit / Debit Card' },
                { value: 'Bank Transfer', label: 'Bank Transfer' },
              ]}
              onChange={(e) =>
                setPayForm((p) => ({ ...p, method: e.target.value }))
              }
            />
            <Input
              label="Transaction Reference (Optional)"
              placeholder="e.g. UPI ref"
              value={payForm.note}
              onChange={(e) =>
                setPayForm((p) => ({ ...p, note: e.target.value }))
              }
            />
          </form>
        )}
      </Modal>

      {/* Receipt / Print Drawer */}
      <Drawer
        isOpen={Boolean(viewingInvoice)}
        onClose={() => setViewingInvoice(null)}
        title={
          viewingInvoice
            ? `Invoice ${viewingInvoice.invoiceNumber}`
            : 'Invoice'
        }
        subtitle={viewingInvoice?.planName}
        footer={
          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={() => window.print()}
          >
            Print / Save PDF
          </Button>
        }
      >
        {viewingInvoice && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500">
                Issued {formatDate(viewingInvoice.invoiceDate)} · Due{' '}
                {formatDate(viewingInvoice.dueDate)}
              </div>
              <InvoiceStatusBadge
                status={viewingInvoice.status}
                dueDate={viewingInvoice.dueDate}
                amountDue={viewingInvoice.amountDue}
              />
            </div>

            <div className="border border-zinc-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(viewingInvoice.lines || []).map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 px-3 font-medium text-zinc-900">
                        {l.description}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-zinc-600">
                        {l.quantity}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-zinc-900">
                        {formatMoney(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-zinc-50 border-t border-zinc-200 p-3.5 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {formatMoney(viewingInvoice.total)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Paid</span>
                  <span className="font-medium text-emerald-700 tabular-nums">
                    {formatMoney(viewingInvoice.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-sm font-bold text-zinc-900">
                  <span>Balance Due</span>
                  <span className="tabular-nums">
                    {formatMoney(viewingInvoice.amountDue)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </PortalLayout>
  );
}
