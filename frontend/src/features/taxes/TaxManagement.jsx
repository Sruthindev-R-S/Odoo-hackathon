import { useState, useEffect, useCallback } from 'react';
import {
  Percent,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { taxService } from '../../api/services/taxService';
import { productService } from '../../api/services/productService';
import { PRODUCT_TYPES, BILLING_PERIODS } from '../../api/types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Switch from '../../components/ui/Switch';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/useToast';
import { formatMoney } from '../../lib/format';

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All Subscriptions & Products' },
  { value: 'product_type', label: 'Specific Product Type' },
  { value: 'billing_period', label: 'Specific Billing Cycle' },
  { value: 'product', label: 'Specific Catalog Product' },
];

export default function TaxManagement() {
  const { showToast } = useToast();

  const [rules, setRules] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingRule, setDeletingRule] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    rate: '18',
    scope: 'all',
    scopeValue: '',
    description: '',
    isActive: true,
  });
  const [errors, setErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedRules, loadedProducts] = await Promise.all([
        taxService.getTaxRules(),
        productService.getProducts(),
      ]);
      setRules(loadedRules);
      setProducts(loadedProducts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const computeScopeLabel = (scope, scopeValue) => {
    if (scope === 'all') return 'All Subscriptions & Products';
    if (scope === 'product_type') {
      const match = PRODUCT_TYPES.find((t) => t.value === scopeValue);
      return `Product Type: ${match ? match.label : scopeValue}`;
    }
    if (scope === 'billing_period') {
      const match = BILLING_PERIODS.find((b) => b.value === scopeValue);
      return `Billing Cycle: ${match ? match.label : scopeValue}`;
    }
    if (scope === 'product') {
      const match = products.find((p) => p.id === scopeValue);
      return `Product: ${match ? match.name : scopeValue}`;
    }
    return 'All Subscriptions & Products';
  };

  const openCreateDrawer = () => {
    setEditingRule(null);
    setFormData({
      name: '',
      rate: '18',
      scope: 'all',
      scopeValue: '',
      description: '',
      isActive: true,
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const openEditDrawer = (rule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name || '',
      rate: String(rule.rate ?? 0),
      scope: rule.scope || 'all',
      scopeValue: rule.scopeValue || '',
      description: rule.description || '',
      isActive: rule.isActive !== false,
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const handleScopeChange = (nextScope) => {
    let defaultVal = '';
    if (nextScope === 'product_type') {
      defaultVal = PRODUCT_TYPES[0]?.value || 'software';
    } else if (nextScope === 'billing_period') {
      defaultVal = BILLING_PERIODS[2]?.value || 'monthly';
    } else if (nextScope === 'product') {
      defaultVal = products[0]?.id || '';
    }
    setFormData((prev) => ({
      ...prev,
      scope: nextScope,
      scopeValue: defaultVal,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!formData.name.trim()) {
      nextErrors.name = 'Tax name is required (e.g. GST, IGST, Service Tax).';
    }
    const parsedRate = Number(formData.rate);
    if (formData.rate === '' || Number.isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100) {
      nextErrors.rate = 'Enter a valid percentage between 0 and 100.';
    }
    if (formData.scope !== 'all' && !formData.scopeValue) {
      nextErrors.scopeValue = 'Select a target for this rule scope.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        rate: parsedRate,
        scope: formData.scope,
        scopeValue: formData.scope === 'all' ? '' : formData.scopeValue,
        scopeLabel: computeScopeLabel(formData.scope, formData.scopeValue),
        description: formData.description.trim(),
        isActive: formData.isActive,
      };

      if (editingRule) {
        await taxService.updateTaxRule(editingRule.id, payload);
        showToast(`Updated tax rule "${payload.name}" (${payload.rate}%).`, 'success');
      } else {
        await taxService.createTaxRule(payload);
        showToast(`Added tax rule "${payload.name}" (${payload.rate}%).`, 'success');
      }
      setDrawerOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not save tax rule.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (rule) => {
    try {
      const updated = await taxService.toggleTaxRule(rule.id);
      showToast(
        `${updated.name} (${updated.rate}%) ${updated.isActive ? 'enabled' : 'disabled'}.`,
        'success'
      );
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to update rule status.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingRule) return;
    try {
      await taxService.deleteTaxRule(deletingRule.id);
      showToast(`Removed tax rule "${deletingRule.name}".`, 'success');
      setDeletingRule(null);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not remove tax rule.', 'error');
    }
  };

  const activeRules = rules.filter((r) => r.isActive !== false);
  const sampleBase = 1000;
  const previewRate = Math.max(0, Math.min(100, Number(formData.rate) || 0));
  const previewTax = Math.round(((sampleBase * previewRate) / 100) * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Tax Rules
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Define automatic tax calculation rules applied to subscription product lines on Billing Day.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreateDrawer}>
          New Tax Rule
        </Button>
      </div>

      {/* Active Tax Summary Strip */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-900 shrink-0">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-900">
              Automated Billing Day Tax Engine
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {activeRules.length === 0
                ? 'No active tax rules — generated invoices will calculate 0% tax.'
                : `Active rules applied automatically: ${activeRules
                    .map((r) => `${r.name} (${r.rate}%)`)
                    .join(', ')}`}
            </div>
          </div>
        </div>
        <Badge variant={activeRules.length > 0 ? 'loop' : 'neutral'} size="sm">
          {activeRules.length} Active {activeRules.length === 1 ? 'Rule' : 'Rules'}
        </Badge>
      </div>

      {/* Rules Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading tax rules...
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="No tax rules configured"
          description="Add a tax rule (such as 18% GST) so recurring invoices calculate taxes automatically without manual entry."
          actionLabel="Create Tax Rule"
          actionIcon={Plus}
          onAction={openCreateDrawer}
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Rule Name</th>
                  <th className="py-3 px-4">Applies To</th>
                  <th className="py-3 px-4 text-right">Tax Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {rule.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-700">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-zinc-100 border border-zinc-200 font-medium">
                        {rule.scopeLabel || computeScopeLabel(rule.scope, rule.scopeValue)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900 tabular-nums">
                      {rule.rate}%
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(rule)}
                        className="cursor-pointer bg-transparent border-0 p-0"
                        title="Click to toggle active status"
                      >
                        {rule.isActive !== false ? (
                          <Badge variant="success" size="sm">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </button>
                    </td>
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
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => setDeletingRule(rule)}
                        >
                          Remove
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

      {/* Create / Edit Tax Rule Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingRule ? 'Edit Tax Rule' : 'New Tax Rule'}
        subtitle="Invoices generated from subscriptions automatically apply matching active tax rules."
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
              {editingRule ? 'Save Changes' : 'Create Tax Rule'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Tax Name"
            placeholder="e.g. GST, IGST, SaaS Service Tax"
            required
            value={formData.name}
            error={errors.name}
            onChange={(e) => {
              setFormData((p) => ({ ...p, name: e.target.value }));
              if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
            }}
          />

          <Input
            label="Rate (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            suffix="%"
            value={formData.rate}
            error={errors.rate}
            onChange={(e) => {
              setFormData((p) => ({ ...p, rate: e.target.value }));
              if (errors.rate) setErrors((p) => ({ ...p, rate: undefined }));
            }}
          />

          <Select
            label="Rule Scope (Applies To)"
            placeholder=""
            value={formData.scope}
            options={SCOPE_OPTIONS}
            onChange={(e) => handleScopeChange(e.target.value)}
          />

          {formData.scope === 'product_type' && (
            <Select
              label="Target Product Type"
              placeholder=""
              value={formData.scopeValue}
              error={errors.scopeValue}
              options={PRODUCT_TYPES}
              onChange={(e) =>
                setFormData((p) => ({ ...p, scopeValue: e.target.value }))
              }
            />
          )}

          {formData.scope === 'billing_period' && (
            <Select
              label="Target Billing Cycle"
              placeholder=""
              value={formData.scopeValue}
              error={errors.scopeValue}
              options={BILLING_PERIODS.map((b) => ({
                value: b.value,
                label: b.label,
              }))}
              onChange={(e) =>
                setFormData((p) => ({ ...p, scopeValue: e.target.value }))
              }
            />
          )}

          {formData.scope === 'product' && (
            <Select
              label="Target Product"
              placeholder="Select a product"
              value={formData.scopeValue}
              error={errors.scopeValue}
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              onChange={(e) =>
                setFormData((p) => ({ ...p, scopeValue: e.target.value }))
              }
            />
          )}

          <Input
            label="Description (Optional)"
            placeholder="Notes shown in audit summary"
            value={formData.description}
            onChange={(e) =>
              setFormData((p) => ({ ...p, description: e.target.value }))
            }
          />

          <div className="border-t border-zinc-200 pt-2">
            <Switch
              label="Rule Active"
              description="When active, this tax is automatically calculated on matching subscription invoices."
              checked={formData.isActive}
              onChange={(val) => setFormData((p) => ({ ...p, isActive: val }))}
            />
          </div>

          {/* Live Calculation Preview */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2 text-xs">
            <div className="font-semibold text-zinc-900">
              Automatic Invoice Line Preview
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>Example Subscription Subtotal</span>
              <span className="tabular-nums font-medium">
                {formatMoney(sampleBase)}
              </span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>
                {formData.name.trim() || 'Tax'} ({previewRate}%)
              </span>
              <span className="tabular-nums font-medium">
                +{formatMoney(previewTax)}
              </span>
            </div>
            <div className="pt-2 border-t border-zinc-200 flex justify-between text-sm font-bold text-zinc-900">
              <span>Invoice Total</span>
              <span className="tabular-nums">
                {formatMoney(sampleBase + previewTax)}
              </span>
            </div>
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingRule)}
        onClose={() => setDeletingRule(null)}
        title="Remove Tax Rule"
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
          Remove tax rule{' '}
          <strong className="text-zinc-900">
            {deletingRule?.name} ({deletingRule?.rate}%)
          </strong>
          ? Existing issued invoices will retain their recorded tax totals, while future Billing Day runs will no longer apply this rule.
        </p>
      </Modal>
    </div>
  );
}
