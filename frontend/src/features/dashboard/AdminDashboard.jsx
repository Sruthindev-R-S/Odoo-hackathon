import { useState, useEffect } from 'react';
import {
  Package,
  CalendarDays,
  Plus,
  ArrowRight,
  Tag,
  ShieldCheck,
  Sparkles,
  Percent,
  PlayCircle,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useProducts } from '../products/useProducts';
import { usePlans } from '../plans/usePlans';
import { taxService } from '../../api/services/taxService';
import {
  discountService,
  getDiscountRuleStatus,
} from '../../api/services/discountService';

export default function AdminDashboard({ onNavigate }) {
  const { products } = useProducts();
  const { plans } = usePlans();
  const [taxRules, setTaxRules] = useState([]);
  const [discountRules, setDiscountRules] = useState([]);

  useEffect(() => {
    taxService.getTaxRules().then(setTaxRules);
    discountService.getDiscountRules().then(setDiscountRules);
  }, []);

  const totalVariants = products.reduce(
    (acc, p) => acc + (p.variants ? p.variants.length : 0),
    0
  );
  const activeTaxRules = taxRules.filter((r) => r.isActive !== false);
  const activeDiscountRules = discountRules.filter(
    (r) => getDiscountRuleStatus(r) === 'active'
  );

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-white rounded-xl p-6 sm:p-8 text-zinc-900 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-800">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-900" />
            Administrator Workspace
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Product, Plan & Billing Catalog
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Manage catalog products, variant pricing adjustments (e.g. Odoo brand +₹560), subscription plan rules, automated tax rules, and Billing Day runs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button
            variant="primary"
            icon={PlayCircle}
            onClick={() => onNavigate('invoices')}
          >
            Run Billing Day
          </Button>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={() => onNavigate('products')}
          >
            Manage Products
          </Button>
          <Button
            variant="secondary"
            icon={Tag}
            onClick={() => onNavigate('discounts')}
          >
            Discount Rules
          </Button>
          <Button
            variant="secondary"
            icon={CalendarDays}
            onClick={() => onNavigate('plans')}
          >
            Manage Plans
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Products KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('products')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {products.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Products in Catalog
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Base catalog items with sales & cost margins
            </p>
          </div>
        </Card>

        {/* Subscription Plans KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('plans')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center font-bold">
              <CalendarDays className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {plans.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Subscription Plans
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Recurring billing tiers with lifecycle switches
            </p>
          </div>
        </Card>

        {/* Variants KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('products')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center font-bold">
              <Tag className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {totalVariants}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Configured Variants
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Adjustable brand and tier price add-ons
            </p>
          </div>
        </Card>

        {/* Discount Rules KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('discounts')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center font-bold">
              <Tag className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {activeDiscountRules.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Active Discount Rules
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Auto-applied volume & subscription discounts
            </p>
          </div>
        </Card>

        {/* Tax Rules KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('taxes')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center font-bold">
              <Percent className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {activeTaxRules.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Active Tax Rules
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {activeTaxRules.length > 0
                ? activeTaxRules.map((r) => `${r.name} (${r.rate}%)`).join(', ')
                : 'Applied automatically on Billing Day'}
            </p>
          </div>
        </Card>
      </div>

      {/* Quick Feature Spotlight Card */}
      <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-zinc-900" />
          <h2 className="text-base font-bold text-zinc-900">
            Catalog, Plan Rules & Automated Billing Reference
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-zinc-600">
          <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 space-y-2">
            <h3 className="font-bold text-zinc-900 text-sm">Product Variants & Adjustments</h3>
            <p>
              Define configurable variants with attribute names (e.g., Brand, Tier) and custom adjustments (e.g. Odoo brand adds ₹560). Effective prices compute live: <span className="font-semibold text-zinc-800">Base + Variant = Total</span>.
            </p>
          </div>
          <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 space-y-2">
            <h3 className="font-bold text-zinc-900 text-sm">Plan Lifecycle Behaviors</h3>
            <p>
              Each subscription plan enforces 4 behavioral rules: Auto-close on expiry, Early cancellation permission, Mid-cycle pause eligibility, and Term renewal availability.
            </p>
          </div>
          <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 space-y-2">
            <h3 className="font-bold text-zinc-900 text-sm">Automated Billing Day & Taxes</h3>
            <p>
              Billing Day generates Draft invoices from due subscriptions with customer lines and Admin tax rules pre-filled, moving cleanly through <span className="font-semibold text-zinc-800">Draft → Confirmed → Paid</span> without duplicates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
