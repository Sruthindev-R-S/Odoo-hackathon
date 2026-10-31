import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  discountService,
  getDiscountRuleStatus,
} from '../../api/services/discountService';
import { productService } from '../../api/services/productService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatMoney } from '../../lib/format';

export default function DiscountManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage',
    value: '10',
    appliesTo: 'subscription',
    productId: '',
    minQuantity: '1',
    minPurchase: '0',
    startDate: today,
    endDate: '',
    usageLimit: '',
  });
  const [errors, setErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleList, prodList] = await Promise.all([
        discountService.getDiscountRules(),
        productService.getProducts(),
      ]);
      setRules(ruleList);
      setProducts(prodList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreateDrawer = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      type: 'percentage',
      value: '10',
      appliesTo: 'subscription',
      productId: products[0]?.id || '',
      minQuantity: '5',
      minPurchase: '0',
      startDate: today,
      endDate: '',
      usageLimit: '',
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const openEditDrawer = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || '',
      type: rule.type || 'percentage',
      value: String(rule.value ?? ''),
      appliesTo: rule.appliesTo || 'subscription',
      productId: rule.productId || products[0]?.id || '',
      minQuantity: String(rule.minQuantity ?? 0),
      minPurchase: String(rule.minPurchase ?? 0),
      startDate: rule.startDate || '',
      endDate: rule.endDate || '',
      usageLimit:
        rule.usageLimit !== null &&
        rule.usageLimit !== undefined &&
        Number(rule.usageLimit) > 0
          ? String(rule.usageLimit)
          : '',
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!formData.name.trim()) {
      nextErrors.name = 'Discount rule name is required.';
    }
    const val = Number(formData.value);
    if (Number.isNaN(val) || val <= 0) {
      nextErrors.value = 'Enter a discount greater than zero.';
    } else if (formData.type === 'percentage' && val > 100) {
      nextErrors.value = 'Percentage cannot exceed 100%.';
    }
    if (formData.appliesTo === 'product' && !formData.productId) {
      nextErrors.productId = 'Select a target product.';
    }
    if (
      formData.startDate &&
      formData.endDate &&
      formData.endDate < formData.startDate
    ) {
      nextErrors.endDate = 'End date cannot be earlier than start date.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const pickedProd = products.find((p) => p.id === formData.productId);
    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      value: val,
      appliesTo: formData.appliesTo,
      productId: formData.appliesTo === 'product' ? formData.productId : '',
      productName:
        formData.appliesTo === 'product'
          ? pickedProd?.name || 'Specific Product'
          : 'Whole Subscription',
      minQuantity: Math.max(0, Number(formData.minQuantity) || 0),
      minPurchase: Math.max(0, Number(formData.minPurchase) || 0),
      startDate: formData.startDate || '',
      endDate: formData.endDate || '',
      usageLimit:
        formData.usageLimit !== '' && Number(formData.usageLimit) > 0
          ? Math.floor(Number(formData.usageLimit))
          : null,
    };

    setSaving(true);
    try {
      if (editingRule) {
        await discountService.updateDiscountRule(editingRule.id, payload, user);
        showToast(`Updated discount rule "${payload.name}".`, 'success');
      } else {
        await discountService.createDiscountRule(payload, user);
        showToast(`Created discount rule "${payload.name}".`, 'success');
      }
      setDrawerOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not save discount rule.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      const updated = await discountService.toggleDiscountRule(rule.id, user);
      showToast(
        `${updated.name} ${updated.isActive ? 'enabled' : 'disabled'}.`,
        'info'
      );
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not update discount rule.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    try {
      await discountService.deleteDiscountRule(deletingRule.id, user);
      showToast(`Removed discount rule "${deletingRule.name}".`, 'success');
      setDeletingRule(null);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not delete discount rule.', 'error');
    }
  };

  const renderStatusBadge = (rule) => {
    const status = getDiscountRuleStatus(rule, today);
    if (status === 'active') {
      return (
        <Badge variant="success" size="sm">
          Active
        </Badge>
      );
    }
    if (status === 'scheduled') {
      return (
        <Badge variant="neutral" size="sm">
          Scheduled
        </Badge>
      );
    }
    if (status === 'expired') {
      return (
        <Badge variant="neutral" size="sm">
          Expired
        </Badge>
      );
    }
    if (status === 'exhausted') {
      return (
        <Badge variant="neutral" size="sm">
          Limit Reached
        </Badge>
      );
    }
    return (
      <Badge variant="neutral" size="sm">
        Disabled
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Discount Rules
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Configure percentage or fixed discounts with seat/purchase thresholds, validity dates, and usage limits. Applied automatically on invoices until expired or exhausted.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreateDrawer}>
          New Discount Rule
        </Button>
      </div>

      {/* Rules Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading discount rules...
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No discount rules configured"
          description="Create percentage or fixed discount rules for multi-seat orders, specific products, or whole subscriptions."
          actionLabel="New Discount Rule"
          actionIcon={Plus}
          onAction={openCreateDrawer}
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Discount Rule</th>
                  <th className="py-3 px-4">Benefit</th>
                  <th className="py-3 px-4">Applies To</th>
                  <th className="py-3 px-4">Minimums</th>
                  <th className="py-3 px-4">Valid Dates</th>
                  <th className="py-3 px-4">Usage</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-zinc-900">
                      {rule.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-zinc-900 tabular-nums">
                      {rule.type === 'percentage'
                        ? `${rule.value}% Off`
                        : `${formatMoney(rule.value)} Off`}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-700">
                      {rule.appliesTo === 'product' ? (
                        <span>
                          Product: <strong className="text-zinc-900">{rule.productName}</strong>
                        </span>
                      ) : (
                        'Whole Subscription'
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                      <div>
                        {Number(rule.minQuantity) > 0
                          ? `Min ${rule.minQuantity} seats/qty`
                          : 'Any qty'}
                      </div>
                      {Number(rule.minPurchase) > 0 && (
                        <div className="text-zinc-500">
                          Min {formatMoney(rule.minPurchase)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                      {rule.startDate || rule.endDate ? (
                        <>
                          {rule.startDate ? formatDate(rule.startDate) : 'Any'}{' '}
                          → {rule.endDate ? formatDate(rule.endDate) : 'No end'}
                        </>
                      ) : (
                        'Always valid'
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-zinc-800 tabular-nums">
                      {Number(rule.usedCount) || 0} /{' '}
                      {rule.usageLimit ? rule.usageLimit : '∞'}
                    </td>
                    <td className="py-3.5 px-4">{renderStatusBadge(rule)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Pencil}
                          onClick={() => openEditDrawer(rule)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Power}
                          onClick={() => handleToggle(rule)}
                        >
                          {rule.isActive !== false ? 'Disable' : 'Enable'}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setDeletingRule(rule)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete discount rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Discount Rule Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingRule ? 'Edit Discount Rule' : 'New Discount Rule'}
        subtitle="Administrator-only rule applied automatically on matching subscriptions and invoices."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Rule Name"
            required
            placeholder="e.g. Multi-Seat Expansion 15% Off"
            value={formData.name}
            error={errors.name}
            onChange={(e) =>
              setFormData((p) => ({ ...p, name: e.target.value }))
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Select
              label="Discount Type"
              placeholder=""
              value={formData.type}
              options={[
                { value: 'percentage', label: 'Percentage (%)' },
                { value: 'fixed', label: 'Fixed Amount (₹)' },
              ]}
              onChange={(e) =>
                setFormData((p) => ({ ...p, type: e.target.value }))
              }
            />
            <Input
              label={
                formData.type === 'percentage'
                  ? 'Percentage (%)'
                  : 'Fixed Amount (₹)'
              }
              type="number"
              min="0.01"
              max={formData.type === 'percentage' ? '100' : undefined}
              step="0.01"
              required
              prefix={formData.type === 'fixed' ? '₹' : undefined}
              value={formData.value}
              error={errors.value}
              onChange={(e) =>
                setFormData((p) => ({ ...p, value: e.target.value }))
              }
            />
          </div>

          <div className="border-t border-zinc-200 pt-4 space-y-3.5">
            <Select
              label="Applies To"
              placeholder=""
              value={formData.appliesTo}
              options={[
                { value: 'subscription', label: 'Whole Subscription' },
                { value: 'product', label: 'Specific Product' },
              ]}
              onChange={(e) =>
                setFormData((p) => ({ ...p, appliesTo: e.target.value }))
              }
            />

            {formData.appliesTo === 'product' && (
              <Select
                label="Target Product"
                required
                placeholder="Select product"
                value={formData.productId}
                error={errors.productId}
                options={products.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, productId: e.target.value }))
                }
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Minimum Quantity / Seats"
                type="number"
                min="0"
                value={formData.minQuantity}
                hint="e.g. 10 seats for volume pricing"
                onChange={(e) =>
                  setFormData((p) => ({ ...p, minQuantity: e.target.value }))
                }
              />
              <Input
                label="Minimum Purchase (₹)"
                type="number"
                min="0"
                step="0.01"
                prefix="₹"
                value={formData.minPurchase}
                hint="0 for no purchase minimum"
                onChange={(e) =>
                  setFormData((p) => ({ ...p, minPurchase: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Start Date"
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, startDate: e.target.value }))
                }
              />
              <Input
                label="End Date"
                type="date"
                value={formData.endDate}
                error={errors.endDate}
                hint="Stops automatically after end date"
                onChange={(e) =>
                  setFormData((p) => ({ ...p, endDate: e.target.value }))
                }
              />
            </div>

            <Input
              label="Usage Limit (Max Invoices)"
              type="number"
              min="1"
              placeholder="Leave blank for unlimited uses"
              value={formData.usageLimit}
              hint="Stops automatically once used this many times"
              onChange={(e) =>
                setFormData((p) => ({ ...p, usageLimit: e.target.value }))
              }
            />
          </div>
        </form>
      </Drawer>

      {/* Delete Modal */}
      <Modal
        isOpen={Boolean(deletingRule)}
        onClose={() => setDeletingRule(null)}
        title="Remove Discount Rule"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeletingRule(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Remove Rule
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Remove discount rule{' '}
          <strong className="text-zinc-900">{deletingRule?.name}</strong>? Future
          invoices will no longer receive this discount.
        </p>
      </Modal>
    </div>
  );
}
