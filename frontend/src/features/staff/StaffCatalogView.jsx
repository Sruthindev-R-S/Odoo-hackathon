import { useState, useEffect } from 'react';
import { Package, CalendarDays, Percent, Eye } from 'lucide-react';
import { productService } from '../../api/services/productService';
import { planService } from '../../api/services/planService';
import { taxService } from '../../api/services/taxService';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import PlanBadge from '../../components/domain/PlanBadge';
import { formatDate } from '../../lib/format';

export default function StaffCatalogView() {
  const [products, setProducts] = useState([]);
  const [plans, setPlans] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('products');

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      try {
        const [prodList, planList, ruleList] = await Promise.all([
          productService.getProducts(),
          planService.getPlans(),
          taxService.getTaxRules(),
        ]);
        if (active) {
          setProducts(prodList);
          setPlans(planList);
          setTaxRules(ruleList);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              Product, Plan & Tax Catalog
            </h1>
            <Badge variant="neutral" size="sm">
              <Eye className="w-3 h-3" />
              Read-Only
            </Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Reference pricing, variant adjustments, plan rules, and automatic tax rules configured by administrators.
          </p>
        </div>

        <div className="inline-flex bg-white p-1 rounded-xl border border-zinc-200 flex-wrap">
          <button
            type="button"
            onClick={() => setSection('products')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              section === 'products'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSection('plans')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              section === 'plans'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Plans ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setSection('taxes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              section === 'taxes'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Tax Rules ({taxRules.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading catalog...
        </div>
      ) : section === 'products' ? (
        products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products in catalog"
            description="Products added by an administrator will appear here for staff reference."
          />
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Variants</th>
                    <th className="py-3 px-4 text-right">Base Sales Price</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/70">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">
                          {p.name}
                        </div>
                        {p.notes && (
                          <div className="text-xs text-zinc-500 line-clamp-1">
                            {p.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 capitalize text-xs text-zinc-600">
                        {p.type}
                      </td>
                      <td className="py-3.5 px-4">
                        {(p.variants || []).length === 0 ? (
                          <span className="text-xs text-zinc-400">
                            Standard
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {p.variants.map((v) => (
                              <span
                                key={v.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-zinc-100 text-zinc-800 border border-zinc-200"
                              >
                                {v.attribute}: <strong>{v.value}</strong>
                                {Number(v.extraPrice) > 0 && (
                                  <span className="text-orange-700 font-semibold tabular-nums">
                                    +₹{Number(v.extraPrice).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MoneyText amount={p.salesPrice} />
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={p.isActive !== false ? 'success' : 'neutral'}
                          size="sm"
                        >
                          {p.isActive !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : section === 'plans' ? (
        plans.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No subscription plans configured"
            description="Plans defined by an administrator will appear here for quotation creation."
          />
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Billing</th>
                    <th className="py-3 px-4">Min Qty</th>
                    <th className="py-3 px-4">Availability</th>
                    <th className="py-3 px-4">Allowed Rules</th>
                    <th className="py-3 px-4 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {plans.map((pl) => (
                    <tr key={pl.id} className="hover:bg-zinc-50/70">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">
                          {pl.name}
                        </div>
                        {pl.productName && (
                          <div className="text-xs text-zinc-500">
                            {pl.productName}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 capitalize text-xs text-zinc-700">
                        {pl.billingPeriod}
                      </td>
                      <td className="py-3.5 px-4 text-xs tabular-nums text-zinc-700">
                        {pl.minQuantity}
                      </td>
                      <td className="py-3.5 px-4">
                        <PlanBadge
                          availableFrom={pl.availableFrom}
                          availableTo={pl.availableTo}
                        />
                        {(pl.availableFrom || pl.availableTo) && (
                          <div className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                            {pl.availableFrom ? formatDate(pl.availableFrom) : 'Any'}{' '}
                            → {pl.availableTo ? formatDate(pl.availableTo) : 'Open'}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {pl.autoCloseOnEnd && (
                            <Badge variant="neutral" size="sm">
                              Auto-close
                            </Badge>
                          )}
                          {pl.allowEarlyClose && (
                            <Badge variant="neutral" size="sm">
                              Early close
                            </Badge>
                          )}
                          {pl.allowPause && (
                            <Badge variant="neutral" size="sm">
                              Pausable
                            </Badge>
                          )}
                          {pl.allowRenewal && (
                            <Badge variant="neutral" size="sm">
                              Renewable
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <MoneyText amount={pl.price} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : taxRules.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="No tax rules configured"
          description="Tax rules added by an administrator will appear here."
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Tax Rule</th>
                  <th className="py-3 px-4">Applies To</th>
                  <th className="py-3 px-4 text-right">Rate</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {taxRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-zinc-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900">
                        {rule.name}
                      </div>
                      {rule.description && (
                        <div className="text-xs text-zinc-500">
                          {rule.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-700">
                      {rule.scopeLabel || 'All Subscriptions & Products'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900 tabular-nums">
                      {rule.rate}%
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge
                        variant={rule.isActive !== false ? 'success' : 'neutral'}
                        size="sm"
                      >
                        {rule.isActive !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
