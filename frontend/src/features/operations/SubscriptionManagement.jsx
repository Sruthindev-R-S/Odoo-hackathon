import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Repeat,
  Search,
  FileText,
  FileSpreadsheet,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  Send,
  ChevronRight,
  Trash2,
  Tag,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { productService } from '../../api/services/productService';
import { planService } from '../../api/services/planService';
import { taxService, calculateTaxesFromRules } from '../../api/services/taxService';
import {
  discountService,
  evaluateApplicableDiscount,
  getDiscountRuleStatus,
} from '../../api/services/discountService';
import {
  quotationTemplateService,
  computeExpiryFromValidity,
} from '../../api/services/quotationTemplateService';
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

const LIFECYCLE_ORDER = ['draft', 'quotation', 'confirmed', 'active', 'closed'];

const PAYMENT_TERM_OPTIONS = [
  { value: 'Due on receipt', label: 'Due on receipt' },
  { value: 'Net 15', label: 'Net 15 Days' },
  { value: 'Net 30', label: 'Net 30 Days' },
  { value: 'Net 45', label: 'Net 45 Days' },
];

export default function SubscriptionManagement({ onInvoiceGenerated }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [subscriptions, setSubscriptions] = useState([]);
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedSub, setSelectedSub] = useState(null);
  const [confirmCloseSub, setConfirmCloseSub] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingSeatsOpen, setEditingSeatsOpen] = useState(false);
  const [seatDraftLines, setSeatDraftLines] = useState([]);
  const [seatDiscountRuleId, setSeatDiscountRuleId] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    templateId: '',
    templateName: '',
    validityDays: 15,
    preferredDiscountRuleId: '',
    selectedCustomerId: '',
    customerName: '',
    customerEmail: '',
    customerOrganization: '',
    planId: '',
    startDate: today,
    expiryDate: computeExpiryFromValidity(today, 15),
    paymentTerms: 'Net 15',
    initialStatus: 'draft',
    lines: [],
  });
  const [formErrors, setFormErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        subsData,
        prodsData,
        plansData,
        tmplsData,
        rulesData,
        discData,
        custsData,
      ] = await Promise.all([
        operationsService.getSubscriptions(user),
        productService.getProducts(),
        planService.getPlans(),
        quotationTemplateService.getTemplates(),
        taxService.getTaxRules(),
        discountService.getDiscountRules(),
        authService.getCustomers(),
      ]);
      setSubscriptions(subsData);
      setProducts(prodsData);
      setPlans(plansData);
      setTemplates(tmplsData);
      setTaxRules(rulesData);
      setDiscountRules(discData);
      setCustomers(custsData);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const productsById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p && p.id) map.set(p.id, p);
    });
    return map;
  }, [products]);

  const selectedPlan = plans.find((p) => p.id === formData.planId) || null;

  const buildDefaultLineForPlan = (plan, allProducts) => {
    const linked =
      allProducts.find((p) => p.id === plan?.productId) ||
      allProducts[0] ||
      null;
    const firstVar = linked?.variants?.[0] || null;
    const extra = Number(firstVar?.extraPrice) || 0;
    const basePrice = Number(plan?.price ?? linked?.salesPrice) || 0;
    return {
      id: `qline_${Date.now()}`,
      productId: linked?.id || '',
      productName: linked?.name || plan?.productName || 'Product',
      variantId: firstVar?.id || '',
      variantLabel: firstVar ? `${firstVar.attribute}: ${firstVar.value}` : '',
      variantExtraPrice: extra,
      quantity: Math.max(1, Number(plan?.minQuantity) || 1),
      unitPrice: basePrice + extra,
    };
  };

  // Live per-line, discount, and total tax calculation for the Create Drawer
  const draftPricing = useMemo(() => {
    const billingPeriod = selectedPlan?.billingPeriod || 'monthly';
    const enrichedLines = (formData.lines || []).map((line) => {
      const qty = Math.max(1, Number(line.quantity) || 1);
      const uPrice = Math.max(0, Number(line.unitPrice) || 0);
      const untaxed = Math.round(qty * uPrice * 100) / 100;
      const prodType = line.productId
        ? productsById.get(line.productId)?.type || ''
        : '';
      const lineTax = calculateTaxesFromRules(
        [
          {
            productId: line.productId,
            productType: prodType,
            amount: untaxed,
          },
        ],
        {
          billingPeriod,
          defaultProductId: line.productId,
          defaultProductType: prodType,
          productsById,
        },
        taxRules
      );
      return {
        ...line,
        amount: untaxed,
        taxRate: lineTax.taxRate,
        taxAmount: lineTax.taxAmount,
        totalWithTax: lineTax.total,
      };
    });

    const discCalc = evaluateApplicableDiscount(
      enrichedLines,
      {
        evalDate: formData.startDate || today,
        preferredRuleId: formData.preferredDiscountRuleId || '',
      },
      discountRules
    );

    const taxableLines = discCalc.discountedLines.map((dl) => ({
      ...dl,
      amount: dl.netAmount,
    }));

    const summary = calculateTaxesFromRules(
      taxableLines,
      {
        billingPeriod,
        defaultProductId: selectedPlan?.productId || '',
        productsById,
      },
      taxRules
    );

    return {
      lines: enrichedLines,
      grossSubtotal: discCalc.grossSubtotal,
      discountAmount: discCalc.discountAmount,
      discountLabel: discCalc.discountLabel,
      discountStoppedReason: discCalc.stoppedReason,
      subtotal: discCalc.netSubtotal,
      taxRate: summary.taxRate,
      taxAmount: summary.taxAmount,
      total: summary.total,
    };
  }, [
    formData.lines,
    formData.startDate,
    formData.preferredDiscountRuleId,
    today,
    selectedPlan,
    productsById,
    taxRules,
    discountRules,
  ]);

  const handleOpenCreate = () => {
    const firstTemplate = templates[0] || null;
    const firstPlan =
      (firstTemplate && plans.find((p) => p.id === firstTemplate.planId)) ||
      plans[0] ||
      null;

    if (firstTemplate && firstPlan) {
      const vDays = Math.max(1, Number(firstTemplate.validityDays) || 15);
      setFormData({
        templateId: firstTemplate.id,
        templateName: firstTemplate.name,
        validityDays: vDays,
        preferredDiscountRuleId: '',
        selectedCustomerId: '',
        customerName: '',
        customerEmail: '',
        customerOrganization: '',
        planId: firstPlan.id,
        startDate: today,
        expiryDate: computeExpiryFromValidity(today, vDays),
        paymentTerms: firstTemplate.paymentTerms || 'Net 15',
        initialStatus: 'draft',
        lines: (firstTemplate.lines || []).map((l, idx) => ({
          ...l,
          id: `qline_${Date.now()}_${idx}`,
        })),
      });
    } else {
      setFormData({
        templateId: '',
        templateName: '',
        validityDays: 15,
        preferredDiscountRuleId: '',
        selectedCustomerId: '',
        customerName: '',
        customerEmail: '',
        customerOrganization: '',
        planId: firstPlan?.id || '',
        startDate: today,
        expiryDate: computeExpiryFromValidity(today, 15),
        paymentTerms: 'Net 15',
        initialStatus: 'draft',
        lines: firstPlan ? [buildDefaultLineForPlan(firstPlan, products)] : [],
      });
    }
    setFormErrors({});
    setCreateOpen(true);
  };

  const handleTemplatePick = (tmplId) => {
    if (!tmplId) {
      const currentPlan =
        plans.find((p) => p.id === formData.planId) || plans[0] || null;
      setFormData((prev) => ({
        ...prev,
        templateId: '',
        templateName: '',
        validityDays: 15,
        planId: currentPlan?.id || '',
        expiryDate: computeExpiryFromValidity(prev.startDate, 15),
        lines: currentPlan
          ? [buildDefaultLineForPlan(currentPlan, products)]
          : [],
      }));
      return;
    }

    const tmpl = templates.find((t) => t.id === tmplId);
    if (!tmpl) return;

    const matchedPlan =
      plans.find((p) => p.id === tmpl.planId) || plans[0] || null;
    const vDays = Math.max(1, Number(tmpl.validityDays) || 15);

    setFormData((prev) => ({
      ...prev,
      templateId: tmpl.id,
      templateName: tmpl.name,
      validityDays: vDays,
      planId: matchedPlan?.id || tmpl.planId,
      paymentTerms: tmpl.paymentTerms || prev.paymentTerms,
      expiryDate: computeExpiryFromValidity(prev.startDate, vDays),
      lines: (tmpl.lines || []).map((l, idx) => ({
        ...l,
        id: `qline_${Date.now()}_${idx}`,
      })),
    }));
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
      templateId: '',
      templateName: '',
      planId,
      lines: plan ? [buildDefaultLineForPlan(plan, products)] : prev.lines,
    }));
  };

  const handleStartDateChange = (nextStart) => {
    setFormData((prev) => ({
      ...prev,
      startDate: nextStart,
      expiryDate: computeExpiryFromValidity(
        nextStart,
        prev.validityDays || 15
      ),
    }));
  };

  const handleAddLine = () => {
    const firstProd = products[0] || null;
    if (!firstProd) return;
    const firstVar = firstProd.variants?.[0] || null;
    const extra = Number(firstVar?.extraPrice) || 0;
    setFormData((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: `qline_${Date.now()}_${prev.lines.length}`,
          productId: firstProd.id,
          productName: firstProd.name,
          variantId: firstVar?.id || '',
          variantLabel: firstVar
            ? `${firstVar.attribute}: ${firstVar.value}`
            : '',
          variantExtraPrice: extra,
          quantity: 1,
          unitPrice: (Number(firstProd.salesPrice) || 0) + extra,
        },
      ],
    }));
  };

  const handleUpdateLine = (index, field, value) => {
    setFormData((prev) => {
      const activePlan = plans.find((p) => p.id === prev.planId);
      const nextLines = [...prev.lines];
      const line = { ...nextLines[index] };

      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        const firstVar = prod?.variants?.[0] || null;
        const extra = Number(firstVar?.extraPrice) || 0;
        const isPrimaryPlanProduct =
          index === 0 && activePlan && activePlan.productId === prod?.id;
        const base = isPrimaryPlanProduct
          ? Number(activePlan.price) || 0
          : Number(prod?.salesPrice) || 0;
        line.productId = prod?.id || '';
        line.productName = prod?.name || 'Product';
        line.variantId = firstVar?.id || '';
        line.variantLabel = firstVar
          ? `${firstVar.attribute}: ${firstVar.value}`
          : '';
        line.variantExtraPrice = extra;
        line.unitPrice = base + extra;
      } else if (field === 'variantId') {
        const prod = products.find((p) => p.id === line.productId);
        const pickedVar = prod?.variants?.find((v) => v.id === value) || null;
        const extra = Number(pickedVar?.extraPrice) || 0;
        const isPrimaryPlanProduct =
          index === 0 && activePlan && activePlan.productId === prod?.id;
        const base = isPrimaryPlanProduct
          ? Number(activePlan.price) || 0
          : Number(prod?.salesPrice) || 0;
        line.variantId = pickedVar?.id || '';
        line.variantLabel = pickedVar
          ? `${pickedVar.attribute}: ${pickedVar.value}`
          : '';
        line.variantExtraPrice = extra;
        line.unitPrice = base + extra;
      } else if (field === 'quantity') {
        line.quantity = Math.max(1, Number(value) || 1);
      } else if (field === 'unitPrice') {
        line.unitPrice = Math.max(0, Number(value) || 0);
      }

      nextLines[index] = line;
      return { ...prev, lines: nextLines };
    });
  };

  const handleRemoveLine = (index) => {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
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
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail.trim())
    ) {
      errors.customerEmail = 'Enter a valid customer email.';
    }
    if (!selectedPlan) {
      errors.planId = 'Select a subscription plan from the catalog.';
    }
    if (!formData.startDate) {
      errors.startDate = 'Start date is required.';
    }
    if (!formData.expiryDate) {
      errors.expiryDate = 'Expiry date is required.';
    } else if (formData.startDate && formData.expiryDate < formData.startDate) {
      errors.expiryDate = 'Expiry date cannot be earlier than start date.';
    }
    if (!formData.lines || formData.lines.length === 0) {
      errors.lines = 'Add at least one product line.';
    } else {
      const minQty = Number(selectedPlan?.minQuantity) || 1;
      const primaryLine =
        formData.lines.find(
          (l) => selectedPlan?.productId && l.productId === selectedPlan.productId
        ) || formData.lines[0];
      if ((Number(primaryLine?.quantity) || 0) < minQty) {
        errors.lines = `Minimum quantity for ${selectedPlan?.name || 'this plan'} is ${minQty}.`;
      }
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
          templateId: formData.templateId || '',
          templateName: formData.templateName || '',
          validityDays: formData.templateId ? formData.validityDays : null,
          preferredDiscountRuleId: formData.preferredDiscountRuleId || '',
          customerId: matchedCust?.customerId || matchedCust?.id || undefined,
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerOrganization: formData.customerOrganization,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          billingPeriod: selectedPlan.billingPeriod,
          minQuantity: selectedPlan.minQuantity,
          productId: selectedPlan.productId || formData.lines[0]?.productId || '',
          startDate: formData.startDate,
          expiryDate: formData.expiryDate,
          paymentTerms: formData.paymentTerms,
          initialStatus: formData.initialStatus,
          lines: formData.lines,
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
      showToast(err.message || 'Could not create quotation.', 'error');
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
        `${updated.subscriptionNumber} moved to ${updated.status}${
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
      await loadAll();
      if (onInvoiceGenerated) onInvoiceGenerated(inv);
    } catch (err) {
      showToast(err.message || 'Could not generate invoice.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenSeatsEditor = (sub) => {
    setSeatDraftLines(
      (sub.lineItems || []).map((l) => ({
        ...l,
        quantity: Number(l.quantity) || 1,
      }))
    );
    setSeatDiscountRuleId(sub.preferredDiscountRuleId || '');
    setEditingSeatsOpen(true);
  };

  const handleSaveSeatsAndDiscount = async () => {
    if (!selectedSub) return;
    setActionLoading(true);
    try {
      const updated = await operationsService.updateSubscriptionSeatsAndDiscount(
        selectedSub.id,
        {
          lines: seatDraftLines,
          preferredDiscountRuleId: seatDiscountRuleId,
        },
        user
      );
      setSelectedSub(updated);
      setEditingSeatsOpen(false);
      showToast(
        updated.discountAmount > 0
          ? `Updated seats & applied ${updated.discountName} for next invoice.`
          : `Updated seats & pricing on ${updated.subscriptionNumber}.`,
        'success'
      );
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not update subscription.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const seatEditPreview = useMemo(() => {
    const candidateLines = (seatDraftLines || []).map((l) => {
      const qty = Math.max(1, Number(l.quantity) || 1);
      const unit = Math.max(0, Number(l.unitPrice) || 0);
      return {
        ...l,
        quantity: qty,
        unitPrice: unit,
        amount: qty * unit,
      };
    });
    return evaluateApplicableDiscount(
      candidateLines,
      {
        evalDate: today,
        preferredRuleId: seatDiscountRuleId,
      },
      discountRules
    );
  }, [seatDraftLines, seatDiscountRuleId, today, discountRules]);

  const discountRuleOptions = useMemo(() => {
    return [
      { value: '', label: 'Auto-apply eligible discount rule' },
      { value: 'none', label: 'No discount' },
      ...discountRules.map((r) => {
        const st = getDiscountRuleStatus(r, today);
        const benefit =
          r.type === 'percentage' ? `${r.value}% off` : `${formatMoney(r.value)} off`;
        const minTag =
          Number(r.minQuantity) > 1
            ? ` · Min ${r.minQuantity} seats`
            : Number(r.minPurchase) > 0
            ? ` · Min ${formatMoney(r.minPurchase)}`
            : '';
        const statusTag = st !== 'active' ? ` [${st}]` : '';
        return {
          value: r.id,
          label: `${r.name} (${benefit}${minTag})${statusTag}`,
        };
      }),
    ];
  }, [discountRules, today]);

  const filteredSubs = subscriptions.filter((sub) => {
    const matchesStatus =
      statusFilter === 'all' || sub.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      sub.subscriptionNumber?.toLowerCase().includes(q) ||
      sub.customerName?.toLowerCase().includes(q) ||
      sub.customerEmail?.toLowerCase().includes(q) ||
      sub.planName?.toLowerCase().includes(q) ||
      sub.templateName?.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const canCloseActiveSub = (sub) => {
    if (!sub) return false;
    if (sub.status !== 'active') return sub.status !== 'closed';
    if (sub.planRules?.allowEarlyClose) return true;
    if (user?.role === 'admin') return true;
    return Boolean(sub.expiryDate && today >= sub.expiryDate);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Quotations & Subscriptions
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Prepare offers from quotation templates and track every subscription from Draft to Quotation, Confirmed, Active, and Closed.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={handleOpenCreate}>
          New Quotation
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
          Loading quotations and subscriptions...
        </div>
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No quotations or subscriptions yet"
          description={
            plans.length === 0
              ? 'An administrator needs to create at least one product and subscription plan before quotations can be prepared.'
              : 'Start from a quotation template to prepare a customer offer with pre-filled plan and product lines.'
          }
          actionLabel={plans.length > 0 ? 'New Quotation' : undefined}
          actionIcon={Plus}
          onAction={plans.length > 0 ? handleOpenCreate : undefined}
        />
      ) : filteredSubs.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm text-zinc-600 font-medium">
            No records match your current filters.
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
                  <th className="py-3 px-4">Plan & Lines</th>
                  <th className="py-3 px-4">Start & Expiry</th>
                  <th className="py-3 px-4">Payment Terms</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredSubs.map((sub) => {
                  const lineCount = Array.isArray(sub.lineItems)
                    ? sub.lineItems.length
                    : 1;
                  const stageIdx = Math.max(
                    0,
                    LIFECYCLE_ORDER.indexOf(sub.status)
                  );
                  const totalDisplay =
                    sub.totalWithTax !== undefined
                      ? sub.totalWithTax
                      : sub.recurringAmount;

                  return (
                    <tr
                      key={sub.id}
                      onClick={() => {
                        setSelectedSub(sub);
                        setEditingSeatsOpen(false);
                      }}
                      className="hover:bg-zinc-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-semibold text-zinc-900">
                          {sub.subscriptionNumber}
                        </div>
                        {sub.templateName && (
                          <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-36">
                            {sub.templateName}
                          </div>
                        )}
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
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {lineCount === 1
                            ? `${sub.quantity} × ${sub.productName}`
                            : `${lineCount} product lines`}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                        <div>Start: {formatDate(sub.startDate)}</div>
                        <div className="text-zinc-500">
                          Expiry: {formatDate(sub.expiryDate)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-zinc-700">
                        {sub.paymentTerms || 'Due on receipt'}
                      </td>
                      <td className="py-3.5 px-4">
                        <SubscriptionStatusBadge
                          status={sub.status}
                          isPaused={sub.isPaused}
                        />
                        <div
                          className="flex items-center gap-1 mt-1.5 w-24"
                          title={`Stage ${stageIdx + 1} of 5: ${sub.status}`}
                        >
                          {LIFECYCLE_ORDER.map((step, i) => (
                            <span
                              key={step}
                              className={`h-1 flex-1 rounded-full ${
                                i <= stageIdx ? 'bg-zinc-900' : 'bg-zinc-200'
                              }`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MoneyText amount={totalDisplay} />
                        {sub.discountAmount > 0 && (
                          <div className="text-[11px] font-medium text-emerald-700">
                            -{formatMoney(sub.discountAmount)} discount
                          </div>
                        )}
                        <div className="text-[11px] text-zinc-400">
                          {sub.taxAmount > 0
                            ? `incl. ${formatMoney(sub.taxAmount)} tax`
                            : `per ${sub.billingPeriod}`}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-900">
                          Open <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Quotation / Subscription Drawer */}
      <Drawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        width="max-w-3xl"
        title="Prepare Customer Quotation"
        subtitle="Start from a quotation template with pre-configured plan, validity days, and product lines, or customize freely."
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
              Save Record
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
            {/* Quotation Template & Assigned Number Header */}
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-900">
                  <FileSpreadsheet className="w-4 h-4 text-zinc-800" />
                  Quotation Template
                </div>
                <span className="font-mono text-[11px] font-semibold text-zinc-600 bg-white px-2 py-0.5 rounded border border-zinc-200">
                  Number: SUB-{1001 + subscriptions.length}
                </span>
              </div>
              <Select
                placeholder="Build manually without template"
                value={formData.templateId}
                options={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name} — ${t.planName} (Valid ${t.validityDays} days · ${
                    (t.lines || []).length
                  } ${(t.lines || []).length === 1 ? 'line' : 'lines'})`,
                }))}
                onChange={(e) => handleTemplatePick(e.target.value)}
              />
              {formData.templateId && (
                <div className="text-[11px] text-zinc-600">
                  Loaded plan, product lines, payment terms, and{' '}
                  <strong className="text-zinc-900">
                    {formData.validityDays}-day
                  </strong>{' '}
                  validity window from template.
                </div>
              )}
            </div>

            {/* Customer Details */}
            {customers.length > 0 && (
              <Select
                label="Existing Customer (Optional Quick Fill)"
                placeholder="Enter customer details or select existing..."
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
              label="Customer Organization"
              placeholder="Acme Corp"
              value={formData.customerOrganization}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  customerOrganization: e.target.value,
                }))
              }
            />

            {/* Plan, Dates & Payment Terms */}
            <div className="border-t border-zinc-200 pt-4 space-y-4">
              <Select
                label="Subscription Plan"
                required
                placeholder=""
                value={formData.planId}
                error={formErrors.planId}
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} — ${formatMoney(p.price)} / ${p.billingPeriod} (Min qty: ${p.minQuantity})`,
                }))}
                onChange={(e) => handlePlanPick(e.target.value)}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={formData.startDate}
                  error={formErrors.startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
                <Input
                  label="Expiry Date"
                  type="date"
                  required
                  value={formData.expiryDate}
                  error={formErrors.expiryDate}
                  hint={
                    formData.templateId
                      ? `Valid for ${formData.validityDays} days from start date`
                      : undefined
                  }
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, expiryDate: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Select
                  label="Payment Terms"
                  placeholder=""
                  value={formData.paymentTerms}
                  options={PAYMENT_TERM_OPTIONS}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, paymentTerms: e.target.value }))
                  }
                />
                <Select
                  label="Initial Stage"
                  placeholder=""
                  value={formData.initialStatus}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'quotation', label: 'Quotation (Ready to send)' },
                  ]}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, initialStatus: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Multi-Product Lines Editor */}
            <div className="border-t border-zinc-200 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-zinc-900">
                    Product Lines
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Product, quantity, unit price, automatic taxes, and line amount
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  onClick={handleAddLine}
                >
                  Add Line
                </Button>
              </div>

              {formErrors.lines && (
                <p className="text-xs font-medium text-red-600">
                  {formErrors.lines}
                </p>
              )}

              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <th className="py-2.5 px-3">Product</th>
                        <th className="py-2.5 px-2 w-24">Quantity</th>
                        <th className="py-2.5 px-2 w-32">Unit Price</th>
                        <th className="py-2.5 px-2 text-right">Taxes</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-2 w-9" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 align-top">
                      {draftPricing.lines.map((line, idx) => {
                        const prod = products.find(
                          (p) => p.id === line.productId
                        );
                        const prodVars = prod?.variants || [];

                        return (
                          <tr key={line.id || idx}>
                            <td className="py-2.5 px-3 space-y-1.5 min-w-52">
                              <select
                                value={line.productId}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'productId',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              {prodVars.length > 0 && (
                                <select
                                  value={line.variantId}
                                  onChange={(e) =>
                                    handleUpdateLine(
                                      idx,
                                      'variantId',
                                      e.target.value
                                    )
                                  }
                                  className="w-full px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px] text-zinc-700 focus:outline-none focus:border-zinc-900"
                                >
                                  <option value="">
                                    Standard (Base price)
                                  </option>
                                  {prodVars.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.attribute}: {v.value}
                                      {Number(v.extraPrice) > 0
                                        ? ` (+${formatMoney(v.extraPrice)})`
                                        : ''}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="py-2.5 px-2">
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'quantity',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs tabular-nums text-zinc-900 focus:outline-none focus:border-zinc-900"
                              />
                            </td>
                            <td className="py-2.5 px-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unitPrice}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    idx,
                                    'unitPrice',
                                    e.target.value
                                  )
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs tabular-nums text-zinc-900 focus:outline-none focus:border-zinc-900"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">
                              <div className="font-medium text-zinc-800">
                                {formatMoney(line.taxAmount)}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                {line.taxRate}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-zinc-900 tabular-nums whitespace-nowrap">
                              {formatMoney(line.amount)}
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              {draftPricing.lines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="p-1 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Remove line"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Volume / Admin Discount Rule Selector */}
              <Select
                label="Discount Rule"
                placeholder=""
                value={formData.preferredDiscountRuleId}
                options={discountRuleOptions}
                hint="Discounts apply automatically on invoices when seat/purchase thresholds and dates match, and stop when expired or exhausted."
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    preferredDiscountRuleId: e.target.value,
                  }))
                }
              />

              {/* Totals Summary */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-1.5 text-xs">
                {draftPricing.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-zinc-600">
                      <span>Gross Amount</span>
                      <span className="tabular-nums font-medium text-zinc-900">
                        {formatMoney(draftPricing.grossSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>Discount ({draftPricing.discountLabel})</span>
                      <span className="tabular-nums">
                        -{formatMoney(draftPricing.discountAmount)}
                      </span>
                    </div>
                  </>
                )}
                {draftPricing.discountStoppedReason && (
                  <div className="text-[11px] text-amber-700">
                    Discount inactive: {draftPricing.discountStoppedReason}
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>Untaxed Amount</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(draftPricing.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Taxes ({draftPricing.taxRate})</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(draftPricing.taxAmount)}
                  </span>
                </div>
                <div className="border-t border-zinc-200 pt-2 flex justify-between items-center text-sm font-bold text-zinc-900">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(draftPricing.total)}
                    {selectedPlan ? ` / ${selectedPlan.billingPeriod}` : ''}
                  </span>
                </div>
              </div>
            </div>
          </form>
        )}
      </Drawer>

      {/* Quotation / Subscription Detail & Lifecycle Stepper Drawer */}
      <Drawer
        isOpen={Boolean(selectedSub)}
        onClose={() => {
          setSelectedSub(null);
          setEditingSeatsOpen(false);
        }}
        width="max-w-2xl"
        title={
          selectedSub
            ? `${selectedSub.subscriptionNumber} · ${selectedSub.customerName}`
            : 'Subscription'
        }
        subtitle={
          selectedSub
            ? `${selectedSub.planName} (${selectedSub.billingPeriod})${
                selectedSub.templateName
                  ? ` · From ${selectedSub.templateName}`
                  : ''
              }`
            : ''
        }
      >
        {selectedSub && (
          <div className="space-y-6">
            {/* Lifecycle Progress Stepper: Draft -> Quotation -> Confirmed -> Active -> Closed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Lifecycle Stage
                </span>
                <SubscriptionStatusBadge
                  status={selectedSub.status}
                  isPaused={selectedSub.isPaused}
                />
              </div>
              <StatusStepper currentStatus={selectedSub.status} />
            </div>

            {/* Stage Transition Actions */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Stage Transitions & Operations
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
                      Move to Quotation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={XCircle}
                      disabled={actionLoading}
                      onClick={() => setConfirmCloseSub(selectedSub)}
                    >
                      Close
                    </Button>
                  </>
                )}

                {selectedSub.status === 'quotation' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CheckCircle2}
                      loading={actionLoading}
                      onClick={() => handleTransition(selectedSub.id, 'confirm')}
                    >
                      Confirm Quotation
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={XCircle}
                      disabled={actionLoading}
                      onClick={() => setConfirmCloseSub(selectedSub)}
                    >
                      Close
                    </Button>
                  </>
                )}

                {selectedSub.status === 'confirmed' && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Play}
                      loading={actionLoading}
                      onClick={() =>
                        handleTransition(selectedSub.id, 'activate')
                      }
                    >
                      Activate Subscription
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={XCircle}
                      disabled={actionLoading}
                      onClick={() => setConfirmCloseSub(selectedSub)}
                    >
                      Close
                    </Button>
                  </>
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

                    {canCloseActiveSub(selectedSub) ? (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={XCircle}
                        disabled={actionLoading}
                        onClick={() => setConfirmCloseSub(selectedSub)}
                      >
                        Close Subscription
                      </Button>
                    ) : (
                      <span className="inline-flex items-center text-xs text-zinc-500 px-2 py-1">
                        Early close disabled until{' '}
                        {formatDate(selectedSub.expiryDate)}
                      </span>
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

            {/* Header Metadata Grid: Number, Customer, Plan, Start Date, Expiry Date, Payment Terms */}
            <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-zinc-400">Subscription Number</div>
                <div className="font-mono font-semibold text-zinc-900 mt-0.5">
                  {selectedSub.subscriptionNumber}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Customer</div>
                <div className="font-semibold text-zinc-900 mt-0.5">
                  {selectedSub.customerName}
                </div>
                <div className="text-zinc-500 truncate">
                  {selectedSub.customerEmail}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Plan</div>
                <div className="font-semibold text-zinc-900 mt-0.5">
                  {selectedSub.planName}
                </div>
                <div className="text-zinc-500 capitalize">
                  Billed {selectedSub.billingPeriod}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Start Date</div>
                <div className="font-medium text-zinc-900 mt-0.5 tabular-nums">
                  {formatDate(selectedSub.startDate)}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Expiry Date</div>
                <div className="font-medium text-zinc-900 mt-0.5 tabular-nums">
                  {formatDate(selectedSub.expiryDate)}
                </div>
                {selectedSub.validityDays && (
                  <div className="text-[11px] text-zinc-500">
                    {selectedSub.validityDays}-day validity
                  </div>
                )}
              </div>
              <div>
                <div className="text-zinc-400">Payment Terms</div>
                <div className="font-medium text-zinc-900 mt-0.5">
                  {selectedSub.paymentTerms || 'Due on receipt'}
                </div>
              </div>
            </div>

            {/* Product Lines Table: Product | Quantity | Unit Price | Taxes | Amount */}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-700">
                    Product Lines
                  </span>
                  {selectedSub.templateName && (
                    <span className="text-[11px] text-zinc-500">
                      · {selectedSub.templateName}
                    </span>
                  )}
                </div>
                {selectedSub.status !== 'closed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Tag}
                    onClick={() =>
                      editingSeatsOpen
                        ? setEditingSeatsOpen(false)
                        : handleOpenSeatsEditor(selectedSub)
                    }
                  >
                    {editingSeatsOpen ? 'Cancel' : 'Adjust Seats / Discount'}
                  </Button>
                )}
              </div>

              {editingSeatsOpen && (
                <div className="p-4 bg-zinc-50/80 border-b border-zinc-200 space-y-3 text-xs">
                  <div className="font-semibold text-zinc-900">
                    Update Seat Quantities & Discount Rule
                  </div>
                  <div className="space-y-2">
                    {seatDraftLines.map((line, lIdx) => (
                      <div
                        key={line.id || lIdx}
                        className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-lg border border-zinc-200"
                      >
                        <div className="font-medium text-zinc-900 truncate">
                          {line.productName || line.name}
                          {line.variant ? ` (${line.variant})` : ''}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-zinc-500">Seats / Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const qty = Math.max(
                                1,
                                Number(e.target.value) || 1
                              );
                              setSeatDraftLines((prev) =>
                                prev.map((item, i) =>
                                  i === lIdx ? { ...item, quantity: qty } : item
                                )
                              );
                            }}
                            className="w-20 px-2 py-1 rounded border border-zinc-300 text-xs tabular-nums text-zinc-900"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <Select
                    label="Discount Rule for Next Invoice"
                    placeholder=""
                    value={seatDiscountRuleId}
                    options={discountRuleOptions}
                    onChange={(e) => setSeatDiscountRuleId(e.target.value)}
                  />
                  {seatEditPreview.discountAmount > 0 ? (
                    <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2">
                      <span>
                        Next invoice discount unlocked:{' '}
                        <strong>{seatEditPreview.discountLabel}</strong>
                      </span>
                      <span className="font-semibold tabular-nums">
                        -{formatMoney(seatEditPreview.discountAmount)}
                      </span>
                    </div>
                  ) : seatEditPreview.stoppedReason ? (
                    <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      {seatEditPreview.stoppedReason}
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-lg bg-white border border-zinc-200 text-zinc-500">
                      Gross subtotal:{' '}
                      <strong className="text-zinc-800 tabular-nums">
                        {formatMoney(seatEditPreview.grossSubtotal)}
                      </strong>{' '}
                      · No active discount rule matched at current seat count.
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={actionLoading}
                      onClick={handleSaveSeatsAndDiscount}
                    >
                      Apply Seats & Discount
                    </Button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-3 text-right">Quantity</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Taxes</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {(selectedSub.lineItems || []).map((line) => (
                      <tr key={line.id}>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-zinc-900">
                            {line.productName || line.name}
                          </div>
                          {line.variant && (
                            <div className="text-[11px] text-zinc-500">
                              {line.variant}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-zinc-800">
                          {line.quantity}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-zinc-800">
                          {formatMoney(line.unitPrice)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums text-zinc-700">
                          <div>{formatMoney(line.taxAmount || 0)}</div>
                          <div className="text-[10px] text-zinc-400">
                            {line.taxRate || '0%'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold tabular-nums text-zinc-900">
                          {formatMoney(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Footer */}
              <div className="border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 space-y-1.5 text-xs">
                {selectedSub.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-zinc-600">
                      <span>Gross Amount</span>
                      <span className="tabular-nums font-medium text-zinc-900">
                        {formatMoney(selectedSub.grossSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>
                        Discount ({selectedSub.discountLabel || selectedSub.discountName})
                      </span>
                      <span className="tabular-nums">
                        -{formatMoney(selectedSub.discountAmount)}
                      </span>
                    </div>
                  </>
                )}
                {selectedSub.discountStoppedReason && (
                  <div className="text-[11px] text-amber-700">
                    Discount stopped automatically: {selectedSub.discountStoppedReason}
                  </div>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>Untaxed Amount</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(selectedSub.subtotal ?? selectedSub.recurringAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Taxes ({selectedSub.taxRate || '0%'})</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(selectedSub.taxAmount || 0)}
                  </span>
                </div>
                <div className="border-t border-zinc-200 pt-2 flex justify-between text-sm font-bold text-zinc-900">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMoney(
                      selectedSub.totalWithTax ?? selectedSub.recurringAmount
                    )}{' '}
                    / {selectedSub.billingPeriod}
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
        title="Close Record"
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
              Confirm Close
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Move{' '}
          <strong className="text-zinc-900">
            {confirmCloseSub?.subscriptionNumber}
          </strong>{' '}
          for{' '}
          <strong className="text-zinc-900">
            {confirmCloseSub?.customerName}
          </strong>{' '}
          to <strong className="text-zinc-900">Closed</strong>? Future recurring billing cycles will stop immediately.
        </p>
      </Modal>
    </div>
  );
}
