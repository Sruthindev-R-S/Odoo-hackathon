import { Package, CalendarDays, Plus, ArrowRight, Tag, ShieldCheck, Sparkles } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useProducts } from '../products/useProducts';
import { usePlans } from '../plans/usePlans';

export default function AdminDashboard({ onNavigate }) {
  const { products } = useProducts();
  const { plans } = usePlans();

  const totalVariants = products.reduce(
    (acc, p) => acc + (p.variants ? p.variants.length : 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#16233B] to-[#243555] rounded-2xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-teal-200 backdrop-blur-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            Administrator Workspace
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Product & Subscription Catalog
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Manage your service and software products, configure variant pricing adjustments (e.g. Odoo brand +₹560), and define recurring subscription plan lifecycles.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => onNavigate('products')}
            className="bg-[#0E7C86] hover:bg-[#0B656D]"
          >
            Manage Products
          </Button>
          <Button
            variant="outline"
            icon={CalendarDays}
            onClick={() => onNavigate('plans')}
            className="bg-white/10 text-white border-white/20 hover:bg-white/20"
          >
            Manage Plans
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Products KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('products')}
          className="p-6 cursor-pointer border-slate-200 hover:border-[#0E7C86]/50"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-[#E6F5F6] text-[#0E7C86] flex items-center justify-center font-bold">
              <Package className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#0E7C86]" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-[#16233B] tabular-nums">
              {products.length}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">
              Products in Catalog
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Base catalog items with sales & cost margins
            </p>
          </div>
        </Card>

        {/* Subscription Plans KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('plans')}
          className="p-6 cursor-pointer border-slate-200 hover:border-[#0E7C86]/50"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <CalendarDays className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-[#16233B] tabular-nums">
              {plans.length}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">
              Subscription Plans
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Recurring billing tiers with lifecycle switches
            </p>
          </div>
        </Card>

        {/* Variants KPI */}
        <Card
          hoverable
          onClick={() => onNavigate('products')}
          className="p-6 cursor-pointer border-slate-200 hover:border-[#0E7C86]/50"
        >
          <div className="flex items-center justify-between">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Tag className="w-6 h-6" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-[#16233B] tabular-nums">
              {totalVariants}
            </div>
            <div className="text-sm font-semibold text-slate-700 mt-0.5">
              Configured Variants
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Adjustable brand and tier price add-ons
            </p>
          </div>
        </Card>
      </div>

      {/* Quick Feature Spotlight Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#0E7C86]" />
          <h2 className="text-base font-bold text-[#16233B]">
            Catalog & Plan Rules Reference
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h3 className="font-bold text-[#16233B] text-sm">Product Variants & Price Adjustments</h3>
            <p>
              When defining products, administrators can attach configurable variants with attribute names (e.g., Brand, Tier) and custom adjustments (e.g. Odoo brand adds ₹560). Effective prices are computed live: <span className="font-semibold text-slate-800">Base + Variant = Total</span>.
            </p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h3 className="font-bold text-[#16233B] text-sm">Plan Lifecycle Behaviors</h3>
            <p>
              Each subscription plan can be configured with 4 core behavioral rules: Auto-close on expiry, Early cancellation permission, Mid-cycle pause eligibility, and Term renewal availability.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

