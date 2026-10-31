import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Printer,
  Sparkles,
  Building,
  Plus,
  Minus,
  Repeat,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastContext';
import { planService } from '../../api/services/planService';
import { productService } from '../../api/services/productService';
import { billingService, computeNextBillingDate } from '../../api/services/billingService';
import { formatMoney, formatDate } from '../../lib/format';
import { BrandLogo } from '../../components/common/BrandLogo';
import PlanBadge from '../../components/domain/PlanBadge';

export default function CustomerBillingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPlanId = searchParams.get('planId') || searchParams.get('plan');

  // Loading state
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);

  // Selected state
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [selectedPlanVariantId, setSelectedPlanVariantId] = useState(null);
  const [planQuantity, setPlanQuantity] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState({}); // { [productId]: { selected: bool, variantId: string, quantity: number } }

  // Customer & Payment Form state
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [organization, setOrganization] = useState(user?.organization || '');
  const [billingAddress, setBillingAddress] = useState('742 Evergreen Terrace, Tech Park, Suite 400');
  const [taxId, setTaxId] = useState('');

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'upi' | 'wire'
  const [cardNumber, setCardNumber] = useState('4242 •••• •••• 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('888');
  const [upiId, setUpiId] = useState('billing@okaxis');
  const [agreeTerms, setAgreeTerms] = useState(true);

  // Submission state
  const [isProcessing, setIsProcessing] = useState(false);
  const [billingResult, setBillingResult] = useState(null); // { subscription, invoice }

  // Load catalog
  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const [loadedPlans, loadedProducts] = await Promise.all([
          planService.getPlans(),
          productService.getProducts(),
        ]);
        setPlans(loadedPlans);
        setProducts(loadedProducts);

        // Auto-select initial plan
        if (loadedPlans.length > 0) {
          const matched = initialPlanId
            ? loadedPlans.find((p) => p.id === initialPlanId)
            : loadedPlans[0];
          const activePlan = matched || loadedPlans[0];
          setSelectedPlanId(activePlan.id);
          setPlanQuantity(activePlan.minQuantity || 1);

          // Find associated product and pick its first variant
          const assocProd = loadedProducts.find((p) => p.id === activePlan.productId);
          if (assocProd && assocProd.variants && assocProd.variants.length > 0) {
            setSelectedPlanVariantId(assocProd.variants[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load catalog', err);
        showToast('Unable to load subscription plans catalog', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [initialPlanId, showToast]);

  // Update customer fields when user changes
  useEffect(() => {
    if (user) {
      if (!customerName) setCustomerName(user.name || '');
      if (!customerEmail) setCustomerEmail(user.email || '');
      if (!organization) setOrganization(user.organization || '');
    }
  }, [user]);

  // Active selected plan object
  const currentPlan = useMemo(() => {
    return plans.find((p) => p.id === selectedPlanId) || null;
  }, [plans, selectedPlanId]);

  // Associated product for current plan
  const planProduct = useMemo(() => {
    if (!currentPlan) return null;
    return products.find((p) => p.id === currentPlan.productId) || null;
  }, [products, currentPlan]);

  // Selected variant for the plan product
  const planVariant = useMemo(() => {
    if (!planProduct || !planProduct.variants) return null;
    return planProduct.variants.find((v) => v.id === selectedPlanVariantId) || null;
  }, [planProduct, selectedPlanVariantId]);

  // Add-on products (products other than the plan's main product)
  const availableAddons = useMemo(() => {
    if (!currentPlan) return [];
    return products.filter((p) => p.id !== currentPlan.productId && p.isActive !== false);
  }, [products, currentPlan]);

  // Calculate pricing
  const pricingCalculation = useMemo(() => {
    if (!currentPlan) {
      return { planTotal: 0, addOnsTotal: 0, subtotal: 0, taxAmount: 0, totalAmount: 0, addOnItems: [] };
    }

    const qty = Math.max(Number(planQuantity) || 1, currentPlan.minQuantity || 1);
    const variantExtra = planVariant ? Number(planVariant.extraPrice) || 0 : 0;
    const planUnitPrice = (Number(currentPlan.price) || 0) + variantExtra;
    const planTotal = planUnitPrice * qty;

    const addOnItems = [];
    let addOnsTotal = 0;

    Object.entries(selectedAddons).forEach(([productId, config]) => {
      if (!config || !config.selected) return;
      const addonProd = products.find((p) => p.id === productId);
      if (!addonProd) return;

      const variant = addonProd.variants?.find((v) => v.id === config.variantId) || null;
      const extra = variant ? Number(variant.extraPrice) || 0 : 0;
      const unitPrice = (Number(addonProd.salesPrice) || 0) + extra;
      const addonQty = Number(config.quantity) || 1;
      const amount = unitPrice * addonQty;
      addOnsTotal += amount;

      addOnItems.push({
        ...addonProd,
        selectedVariant: variant,
        quantity: addonQty,
        unitPrice,
        amount,
      });
    });

    const subtotal = planTotal + addOnsTotal;
    const taxRate = 0.18; // 18% GST
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      planUnitPrice,
      planTotal,
      addOnsTotal,
      subtotal,
      taxRate: '18% GST',
      taxAmount,
      totalAmount,
      addOnItems,
      qty,
    };
  }, [currentPlan, planVariant, planQuantity, selectedAddons, products]);

  // Handle plan selection change
  const handleSelectPlan = (plan) => {
    setSelectedPlanId(plan.id);
    const minQty = plan.minQuantity || 1;
    if (planQuantity < minQty) {
      setPlanQuantity(minQty);
    }
    const matchedProd = products.find((p) => p.id === plan.productId);
    if (matchedProd && matchedProd.variants && matchedProd.variants.length > 0) {
      setSelectedPlanVariantId(matchedProd.variants[0].id);
    } else {
      setSelectedPlanVariantId(null);
    }
  };

  // Toggle Addon selection
  const handleToggleAddon = (productId) => {
    setSelectedAddons((prev) => {
      const current = prev[productId] || { selected: false, quantity: 1, variantId: null };
      const prod = products.find((p) => p.id === productId);
      const defaultVariant = prod?.variants?.[0]?.id || null;

      return {
        ...prev,
        [productId]: {
          ...current,
          selected: !current.selected,
          variantId: current.variantId || defaultVariant,
          quantity: current.quantity || 1,
        },
      };
    });
  };

  // Update Addon configuration
  const handleUpdateAddon = (productId, updates) => {
    setSelectedAddons((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { selected: true, quantity: 1 }),
        ...updates,
      },
    }));
  };

  // Execute checkout & generate invoice
  const handleConfirmAndPay = async (e) => {
    e.preventDefault();

    if (!currentPlan) {
      showToast('Please select a subscription plan', 'error');
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      showToast('Please provide your name and email address', 'error');
      return;
    }

    if (!agreeTerms) {
      showToast('Please accept the recurring billing terms to continue', 'error');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await billingService.processBillingCheckout({
        plan: currentPlan,
        product: planProduct,
        selectedVariant: planVariant,
        quantity: pricingCalculation.qty,
        addOns: pricingCalculation.addOnItems,
        customer: {
          id: user?.id,
          name: customerName.trim(),
          email: customerEmail.trim(),
          organization: organization.trim(),
          billingAddress: billingAddress.trim(),
          taxId: taxId.trim(),
        },
        payment: {
          method: paymentMethod,
          methodTitle:
            paymentMethod === 'card'
              ? `Credit Card (${cardNumber.slice(-4) || '4242'})`
              : paymentMethod === 'upi'
              ? `UPI (${upiId})`
              : 'Direct Corporate Bank Wire',
        },
      });

      if (res.success) {
        setBillingResult(res);
        showToast('Subscription activated and invoice billed successfully!', 'success');
      }
    } catch (err) {
      console.error('Billing failed', err);
      showToast(err.message || 'Payment processing failed. Please try again.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // If in printable receipt state
  if (billingResult) {
    const { subscription, invoice } = billingResult;

    return (
      <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 pb-16">
        {/* Navigation Top bar */}
        <header className="h-14 border-b border-zinc-200 bg-white px-6 flex items-center justify-between print:hidden">
          <BrandLogo size="md" />
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
            <Link
              to="/portal"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-zinc-900 rounded-md hover:bg-zinc-800 transition-colors no-underline"
            >
              Go to Customer Portal
            </Link>
          </div>
        </header>

        {/* Invoice Receipt Container */}
        <main className="max-w-3xl mx-auto mt-8 px-4 sm:px-6">
          {/* Success Banner */}
          <div className="mb-6 p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-3.5 text-emerald-950 print:hidden">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-sm">
                Subscription Activated & Payment Confirmed
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                Your subscription <strong>{subscription.subscriptionNumber}</strong> is active. An official invoice receipt has been issued and stored.
              </div>
            </div>
          </div>

          {/* Printable Invoice Document */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-10 shadow-sm print:border-none print:shadow-none print:p-0">
            {/* Document Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-zinc-200 gap-4">
              <div>
                <BrandLogo size="lg" />
                <div className="text-xs text-zinc-500 mt-2">
                  Brightloop Technologies Inc.<br />
                  Recurring Billing & Subscription Engine
                </div>
              </div>
              <div className="sm:text-right">
                <span className="inline-block px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded bg-emerald-100 text-emerald-800">
                  Paid
                </span>
                <h2 className="text-xl font-bold tracking-tight text-zinc-900 mt-2">
                  {invoice.invoiceNumber}
                </h2>
                <div className="text-xs text-zinc-500 mt-0.5">
                  Issued: <strong>{formatDate(invoice.date)}</strong>
                </div>
              </div>
            </div>

            {/* Billing Parties */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-zinc-200 text-xs">
              <div>
                <div className="text-zinc-400 uppercase font-semibold tracking-wider text-[11px] mb-1">
                  Billed To
                </div>
                <div className="font-bold text-zinc-900 text-sm">{invoice.customerName}</div>
                {invoice.organization && (
                  <div className="text-zinc-600 font-medium">{invoice.organization}</div>
                )}
                <div className="text-zinc-500">{invoice.customerEmail}</div>
                <div className="text-zinc-500 mt-1">{invoice.billingAddress}</div>
              </div>

              <div className="sm:text-right">
                <div className="text-zinc-400 uppercase font-semibold tracking-wider text-[11px] mb-1">
                  Subscription Reference
                </div>
                <div className="font-bold text-zinc-900">{subscription.subscriptionNumber}</div>
                <div className="text-zinc-600 capitalize">
                  Plan: {subscription.planName} ({subscription.billingPeriod})
                </div>
                <div className="text-zinc-500 mt-1">
                  Next Renewal: <strong>{formatDate(subscription.nextBillingDate)}</strong>
                </div>
                <div className="text-zinc-500">
                  Payment Method: {invoice.paymentMethod}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="py-6">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500 uppercase font-semibold">
                    <th className="pb-3">Description</th>
                    <th className="pb-3 text-center">Qty</th>
                    <th className="pb-3 text-right">Unit Price</th>
                    <th className="pb-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {invoice.lineItems.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-3.5 pr-2">
                        <div className="font-semibold text-zinc-900">{item.name}</div>
                        {item.variant && (
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            Variant: {item.variant}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-center text-zinc-700 tabular-nums">
                        {item.quantity}
                      </td>
                      <td className="py-3.5 text-right text-zinc-700 tabular-nums">
                        {formatMoney(item.unitPrice)}
                      </td>
                      <td className="py-3.5 text-right font-medium text-zinc-900 tabular-nums">
                        {formatMoney(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="pt-4 border-t border-zinc-200 flex flex-col items-end">
              <div className="w-full sm:w-64 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{formatMoney(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Estimated Tax ({invoice.taxRate})</span>
                  <span className="tabular-nums font-medium">{formatMoney(invoice.taxAmount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-zinc-200 text-sm font-bold text-zinc-900">
                  <span>Total Paid</span>
                  <span className="tabular-nums">{formatMoney(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Footer Terms */}
            <div className="mt-10 pt-6 border-t border-zinc-200 text-[11px] text-zinc-400 flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>Thank you for choosing Brightloop. Automated receipt.</div>
              <div>Single-source invoice verification ID: {invoice.id}</div>
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-6 flex flex-wrap gap-3 justify-center print:hidden">
            <button
              type="button"
              onClick={() => setBillingResult(null)}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 shadow-2xs"
            >
              Select Another Plan
            </button>
            <Link
              to="/portal"
              className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 rounded-md hover:bg-zinc-800 no-underline shadow-2xs"
            >
              Return to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col">
      {/* Top Application Bar */}
      <header className="h-14 border-b border-zinc-200 bg-white px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          <span className="hidden sm:inline-block text-xs text-zinc-400">|</span>
          <span className="hidden sm:inline-block text-xs font-medium text-zinc-600">
            Subscription Checkout & Recurring Billing
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-900" />
            <span className="hidden md:inline">Secure 256-Bit SSL Checkout</span>
          </div>
          <Link
            to="/portal"
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-2 py-1 rounded hover:bg-zinc-100 no-underline"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8">
        {/* Page Heading */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
            Customer Subscription Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Choose Your Plan & Billing Details
          </h1>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Select your software subscription tier, configure custom add-on products and variants, and set up automated recurring billing.
          </p>
        </div>

        {loading ? (
          <div className="p-16 text-center text-zinc-400 text-sm bg-white rounded-xl border border-zinc-200">
            Loading subscription catalog...
          </div>
        ) : (
          <form onSubmit={handleConfirmAndPay} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Columns: Plan & Product Selection + Customer Form */}
            <div className="lg:col-span-7 space-y-8">
              {/* 1. Plan Selection Grid */}
              <section className="bg-white rounded-xl border border-zinc-200 p-6 shadow-2xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
                  <div>
                    <h2 className="text-base font-bold text-zinc-900">
                      1. Select Subscription Plan
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Choose your core billing cadence and licensing model
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md">
                    {plans.length} Tier{plans.length === 1 ? '' : 's'} Available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {plans.map((plan) => {
                    const isSelected = selectedPlanId === plan.id;

                    return (
                      <div
                        key={plan.id}
                        onClick={() => handleSelectPlan(plan)}
                        className={`relative p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-zinc-900 bg-zinc-50/60 shadow-xs ring-1 ring-zinc-900'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-sm text-zinc-900">
                              {plan.name}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                              {plan.productName || 'Core Software Package'}
                            </div>
                          </div>
                          <div
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-zinc-900 border-zinc-900 text-white'
                                : 'border-zinc-300'
                            }`}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5" />}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-zinc-100 flex items-baseline justify-between">
                          <div>
                            <span className="text-lg font-extrabold text-zinc-900 tabular-nums">
                              {formatMoney(plan.price)}
                            </span>
                            <span className="text-xs text-zinc-500 capitalize">
                              /{plan.billingPeriod}
                            </span>
                          </div>
                          <PlanBadge
                            availableFrom={plan.availableFrom}
                            availableTo={plan.availableTo}
                          />
                        </div>

                        {/* Behaviors summary pill */}
                        <div className="mt-3 flex flex-wrap gap-1 text-[10px] text-zinc-500">
                          {plan.minQuantity > 1 && (
                            <span className="bg-zinc-100 px-1.5 py-0.5 rounded font-medium">
                              Min {plan.minQuantity} seats
                            </span>
                          )}
                          {plan.allowPause && (
                            <span className="bg-zinc-100 px-1.5 py-0.5 rounded font-medium">
                              Pausable
                            </span>
                          )}
                          {plan.allowEarlyClose && (
                            <span className="bg-zinc-100 px-1.5 py-0.5 rounded font-medium">
                              Cancel anytime
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 2. Configure Plan Product & Variant */}
              {currentPlan && planProduct && (
                <section className="bg-white rounded-xl border border-zinc-200 p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">
                        2. Configure Product & Variants
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Selected: <strong className="text-zinc-800">{planProduct.name}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Variants Selector */}
                    {planProduct.variants && planProduct.variants.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 mb-2">
                          Choose Variant / Brand Option
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {planProduct.variants.map((v) => {
                            const isVarSelected = selectedPlanVariantId === v.id;
                            const extra = Number(v.extraPrice) || 0;

                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setSelectedPlanVariantId(v.id)}
                                className={`text-left p-3 rounded-lg border text-xs transition-all ${
                                  isVarSelected
                                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-2xs'
                                    : 'border-zinc-200 bg-white hover:border-zinc-300 text-zinc-800'
                                }`}
                              >
                                <div className="font-semibold flex items-center justify-between">
                                  <span>{v.attribute}: {v.value}</span>
                                  {isVarSelected && <Check className="w-3.5 h-3.5" />}
                                </div>
                                <div className={`text-[11px] mt-1 ${isVarSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                  {extra > 0 ? `+${formatMoney(extra)} adjustment` : 'Included in base price'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Quantity Stepper */}
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-zinc-800">
                          License / User Quantity
                        </label>
                        <p className="text-[11px] text-zinc-500">
                          Minimum {currentPlan.minQuantity || 1} required by this plan
                        </p>
                      </div>

                      <div className="flex items-center gap-2 border border-zinc-200 rounded-lg p-1 bg-zinc-50">
                        <button
                          type="button"
                          onClick={() =>
                            setPlanQuantity((prev) =>
                              Math.max(Number(currentPlan.minQuantity || 1), prev - 1)
                            )
                          }
                          disabled={planQuantity <= (currentPlan.minQuantity || 1)}
                          className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold tabular-nums text-zinc-900">
                          {planQuantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPlanQuantity((prev) => prev + 1)}
                          className="w-7 h-7 rounded flex items-center justify-center text-zinc-600 hover:bg-white transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 3. Optional Add-on Products */}
              {availableAddons.length > 0 && (
                <section className="bg-white rounded-xl border border-zinc-200 p-6 shadow-2xs">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
                    <div>
                      <h2 className="text-base font-bold text-zinc-900">
                        3. Optional Catalog Add-ons
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Enhance your subscription with additional integrated services
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {availableAddons.map((addon) => {
                      const config = selectedAddons[addon.id] || { selected: false, quantity: 1 };
                      const isSelected = Boolean(config.selected);

                      return (
                        <div
                          key={addon.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-zinc-900 bg-zinc-50/50'
                              : 'border-zinc-200 bg-white hover:border-zinc-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                id={`addon_${addon.id}`}
                                checked={isSelected}
                                onChange={() => handleToggleAddon(addon.id)}
                                className="mt-1 w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                              />
                              <div>
                                <label
                                  htmlFor={`addon_${addon.id}`}
                                  className="font-semibold text-xs text-zinc-900 cursor-pointer"
                                >
                                  {addon.name}
                                </label>
                                {addon.notes && (
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {addon.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right whitespace-nowrap">
                              <span className="font-bold text-xs text-zinc-900 tabular-nums">
                                +{formatMoney(addon.salesPrice)}
                              </span>
                              <span className="text-[10px] text-zinc-500 capitalize">
                                /{currentPlan?.billingPeriod || 'mo'}
                              </span>
                            </div>
                          </div>

                          {/* If selected and has variants */}
                          {isSelected && addon.variants && addon.variants.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-200/60 pl-7 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-zinc-600 font-medium">
                                Option:
                              </span>
                              {addon.variants.map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateAddon(addon.id, { variantId: v.id })
                                  }
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium border ${
                                    config.variantId === v.id
                                      ? 'bg-zinc-900 text-white border-zinc-900'
                                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300'
                                  }`}
                                >
                                  {v.attribute}: {v.value} (+₹{v.extraPrice})
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* 4. Customer Information & Payment Method */}
              <section className="bg-white rounded-xl border border-zinc-200 p-6 shadow-2xs space-y-5">
                <div className="pb-3 border-b border-zinc-100">
                  <h2 className="text-base font-bold text-zinc-900">
                    4. Billing Information & Payment
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Enter recipient and payment details for recurring invoices
                  </p>
                </div>

                {/* Name & Email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-white border border-zinc-300 rounded-md focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="jane@company.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-white border border-zinc-300 rounded-md focus:border-zinc-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Organization & Tax ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Organization / Business Name
                    </label>
                    <input
                      type="text"
                      placeholder="Acme Global Inc."
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-white border border-zinc-300 rounded-md focus:border-zinc-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      GST / Tax ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="29AAAAA0000A1Z5"
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      className="w-full h-9 px-3 text-xs bg-white border border-zinc-300 rounded-md focus:border-zinc-900 focus:outline-none uppercase"
                    />
                  </div>
                </div>

                {/* Billing Address */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Billing Address
                  </label>
                  <input
                    type="text"
                    placeholder="Street, City, State, ZIP"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-white border border-zinc-300 rounded-md focus:border-zinc-900 focus:outline-none"
                  />
                </div>

                {/* Payment Method Selector */}
                <div className="pt-4 border-t border-zinc-100">
                  <label className="block text-xs font-semibold text-zinc-800 mb-2">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('card')}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        paymentMethod === 'card'
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('upi')}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        paymentMethod === 'upi'
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      UPI / VPA
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('wire')}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        paymentMethod === 'wire'
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <Building className="w-3.5 h-3.5" />
                      Bank Wire
                    </button>
                  </div>

                  {/* Payment Method Inputs */}
                  <div className="mt-3 bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-xs">
                    {paymentMethod === 'card' && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] text-zinc-500 font-medium">Card Number</label>
                          <input
                            type="text"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="w-full h-8 px-2 text-xs font-mono bg-white border border-zinc-300 rounded"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-zinc-500 font-medium">Expiry</label>
                            <input
                              type="text"
                              value={cardExpiry}
                              onChange={(e) => setCardExpiry(e.target.value)}
                              className="w-full h-8 px-2 text-xs font-mono bg-white border border-zinc-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-zinc-500 font-medium">CVC</label>
                            <input
                              type="password"
                              value={cardCvc}
                              onChange={(e) => setCardCvc(e.target.value)}
                              className="w-full h-8 px-2 text-xs font-mono bg-white border border-zinc-300 rounded"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'upi' && (
                      <div>
                        <label className="text-[11px] text-zinc-500 font-medium">Virtual Payment Address (VPA)</label>
                        <input
                          type="text"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          placeholder="username@bank"
                          className="w-full h-8 px-2 text-xs bg-white border border-zinc-300 rounded mt-1"
                        />
                      </div>
                    )}

                    {paymentMethod === 'wire' && (
                      <div className="text-[11px] text-zinc-600 space-y-1">
                        <div>Account: Brightloop Technologies Pvt Ltd</div>
                        <div>IFSC / SWIFT: HDFC0000424 | ACC: 50200088194411</div>
                        <div className="text-zinc-400">Invoice will be marked paid upon reconciliation.</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Terms agreement */}
                <div className="pt-2 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="terms_check"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                  />
                  <label htmlFor="terms_check" className="text-xs text-zinc-600 leading-snug cursor-pointer">
                    I authorize Brightloop to initiate recurring charges per the selected subscription plan frequency until cancelled.
                  </label>
                </div>
              </section>
            </div>

            {/* Right 5 Columns: Sticky Order Summary & Pay Action */}
            <div className="lg:col-span-5 sticky top-20">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <h3 className="text-sm font-bold text-zinc-900">Billing Summary</h3>
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {currentPlan?.billingPeriod} Cycle
                  </span>
                </div>

                {/* Selected Plan Row */}
                {currentPlan && (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-zinc-900">{currentPlan.name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {planProduct?.name} {planVariant && `(${planVariant.value})`}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">
                          {pricingCalculation.qty} license{pricingCalculation.qty > 1 ? 's' : ''} × {formatMoney(pricingCalculation.planUnitPrice)}
                        </div>
                      </div>
                      <div className="font-semibold text-zinc-900 tabular-nums">
                        {formatMoney(pricingCalculation.planTotal)}
                      </div>
                    </div>

                    {/* Add-on rows */}
                    {pricingCalculation.addOnItems.map((addon) => (
                      <div key={addon.id} className="flex items-start justify-between text-zinc-700 pl-2 border-l-2 border-zinc-200">
                        <div>
                          <div className="font-medium text-xs">{addon.name}</div>
                          {addon.selectedVariant && (
                            <div className="text-[10px] text-zinc-400">
                              {addon.selectedVariant.value}
                            </div>
                          )}
                        </div>
                        <div className="tabular-nums font-medium text-xs">
                          {formatMoney(addon.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Subtotals & Taxes */}
                <div className="pt-4 border-t border-zinc-100 space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(pricingCalculation.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Applicable Tax ({pricingCalculation.taxRate})</span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(pricingCalculation.taxAmount)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-zinc-200 flex items-baseline justify-between">
                    <div>
                      <div className="text-sm font-bold text-zinc-900">Total Billed Today</div>
                      <div className="text-[11px] text-zinc-400">
                        Renews {currentPlan ? formatDate(computeNextBillingDate(currentPlan.billingPeriod)) : 'next cycle'}
                      </div>
                    </div>
                    <div className="text-xl font-extrabold text-zinc-900 tabular-nums">
                      {formatMoney(pricingCalculation.totalAmount)}
                    </div>
                  </div>
                </div>

                {/* Submit Pay Button */}
                <button
                  type="submit"
                  disabled={isProcessing || !currentPlan}
                  className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-semibold text-xs tracking-wide rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing Recurring Payment...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Confirm Subscription & Pay {formatMoney(pricingCalculation.totalAmount)}
                    </>
                  )}
                </button>

                {/* Guarantee / Security notice */}
                <div className="pt-2 text-[11px] text-zinc-400 text-center leading-relaxed">
                  Your billing schedule begins today. Invoices will automatically generate per {currentPlan?.billingPeriod || 'monthly'} term. You can manage or pause your plan anytime in the customer portal.
                </div>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
