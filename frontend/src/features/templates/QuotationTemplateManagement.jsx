import { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Pencil,
  Trash2,
  Clock,
} from 'lucide-react';
import { quotationTemplateService } from '../../api/services/quotationTemplateService';
import { planService } from '../../api/services/planService';
import { productService } from '../../api/services/productService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { useToast } from '../../components/ui/useToast';
import { formatMoney } from '../../lib/format';

const PAYMENT_TERM_OPTIONS = [
  { value: 'Due on receipt', label: 'Due on receipt' },
  { value: 'Net 15', label: 'Net 15 Days' },
  { value: 'Net 30', label: 'Net 30 Days' },
  { value: 'Net 45', label: 'Net 45 Days' },
];

export default function QuotationTemplateManagement() {
  const { showToast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    planId: '',
    validityDays: 15,
    paymentTerms: 'Net 15',
    notes: '',
    lines: [],
  });
  const [errors, setErrors] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tmpls, planList, prodList] = await Promise.all([
        quotationTemplateService.getTemplates(),
        planService.getPlans(),
        productService.getProducts(),
      ]);
      setTemplates(tmpls);
      setPlans(planList);
      setProducts(prodList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const buildDefaultLineForPlan = (plan, allProducts) => {
    const linked =
      allProducts.find((p) => p.id === plan?.productId) || allProducts[0] || null;
    const firstVar = linked?.variants?.[0] || null;
    const extra = Number(firstVar?.extraPrice) || 0;
    const basePrice = Number(plan?.price ?? linked?.salesPrice) || 0;
    return {
      id: `tline_${Date.now()}`,
      productId: linked?.id || '',
      productName: linked?.name || plan?.productName || 'Product',
      variantId: firstVar?.id || '',
      variantLabel: firstVar ? `${firstVar.attribute}: ${firstVar.value}` : '',
      variantExtraPrice: extra,
      quantity: Math.max(1, Number(plan?.minQuantity) || 1),
      unitPrice: basePrice + extra,
      taxName: 'VAT',
      taxRate: 18,
      taxes: [{ name: 'VAT', rate: 18 }],
    };
  };

  const openCreateDrawer = () => {
    const firstPlan = plans[0] || null;
    setEditingTemplate(null);
    setFormData({
      name: '',
      planId: firstPlan?.id || '',
      validityDays: 30,
      paymentTerms: 'Net 30',
      notes: '',
      lines: firstPlan ? [buildDefaultLineForPlan(firstPlan, products)] : [],
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const openEditDrawer = (tmpl) => {
    setEditingTemplate(tmpl);
    setFormData({
      name: tmpl.name || '',
      planId: tmpl.planId || '',
      validityDays: tmpl.validityDays ?? 30,
      paymentTerms: tmpl.paymentTerms || 'Net 30',
      notes: tmpl.notes || '',
      lines: (tmpl.lines || []).map((l) => {
        const firstTax = Array.isArray(l.taxes) && l.taxes[0] ? l.taxes[0] : null;
        return {
          ...l,
          taxName: l.taxName || firstTax?.name || 'VAT',
          taxRate:
            l.taxRate !== undefined
              ? l.taxRate
              : firstTax?.rate !== undefined
              ? Number(firstTax.rate)
              : 18,
        };
      }),
    });
    setErrors({});
    setDrawerOpen(true);
  };

  const handlePlanChange = (planId) => {
    const picked = plans.find((p) => p.id === planId);
    setFormData((prev) => ({
      ...prev,
      planId,
      lines: picked ? [buildDefaultLineForPlan(picked, products)] : prev.lines,
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
          id: `tline_${Date.now()}_${prev.lines.length}`,
          productId: firstProd.id,
          productName: firstProd.name,
          variantId: firstVar?.id || '',
          variantLabel: firstVar ? `${firstVar.attribute}: ${firstVar.value}` : '',
          variantExtraPrice: extra,
          quantity: 1,
          unitPrice: (Number(firstProd.salesPrice) || 0) + extra,
          taxName: 'VAT',
          taxRate: 18,
          taxes: [{ name: 'VAT', rate: 18 }],
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
        line.variantLabel = firstVar ? `${firstVar.attribute}: ${firstVar.value}` : '';
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
      } else if (field === 'taxRate') {
        const rate = Math.max(0, Number(value) || 0);
        line.taxRate = rate;
        line.taxes =
          rate > 0 ? [{ name: line.taxName || 'VAT', rate }] : [];
      } else if (field === 'taxName') {
        line.taxName = value;
        const rate = Math.max(0, Number(line.taxRate ?? 18));
        line.taxes = rate > 0 ? [{ name: value || 'VAT', rate }] : [];
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

  const handleSave = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!formData.name.trim()) nextErrors.name = 'Template name is required.';
    if (!formData.planId) nextErrors.planId = 'Select a subscription plan.';
    if ((Number(formData.validityDays) || 0) < 1) {
      nextErrors.validityDays = 'Validity must be at least 1 day.';
    }
    if (formData.lines.length === 0) {
      nextErrors.lines = 'Add at least one product line.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const pickedPlan = plans.find((p) => p.id === formData.planId);
    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        planId: formData.planId,
        planName: pickedPlan?.name || 'Subscription Plan',
        billingPeriod: pickedPlan?.billingPeriod || 'monthly',
        validityDays: Math.max(1, Number(formData.validityDays) || 15),
        paymentTerms: formData.paymentTerms,
        notes: formData.notes.trim(),
        lines: formData.lines,
      };

      if (editingTemplate) {
        await quotationTemplateService.updateTemplate(editingTemplate.id, payload);
        showToast(`Updated template "${payload.name}".`, 'success');
      } else {
        await quotationTemplateService.createTemplate(payload);
        showToast(`Created template "${payload.name}".`, 'success');
      }
      setDrawerOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not save template.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTemplate) return;
    try {
      await quotationTemplateService.deleteTemplate(deletingTemplate.id);
      showToast(`Removed template "${deletingTemplate.name}".`, 'success');
      setDeletingTemplate(null);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not delete template.', 'error');
    }
  };

  const templateSubtotal = (lines = []) =>
    lines.reduce(
      (sum, l) => sum + (Number(l.quantity) || 1) * (Number(l.unitPrice) || 0),
      0
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Quotation Templates
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pre-configure plans, product lines, payment terms, and validity periods so sales reps can issue offers immediately.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreateDrawer}>
          New Quotation Template
        </Button>
      </div>

      {/* Templates Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading quotation templates...
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No quotation templates defined"
          description="Create a quotation template with a plan, product lines, and validity window for your sales team."
          actionLabel="New Quotation Template"
          actionIcon={Plus}
          onAction={openCreateDrawer}
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Product Lines</th>
                  <th className="py-3 px-4">Validity</th>
                  <th className="py-3 px-4">Payment Terms</th>
                  <th className="py-3 px-4 text-right">Untaxed Amount</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {templates.map((tmpl) => (
                  <tr key={tmpl.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900">{tmpl.name}</div>
                      {tmpl.notes && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {tmpl.notes}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-zinc-900">
                        {tmpl.planName}
                      </div>
                      <div className="text-xs text-zinc-500 capitalize">
                        {tmpl.billingPeriod}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600">
                      {(tmpl.lines || []).map((l) => (
                        <div key={l.id} className="truncate max-w-xs">
                          {l.quantity} × {l.productName}
                          {l.variantLabel ? ` (${l.variantLabel})` : ''}
                        </div>
                      ))}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant="neutral" size="sm">
                        <Clock className="w-3 h-3" />
                        Valid {tmpl.validityDays} days
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-700 font-medium">
                      {tmpl.paymentTerms}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <MoneyText amount={templateSubtotal(tmpl.lines)} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Pencil}
                          onClick={() => openEditDrawer(tmpl)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={() => setDeletingTemplate(tmpl)}
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

      {/* Create / Edit Template Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="max-w-2xl"
        title={
          editingTemplate
            ? 'Edit Quotation Template'
            : 'New Quotation Template'
        }
        subtitle="Configure default plan, validity days, payment terms, and product lines."
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
              {editingTemplate ? 'Save Template' : 'Create Template'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Template Name"
            placeholder="e.g. Enterprise Annual Suite Offer"
            required
            value={formData.name}
            error={errors.name}
            onChange={(e) =>
              setFormData((p) => ({ ...p, name: e.target.value }))
            }
          />

          <Select
            label="Subscription Plan"
            required
            placeholder="Select a plan"
            value={formData.planId}
            error={errors.planId}
            options={plans.map((p) => ({
              value: p.id,
              label: `${p.name} — ${formatMoney(p.price)} / ${p.billingPeriod}`,
            }))}
            onChange={(e) => handlePlanChange(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Quotation Validity (Days)"
              type="number"
              min="1"
              required
              value={formData.validityDays}
              error={errors.validityDays}
              onChange={(e) =>
                setFormData((p) => ({ ...p, validityDays: e.target.value }))
              }
            />
            <Select
              label="Default Payment Terms"
              placeholder=""
              value={formData.paymentTerms}
              options={PAYMENT_TERM_OPTIONS}
              onChange={(e) =>
                setFormData((p) => ({ ...p, paymentTerms: e.target.value }))
              }
            />
          </div>

          <Input
            label="Notes (Optional)"
            placeholder="Guidance for sales reps using this template"
            value={formData.notes}
            onChange={(e) =>
              setFormData((p) => ({ ...p, notes: e.target.value }))
            }
          />

          {/* Product Lines Editor */}
          <div className="border-t border-zinc-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-900">
                  Template Product Lines
                </div>
                <div className="text-[11px] text-zinc-500">
                  Pre-populated lines loaded when a sales rep picks this template
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

            {errors.lines && (
              <p className="text-xs text-red-600 font-medium">{errors.lines}</p>
            )}

            <div className="space-y-3">
              {formData.lines.map((line, idx) => {
                const prod = products.find((p) => p.id === line.productId);
                const prodVars = prod?.variants || [];
                const lineAmt =
                  (Number(line.quantity) || 1) * (Number(line.unitPrice) || 0);

                return (
                  <div
                    key={line.id || idx}
                    className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label={`Line ${idx + 1} · Product`}
                        placeholder=""
                        value={line.productId}
                        options={products.map((p) => ({
                          value: p.id,
                          label: p.name,
                        }))}
                        onChange={(e) =>
                          handleUpdateLine(idx, 'productId', e.target.value)
                        }
                      />

                      {prodVars.length > 0 ? (
                        <Select
                          label="Variant"
                          placeholder="Standard (No extra)"
                          value={line.variantId}
                          options={prodVars.map((v) => ({
                            value: v.id,
                            label: `${v.attribute}: ${v.value}${
                              Number(v.extraPrice) > 0
                                ? ` (+₹${v.extraPrice})`
                                : ''
                            }`,
                          }))}
                          onChange={(e) =>
                            handleUpdateLine(idx, 'variantId', e.target.value)
                          }
                        />
                      ) : (
                        <div className="text-xs text-zinc-400 self-end pb-2">
                          No variants on this product
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                      <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          handleUpdateLine(idx, 'quantity', e.target.value)
                        }
                      />
                      <Input
                        label="Unit Price"
                        type="number"
                        min="0"
                        step="0.01"
                        prefix="₹"
                        value={line.unitPrice}
                        onChange={(e) =>
                          handleUpdateLine(idx, 'unitPrice', e.target.value)
                        }
                      />
                      <Input
                        label={`Tax % (${line.taxName || 'VAT'})`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={line.taxRate ?? 18}
                        onChange={(e) =>
                          handleUpdateLine(idx, 'taxRate', e.target.value)
                        }
                      />
                      <div className="flex items-center justify-between pb-1.5">
                        <div className="text-xs">
                          <div className="text-zinc-400">Amount</div>
                          <div className="font-bold text-zinc-900 tabular-nums">
                            {formatMoney(lineAmt)}
                          </div>
                        </div>
                        {formData.lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 flex justify-between items-center text-sm font-bold text-zinc-900">
              <span>Template Untaxed Total</span>
              <span className="tabular-nums">
                {formatMoney(templateSubtotal(formData.lines))}
              </span>
            </div>
          </div>
        </form>
      </Drawer>

      {/* Delete Modal */}
      <Modal
        isOpen={Boolean(deletingTemplate)}
        onClose={() => setDeletingTemplate(null)}
        title="Remove Quotation Template"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingTemplate(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Remove Template
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Remove quotation template{' '}
          <strong className="text-zinc-900">{deletingTemplate?.name}</strong>?
          Existing quotations and subscriptions created from it will remain unaffected.
        </p>
      </Modal>
    </div>
  );
}

