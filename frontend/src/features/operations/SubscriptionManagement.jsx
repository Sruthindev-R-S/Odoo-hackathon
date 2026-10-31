import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Repeat,
  Search,
  FileText,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Send,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { productService } from '../../api/services/productService';
import { planService } from '../../api/services/planService';
import { operationsService } from '../../api/services/operationsService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import StatusStepper from '../../components/domain/StatusStepper';
import { SubscriptionStatusBadge } from '../../components/domain/SubscriptionStatusBadge';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatMoney } from '../../lib/format';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'quotation', label: 'Quotation' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'Closed' },
];

export default function SubscriptionManagement({ onInvoiceGenerated }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [subscriptions, setSubscriptions] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSub, setSelectedSub] = useState(null);
  const [confirmCloseSub, setConfirmCloseSub] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    selectedCustomerId: '',
    customerName: '',
    customerEmail: '',
    customerOrganization: '',
    planId: '',
    variantId: '',
    quantity: 1,
    startDate: today,
    paymentTerms: 'Net 15',
    initialStatus: 'quotation',
  });
  const [formErrors, setFormErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, prodsData, plansData, custsData] = await Promise.all([
        operationsService.getSubscriptions(user),
        productService.getProducts(),
        planService.getPlans(),
        authService.getCustomers(),
      ]);
      setSubscriptions(subsData);
      setProducts(prodsData);
      setPlans(plansData);
      setCustomers(custsData);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedPlan = plans.find((p) => p.id === formData.planId) || null;
  const linkedProduct =
    products.find((p) => p.id === selectedPlan?.productId) || null;
  const availableVariants = linkedProduct?.variants || [];
  const selectedVariant =
    availableVariants.find((v) => v.id === formData.variantId) || null;

  const basePrice = selectedPlan
    ? Number(selectedPlan.price) || 0
    : Number(linkedProduct?.salesPrice) || 0;
  const variantExtra = Number(selectedVariant?.extraPrice) || 0;
  const effectiveUnitPrice = basePrice + variantExtra;
  const estimatedTotal =
    effectiveUnitPrice * Math.max(1, Number(formData.quantity) || 1);

  const handleOpenCreate = () => {
    const firstPlan = plans[0] || null;
    setFormData({
      selectedCustomerId: '',
      customerName: '',
      customerEmail: '',
      customerOrganization: '',
      planId: firstPlan?.id || '',
      variantId: '',
      quantity: firstPlan?.minQuantity || 1,
      startDate: today,
      paymentTerms: 'Net 15',
      initialStatus: 'quotation',
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const handleCustomerPick = (custId) => {
    if (!custId) {
      setFormData((prev) => ({
        ...prev,
        selectedCustomerId: '',
      }));
      return;
    }
    const found = customers.find((c) => c.id === custId);
    if (found) {
      setFormData((prev) => ({
        ...prev,
        selectedCustomerId: found.id,
        customerName: found.name || '',
        customerEmail: found.email || '',
        customerOrganization: found.organization || '',
      }));
    }
  };

  const handlePlanPick = (planId) => {
    const plan = plans.find((p) => p.id === planId);
    setFormData((prev) => ({
      ...prev,
      planId,
      variantId: '',
      quantity: plan ? Math.max(1, Number(plan.minQuantity) || 1) : 1,
    }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.customerName.trim()) {
      errors.customerName = 'Customer name is required.';
    }
    if (!formData.customerEmail.trim()) {
      errors.customerEmail = 'Customer email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail.trim())) {
      errors.customerEmail = 'Enter a valid customer email.';
    }
    if (!selectedPlan) {
      errors.planId = 'Select a subscription plan from the catalog.';
    }

    const minQty = Number(selectedPlan?.minQuantity) || 1;
    if ((Number(formData.quantity) || 0) < minQty) {
      errors.quantity = `Minimum quantity for this plan is ${minQty}.`;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const matchedCust = customers.find(
      (c) =>
        c.id === formData.selectedCustomerId ||
        c.email?.toLowerCase() === formData.customerEmail.trim().toLowerCase()
    );

    setIsSaving(true);
    try {
      const created = await operationsService.createSubscription(
        {
          customerId: matchedCust?.customerId || matchedCust?.id || undefined,
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerOrganization: formData.customerOrganization,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          billingPeriod: selectedPlan.billingPeriod,
          minQuantity: selectedPlan.minQuantity,
          productId: linkedProduct?.id || selectedPlan.productId || '',
          productName: linkedProduct?.name || selectedPlan.productName || selectedPlan.name,
          variantLabel: selectedVariant
            ? `${selectedVariant.attribute}: ${selectedVariant.value}`
            : '',
          variantExtraPrice: variantExtra,
          baseUnitPrice: basePrice,
          quantity: Number(formData.quantity) || 1,
          startDate: formData.startDate,
          paymentTerms: formData.paymentTerms,
          initialStatus: formData.initialStatus,
          planRules: {
            autoCloseOnEnd: selectedPlan.autoCloseOnEnd,
            allowEarlyClose: selectedPlan.allowEarlyClose,
            allowPause: selectedPlan.allowPause,
            allowRenewal: selectedPlan.allowRenewal,
          },
        },
        user
      );

      showToast(
        `${created.subscriptionNumber} created (${created.status}).`,
        'success'
      );
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not create subscription.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransition = async (subId, action) => {
    setActionLoading(true);
    try {
      const updated = await operationsService.transitionSubscription(
        subId,
        action,
        user
      );
      setSelectedSub(updated);
      setConfirmCloseSub(null);
      showToast(
        `${updated.subscriptionNumber} updated to ${updated.status}${
          updated.isPaused ? ' (paused)' : ''
        }.`,
        'success'
      );
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Transition rejected.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerateInvoice = async (sub) => {
    setActionLoading(true);
    try {
      const inv = await operationsService.generateInvoiceForSubscription(
        sub.id,
        user
      );
      showToast(
        `Invoice ${inv.invoiceNumber} generated for ${sub.subscriptionNumber}.`,
        'success'
      );
      if (onInvoiceGenerated) onInvoiceGenerated(inv);
    } catch (err) {
      showToast(err.message || 'Could not generate invoice.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredSubs = subscriptions.filter((sub) => {
    const matchesStatus =
      statusFilter === 'all' || sub.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      sub.subscriptionNumber?.toLowerCase().includes(q) ||
      sub.customerName?.toLowerCase().includes(q) ||
      sub.customerEmail?.toLowerCase().includes(q) ||
      sub.planName?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Customer Subscriptions
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Create quotations and track recurring subscriptions across Draft, Quotation, Confirmed, Active, and Closed stages.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={handleOpenCreate}>
          New Quotation / Subscription
        </Button>
      </div>

      {/* Filter & Status Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.id === 'all'
                ? subscriptions.length
                : subscriptions.filter((s) => s.status === tab.id).length;
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {tab.label}{' '}
                <span
                  className={`ml-1 tabular-nums ${
                    active ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search number, customer, plan..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading subscriptions...
        </div>
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No customer subscriptions yet"
          description={
            plans.length === 0
              ? 'An administrator needs to create at least one product and subscription plan before quotations can be issued.'
              : 'Create a quotation or active subscription for a customer from your configured plans.'
          }
          actionLabel={plans.length > 0 ? 'New Quotation / Subscription' : undefined}
          actionIcon={Plus}
          onAction={plans.length > 0 ? handleOpenCreate : undefined}
        />
      ) : filteredSubs.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-600 font-medium">
            No subscriptions match your current filters.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-zinc-900 underline underline-offset-4"
            onClick={() => {
              setStatusFilter('all');
              setSearchQuery('');
            }}
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Number</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Plan & Item</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Next Billing</th>
                  <th className="py-3 px-4 text-right">Recurring</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredSubs.map((sub) => (
                  <tr
                    key={sub.id}
                    onClick={() => setSelectedSub(sub)}
                    className="hover:bg-zinc-50/70 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-900">
                      {sub.subscriptionNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900">
                        {sub.customerName}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {sub.customerEmail}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-zinc-900">
                        {sub.planName}
                      </div>
                      <div className="text-xs text-zinc-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span>
                          {sub.quantity} × {sub.productName}
                        </span>
                        {sub.variantLabel && (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-zinc-100 border border-zinc-200 text-[11px] text-zinc-700">
                            {sub.variantLabel}
                            {sub.variantExtraPrice > 0 && (
                              <span className="ml-1 text-orange-700 font-semibold">
                                +₹{sub.variantExtraPrice}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <SubscriptionStatusBadge
                        status={sub.status}
                        isPaused={sub.isPaused}
                      />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                      {sub.status === 'closed'
                        ? '—'
                        : formatDate(sub.nextBillingDate)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <MoneyText amount={sub.recurringAmount} />
                      <div className="text-[11px] text-zinc-400 capitalize">
                        per {sub.billingPeriod}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900">
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Quotation / Subscription Drawer */}
      <Drawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Quotation / Subscription"
        subtitle="Select a customer, plan, and product variant to compute recurring pricing."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              loading={isSaving}
              disabled={plans.length === 0}
            >
              Create Record
            </Button>
          </>
        }
      >
        {plans.length === 0 ? (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-600">
            No subscription plans exist in the catalog yet. Ask an Administrator to configure a Product and Plan first.
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="space-y-5">
            {customers.length > 0 && (
              <Select
                label="Registered Customer (Optional Quick Fill)"
                placeholder="Enter manually or choose a customer..."
                value={formData.selectedCustomerId}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.email})`,
                }))}
                onChange={(e) => handleCustomerPick(e.target.value)}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Customer Name"
                required
                placeholder="Alex Morgan"
                value={formData.customerName}
                error={formErrors.customerName}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, customerName: e.target.value }))
                }
              />
              <Input
                label="Customer Email"
                type="email"
                required
                placeholder="alex@acmecorp.com"
                value={formData.customerEmail}
                error={formErrors.customerEmail}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, customerEmail: e.target.value }))
                }
              />
            </div>

            <Input
              label="Organization / Company"
              placeholder="Acme Corp"
              value={formData.customerOrganization}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  customerOrganization: e.target.value,
                }))
              }
            />

            <div className="border-t border-zinc-200 pt-4 space-y-4">
              <Select
                label="Subscription Plan"
                required
                value={formData.planId}
                error={formErrors.planId}
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} — ${formatMoney(p.price)} / ${p.billingPeriod} (Min qty: ${p.minQuantity})`,
                }))}
                onChange={(e) => handlePlanPick(e.target.value)}
              />

              {availableVariants.length > 0 && (
                <Select
                  label={`Variant for ${linkedProduct?.name}`}
                  placeholder="Standard (Base price, no extra adjustment)"
                  value={formData.variantId}
                  options={availableVariants.map((v) => ({
                    value: v.id,
                    label: `${v.attribute}: ${v.value}${
                      Number(v.extraPrice) > 0
                        ? ` (+${formatMoney(v.extraPrice)})`
                        : ' (Included)'
                    }`,
                  }))}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, variantId: e.target.value }))
                  }
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Quantity"
                  type="number"
                  min={selectedPlan?.minQuantity || 1}
                  required
                  value={formData.quantity}
                  error={formErrors.quantity}
                  hint={
                    selectedPlan
                      ? `Plan minimum quantity: ${selectedPlan.minQuantity}`
                      : undefined
                  }
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, quantity: e.target.value }))
                  }
                />
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, startDate: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Select
                  label="Payment Terms"
                  value={formData.paymentTerms}
                  options={[
                    { value: 'Due on receipt', label: 'Due on receipt' },
                    { value: 'Net 15', label: 'Net 15 Days' },
                    { value: 'Net 30', label: 'Net 30 Days' },
                  ]}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, paymentTerms: e.target.value }))
                  }
                />
                <Select
                  label="Initial Lifecycle Stage"
                  value={formData.initialStatus}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'quotation', label: 'Quotation' },
                    { value: 'active', label: 'Active (Immediate)' },
                  ]}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, initialStatus: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Pricing Preview */}
            {selectedPlan && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Base plan price ({selectedPlan.billingPeriod})</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(basePrice)}
                  </span>
                </div>
                {selectedVariant && (
                  <div className="flex justify-between text-zinc-600">
                    <span>
                      Variant ({selectedVariant.attribute}:{' '}
                      {selectedVariant.value})
                    </span>
                    <span className="tabular-nums font-semibold text-orange-700">
                      +{formatMoney(variantExtra)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>Effective unit price × {formData.quantity || 1}</span>
                  <span className="tabular-nums text-zinc-900">
                    {formatMoney(effectiveUnitPrice)} × {formData.quantity || 1}
                  </span>
                </div>
                <div className="border-t border-zinc-200 pt-2 flex justify-between items-center text-sm font-bold text-zinc-900">
                  <span>Estimated Recurring Total</span>
                  <span className="tabular-nums">
                    {formatMoney(estimatedTotal)} / {selectedPlan.billingPeriod}
                  </span>
                </div>
              </div>
            )}
          </form>
        )}
      </Drawer>

      {/* Subscription Detail & Lifecycle Stepper Drawer */}
      <Drawer
        isOpen={Boolean(selectedSub)}
        onClose={() => setSelectedSub(null)}
        width="max-w-2xl"
        title={
          selectedSub
            ? `${selectedSub.subscriptionNumber} · ${selectedSub.customerName}`
            : 'Subscription'
        }
        subtitle={
          selectedSub
            ? `${selectedSub.planName} (${selectedSub.billingPeriod})`
            : ''
        }
      >
        {selectedSub && (
          <div className="space-y-6">
            {/* Stepper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Lifecycle Progress
                </span>
                <SubscriptionStatusBadge
                  status={selectedSub.status}
                  isPaused={selectedSub.isPaused}
                />
              </div>
              <StatusStepper currentStatus={selectedSub.status} />
            </div>

            {/* Allowed Actions based on current state & plan switches */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Available Actions
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSub.status === 'draft' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Send}
                      loading={actionLoading}
                      onClick={() =>
                        handleTransition(selectedSub.id, 'send_quotation')
                      }
                    >
                      Send Quotation
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={CheckCircle2}
                      loading={actionLoading}
                      onClick={() => handleTransition(selectedSub.id, 'confirm')}
                    >
                      Confirm Directly
                    </Button>
                  </>
                )}

                {selectedSub.status === 'quotation' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckCircle2}
                    loading={actionLoading}
                    onClick={() => handleTransition(selectedSub.id, 'confirm')}
                  >
                    Confirm Quotation
                  </Button>
                )}

                {selectedSub.status === 'confirmed' && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Play}
                    loading={actionLoading}
                    onClick={() => handleTransition(selectedSub.id, 'activate')}
                  >
                    Activate Subscription
                  </Button>
                )}

                {selectedSub.status === 'active' && (
                  <>
                    {!selectedSub.isPaused && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={FileText}
                        loading={actionLoading}
                        onClick={() => handleGenerateInvoice(selectedSub)}
                      >
                        Generate Invoice
                      </Button>
                    )}

                    {selectedSub.planRules?.allowPause &&
                      (selectedSub.isPaused ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Play}
                          loading={actionLoading}
                          onClick={() =>
                            handleTransition(selectedSub.id, 'resume')
                          }
                        >
                          Resume Subscription
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Pause}
                          loading={actionLoading}
                          onClick={() =>
                            handleTransition(selectedSub.id, 'pause')
                          }
                        >
                          Pause
                        </Button>
                      ))}

                    {selectedSub.planRules?.allowRenewal && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={RotateCcw}
                        loading={actionLoading}
                        onClick={() => handleTransition(selectedSub.id, 'renew')}
                      >
                        Renew Cycle
                      </Button>
                    )}

                    {selectedSub.planRules?.allowEarlyClose && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={XCircle}
                        disabled={actionLoading}
                        onClick={() => setConfirmCloseSub(selectedSub)}
                      >
                        Close Early
                      </Button>
                    )}
                  </>
                )}

                {selectedSub.status === 'closed' &&
                  selectedSub.planRules?.allowRenewal && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RotateCcw}
                      loading={actionLoading}
                      onClick={() => handleTransition(selectedSub.id, 'renew')}
                    >
                      Reopen & Renew
                    </Button>
                  )}

                {selectedSub.status === 'closed' &&
                  !selectedSub.planRules?.allowRenewal && (
                    <span className="text-xs text-zinc-500">
                      This subscription is closed and its plan does not permit renewal.
                    </span>
                  )}
              </div>
            </div>

            {/* Line Items & Plan Terms */}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-700">
                Subscription Line & Plan Terms
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Customer</span>
                  <span className="font-medium text-zinc-900">
                    {selectedSub.customerName} ({selectedSub.customerEmail})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Product & Variant</span>
                  <span className="font-medium text-zinc-900">
                    {selectedSub.productName}
                    {selectedSub.variantLabel
                      ? ` · ${selectedSub.variantLabel}`
                      : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Quantity × Unit Price</span>
                  <span className="tabular-nums text-zinc-900">
                    {selectedSub.quantity} × {formatMoney(selectedSub.unitPrice)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Schedule</span>
                  <span className="tabular-nums text-zinc-900">
                    Start {formatDate(selectedSub.startDate)} · Next bill{' '}
                    {formatDate(selectedSub.nextBillingDate)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-2.5 font-bold text-zinc-900">
                  <span>Recurring Amount</span>
                  <span className="tabular-nums">
                    {formatMoney(selectedSub.recurringAmount)} /{' '}
                    {selectedSub.billingPeriod}
                  </span>
                </div>
              </div>
            </div>

            {/* Plan Switches Snapshot */}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="neutral" size="sm">
                {selectedSub.planRules?.autoCloseOnEnd
                  ? 'Auto-closes at end'
                  : 'Stays open at end'}
              </Badge>
              <Badge variant="neutral" size="sm">
                {selectedSub.planRules?.allowEarlyClose
                  ? 'Early close allowed'
                  : 'No early close'}
              </Badge>
              <Badge variant="neutral" size="sm">
                {selectedSub.planRules?.allowPause
                  ? 'Pause allowed'
                  : 'Pause disabled'}
              </Badge>
              <Badge variant="neutral" size="sm">
                {selectedSub.planRules?.allowRenewal
                  ? 'Renewable'
                  : 'Non-renewable'}
              </Badge>
            </div>

            {/* History Timeline */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Activity History
              </div>
              <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white">
                {(selectedSub.history || []).map((evt) => (
                  <div
                    key={evt.id}
                    className="px-4 py-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-medium text-zinc-900">
                        {evt.label}
                      </span>{' '}
                      <span className="text-zinc-500">by {evt.actor}</span>
                    </div>
                    <span className="text-zinc-400 tabular-nums">
                      {formatDate(evt.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Confirm Close Modal */}
      <Modal
        isOpen={Boolean(confirmCloseSub)}
        onClose={() => setConfirmCloseSub(null)}
        title="Close Subscription"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmCloseSub(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={actionLoading}
              onClick={() => handleTransition(confirmCloseSub.id, 'close')}
            >
              Close Subscription
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Close subscription{' '}
          <strong className="text-zinc-900">
            {confirmCloseSub?.subscriptionNumber}
          </strong>{' '}
          for <strong className="text-zinc-900">{confirmCloseSub?.customerName}</strong>? Future recurring billing cycles will stop immediately.
        </p>
      </Modal>
    </div>
  );
}
