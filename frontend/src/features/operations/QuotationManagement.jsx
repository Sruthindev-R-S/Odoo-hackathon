import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Send,
  CheckCircle2,
  ChevronRight,
  Trash2,
  Repeat,
  FileSpreadsheet,
  Save,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/authService';
import { quotationService } from '../../api/services/quotationService';
import { quotationTemplateService } from '../../api/services/quotationTemplateService';
import { planService } from '../../api/services/planService';
import { productService } from '../../api/services/productService';
import { operationsService } from '../../api/services/operationsService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatMoney } from '../../lib/format';
import CustomerPicker from './CustomerPicker';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'expired', label: 'Expired' },
];

const STATUS_VARIANTS = {
  draft: 'neutral',
  sent: 'warning',
  confirmed: 'success',
  expired: 'danger',
};

const PAYMENT_TERM_OPTIONS = [
  { value: 'Due on receipt', label: 'Due on receipt' },
  { value: 'Net 15', label: 'Net 15 Days' },
  { value: 'Net 30', label: 'Net 30 Days' },
  { value: 'Net 45', label: 'Net 45 Days' },
];

function addOneYear(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function lineTaxRate(line) {
  return Array.isArray(line.taxes)
    ? line.taxes.reduce((s, t) => s + (Number(t.rate) || 0), 0)
    : 0;
}

export default function QuotationManagement({ onConverted }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [quotations, setQuotations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [form, setForm] = useState({
    source: 'template',
    templateId: '',
    planId: '',
    validityDays: 30,
    paymentTerms: 'Net 30',
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerOrganization: '',
    lines: [],
  });

  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTerms, setEditTerms] = useState({ paymentTerms: '', validityDays: 30 });
  const [convertDates, setConvertDates] = useState({
    startDate: today,
    expiryDate: addOneYear(today),
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [quos, tmpls, planList, prodList, custList] = await Promise.all([
        quotationService.getQuotations(
          { customerId: customerFilter || undefined },
          user
        ),
        quotationTemplateService.getTemplates({}, user),
        planService.getPlans(),
        productService.getProducts(),
        authService.getCustomers(),
      ]);
      setQuotations(quos);
      setTemplates(tmpls);
      setPlans(planList.filter((p) => p.active !== false));
      setProducts(prodList);
      setCustomers(await authService.getCustomers().catch(() => custList));
    } catch (err) {
      showToast(err.message || 'Could not load quotations.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, customerFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectedTemplate = templates.find((t) => t.id === form.templateId) || null;

  const previewLines = form.source === 'template'
    ? selectedTemplate?.lines || []
    : form.lines;

  const previewTotals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    previewLines.forEach((l) => {
      const amt = (Number(l.quantity) || 1) * (Number(l.unitPrice) || 0);
      subtotal += amt;
      taxTotal += (amt * lineTaxRate(l)) / 100;
    });
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      total: Math.round((subtotal + taxTotal) * 100) / 100,
    };
  }, [previewLines]);

  const filtered = quotations.filter(
    (q) => statusFilter === 'all' || q.status === statusFilter
  );

  const buildLine = (prod) => {
    const firstVar = prod?.variants?.[0] || null;
    const extra = Number(firstVar?.extraPrice) || 0;
    return {
      id: `ql_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      productId: prod?.id || '',
      productName: prod?.name || 'Product',
      variantId: firstVar?.id || '',
      variantLabel: firstVar ? `${firstVar.attribute}: ${firstVar.value}` : '',
      quantity: 1,
      unitPrice: (Number(prod?.salesPrice) || 0) + extra,
      taxes: [{ name: 'VAT', rate: 18 }],
    };
  };

  const openCreate = () => {
    const firstTemplate = templates[0] || null;
    setForm({
      source: firstTemplate ? 'template' : 'manual',
      templateId: firstTemplate?.id || '',
      planId: plans[0]?.id || '',
      validityDays: firstTemplate?.validityDays ?? 30,
      paymentTerms: firstTemplate?.paymentTerms || 'Net 30',
      customerId: '',
      customerName: '',
      customerEmail: '',
      customerOrganization: '',
      lines: products[0] ? [buildLine(products[0])] : [],
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const updateLine = (idx, field, val) => {
    setForm((prev) => {
      const lines = [...prev.lines];
      const line = { ...lines[idx] };
      if (field === 'productId') {
        const prod = products.find((p) => p.id === val);
        Object.assign(line, buildLine(prod), { id: line.id, taxes: line.taxes });
      } else if (field === 'variantId') {
        const prod = products.find((p) => p.id === line.productId);
        const v = prod?.variants?.find((x) => x.id === val) || null;
        line.variantId = v?.id || '';
        line.variantLabel = v ? `${v.attribute}: ${v.value}` : '';
        line.unitPrice = (Number(prod?.salesPrice) || 0) + (Number(v?.extraPrice) || 0);
      } else if (field === 'quantity') {
        line.quantity = Math.max(1, Number(val) || 1);
      } else if (field === 'unitPrice') {
        line.unitPrice = Math.max(0, Number(val) || 0);
      } else if (field === 'taxRate') {
        const rate = Math.max(0, Number(val) || 0);
        line.taxes = rate > 0 ? [{ name: line.taxes?.[0]?.name || 'VAT', rate }] : [];
      }
      lines[idx] = line;
      return { ...prev, lines };
    });
  };

  const handleCreate = async () => {
    const errors = {};
    const custIdNum = Number(form.customerId);
    if (!Number.isInteger(custIdNum) || custIdNum <= 0) {
      errors.customerId = 'Select or register a customer to obtain a Customer ID.';
    }
    if (!form.customerName.trim()) errors.customerName = 'Customer name is required.';
    if (form.source === 'template' && !form.templateId) {
      errors.templateId = 'Select a quotation template.';
    }
    if (form.source === 'manual') {
      if (!form.planId) errors.planId = 'Select a subscription plan.';
      if (form.lines.length === 0) errors.lines = 'Add at least one product line.';
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const created =
        form.source === 'template'
          ? await quotationService.createQuotationFromTemplate(
              form.templateId,
              {
                customerId: custIdNum,
                customerName: form.customerName,
                paymentTerms: form.paymentTerms,
                validityDays: form.validityDays,
              },
              user
            )
          : await quotationService.createQuotation(
              {
                customerId: custIdNum,
                customerName: form.customerName,
                planId: form.planId,
                planName: plans.find((p) => p.id === form.planId)?.name,
                validityDays: form.validityDays,
                paymentTerms: form.paymentTerms,
                items: form.lines,
              },
              user
            );
      showToast(`${created.quotationNumber} created as Draft.`, 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Could not create quotation.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (q) => {
    setSelected(q);
    setEditTerms({ paymentTerms: q.paymentTerms || 'Net 30', validityDays: q.validityDays });
    setConvertDates({ startDate: today, expiryDate: addOneYear(today) });
  };

  const runAction = async (fn, successMsg) => {
    setActionLoading(true);
    try {
      const updated = await fn();
      if (updated) setSelected(updated);
      showToast(successMsg(updated), 'success');
      await loadAll();
      return updated;
    } catch (err) {
      showToast(err.message || 'Action failed.', 'error');
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!selected) return;
    if (!convertDates.startDate || !convertDates.expiryDate ||
      convertDates.expiryDate < convertDates.startDate) {
      showToast('Provide a valid start date and expiry date.', 'error');
      return;
    }
    const plan = plans.find((p) => p.id === selected.planId);
    setActionLoading(true);
    try {
      const sub = await operationsService.createSubscription(
        {
          customerId: selected.customerId,
          customerName: selected.customerName,
          planId: selected.planId,
          planName: selected.planName,
          billingPeriod: plan?.billingPeriod || 'monthly',
          quantity: selected.items[0]?.quantity || 1,
          startDate: convertDates.startDate,
          expiryDate: convertDates.expiryDate,
          paymentTerms: selected.paymentTerms,
          templateId: selected.templateId || '',
          validityDays: selected.validityDays,
          initialStatus: 'confirmed',
          lines: selected.items.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            variantId: it.variantId || '',
            variantLabel: it.variantName || '',
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            taxes: it.taxes,
          })),
          planRules: plan
            ? {
                autoCloseOnEnd: plan.autoCloseOnEnd,
                allowEarlyClose: plan.allowEarlyClose,
                allowPause: plan.allowPause,
                allowRenewal: plan.allowRenewal,
              }
            : undefined,
        },
        user
      );
      showToast(
        `${selected.quotationNumber} converted to ${sub.subscriptionNumber} (Confirmed).`,
        'success'
      );
      setSelected(null);
      if (onConverted) onConverted(sub);
    } catch (err) {
      showToast(err.message || 'Could not convert quotation.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Issue quotations from templates or manually, send them to the customer, and convert confirmed offers into subscriptions.
        </p>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          New Quotation
        </Button>
      </div>

      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.id === 'all'
                ? quotations.length
                : quotations.filter((q) => q.status === tab.id).length;
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {tab.label}{' '}
                <span className={active ? 'text-zinc-300' : 'text-zinc-400'}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <select
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          className="text-xs bg-zinc-50 border border-zinc-300 rounded-lg px-2.5 py-2 font-medium text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">All Customers</option>
          {customers.map((c) => (
            <option key={String(c.customerId ?? c.id)} value={String(c.customerId ?? c.id)}>
              #{c.customerId ?? c.id} · {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading quotations...
        </div>
      ) : quotations.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No quotations yet"
          description="Create a quotation from a template or build one manually for a registered customer."
          actionLabel="New Quotation"
          actionIcon={Plus}
          onAction={openCreate}
        />
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Number</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Plan & Lines</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4">Payment Terms</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filtered.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => openDetail(q)}
                    className="hover:bg-zinc-50/70 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-900">
                      {q.quotationNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-zinc-900">{q.customerName}</div>
                      <div className="text-xs text-zinc-500">Customer #{q.customerId}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-zinc-900">{q.planName}</div>
                      <div className="text-xs text-zinc-500">
                        {q.items.length} {q.items.length === 1 ? 'line' : 'lines'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                      {formatDate(q.expiryDate)}
                      <div className="text-zinc-400">{q.validityDays}-day validity</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-zinc-700">
                      {q.paymentTerms}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={STATUS_VARIANTS[q.status] || 'neutral'} size="sm">
                        {q.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <MoneyText amount={q.total} />
                      <div className="text-[11px] text-zinc-400">
                        incl. {formatMoney(q.taxTotal)} tax
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700">
                        Open <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Quotation Drawer */}
      <Drawer
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        width="max-w-3xl"
        title="New Quotation"
        subtitle="Start from a quotation template or build the offer manually."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={handleCreate}>
              Create Quotation
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex gap-2">
            {[
              { id: 'template', label: 'From Quotation Template' },
              { id: 'manual', label: 'Manual Quotation' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, source: opt.id }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.source === opt.id
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <CustomerPicker
            value={form}
            customers={customers}
            errors={formErrors}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            onCustomerRegistered={async () =>
              setCustomers(await authService.getCustomers())
            }
          />

          <div className="border-t border-zinc-200 pt-4 space-y-4">
            {form.source === 'template' ? (
              <Select
                label="Quotation Template"
                required
                placeholder="Select a template"
                value={form.templateId}
                error={formErrors.templateId}
                options={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name} — ${t.planName} (Valid ${t.validityDays} days)`,
                }))}
                onChange={(e) => {
                  const t = templates.find((x) => x.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    templateId: e.target.value,
                    validityDays: t?.validityDays ?? f.validityDays,
                    paymentTerms: t?.paymentTerms || f.paymentTerms,
                  }));
                }}
              />
            ) : (
              <Select
                label="Subscription Plan"
                required
                placeholder="Select a plan"
                value={form.planId}
                error={formErrors.planId}
                options={plans.map((p) => ({
                  value: p.id,
                  label: `${p.name} — ${formatMoney(p.price)} / ${p.billingPeriod}`,
                }))}
                onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Validity (Days)"
                type="number"
                min="0"
                value={form.validityDays}
                onChange={(e) => setForm((f) => ({ ...f, validityDays: e.target.value }))}
              />
              <Select
                label="Payment Terms"
                placeholder=""
                value={form.paymentTerms}
                options={PAYMENT_TERM_OPTIONS}
                onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
              />
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-900">
                {form.source === 'template' ? 'Lines copied from template' : 'Product Lines'}
              </div>
              {form.source === 'manual' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  disabled={products.length === 0}
                  onClick={() =>
                    setForm((f) => ({ ...f, lines: [...f.lines, buildLine(products[0])] }))
                  }
                >
                  Add Line
                </Button>
              )}
            </div>
            {formErrors.lines && (
              <p className="text-xs font-medium text-red-600">{formErrors.lines}</p>
            )}

            <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-2 w-20">Qty</th>
                    <th className="py-2.5 px-2 w-28">Unit Price</th>
                    <th className="py-2.5 px-2 w-20">Tax %</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    {form.source === 'manual' && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {previewLines.map((line, idx) => {
                    const amt = (Number(line.quantity) || 1) * (Number(line.unitPrice) || 0);
                    if (form.source === 'template') {
                      return (
                        <tr key={line.id || idx}>
                          <td className="py-2.5 px-3 font-medium text-zinc-900">
                            {line.productName}
                            {line.variantLabel ? ` (${line.variantLabel})` : ''}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums">{line.quantity}</td>
                          <td className="py-2.5 px-2 tabular-nums">{formatMoney(line.unitPrice)}</td>
                          <td className="py-2.5 px-2 tabular-nums">{lineTaxRate(line)}%</td>
                          <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                            {formatMoney(amt)}
                          </td>
                        </tr>
                      );
                    }
                    const prod = products.find((p) => p.id === line.productId);
                    return (
                      <tr key={line.id || idx} className="align-top">
                        <td className="py-2.5 px-3 space-y-1.5 min-w-48">
                          <select
                            value={line.productId}
                            onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-zinc-300 bg-white text-xs"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          {(prod?.variants || []).length > 0 && (
                            <select
                              value={line.variantId}
                              onChange={(e) => updateLine(idx, 'variantId', e.target.value)}
                              className="w-full px-2 py-1 rounded-lg border border-zinc-200 bg-zinc-50 text-[11px]"
                            >
                              <option value="">Standard (Base price)</option>
                              {prod.variants.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.attribute}: {v.value}
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
                            onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-zinc-300 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-zinc-300 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={lineTaxRate(line)}
                            onChange={(e) => updateLine(idx, 'taxRate', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-zinc-300 text-xs tabular-nums"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">
                          {formatMoney(amt)}
                        </td>
                        <td className="py-2.5 px-1">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                lines: f.lines.filter((_, i) => i !== idx),
                              }))
                            }
                            className="p-1 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"
                            title="Remove line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-600">
                <span>Untaxed Amount</span>
                <span className="tabular-nums font-medium text-zinc-900">
                  {formatMoney(previewTotals.subtotal)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-600">
                <span>Taxes</span>
                <span className="tabular-nums font-medium text-zinc-900">
                  {formatMoney(previewTotals.taxTotal)}
                </span>
              </div>
              <div className="border-t border-zinc-200 pt-2 flex justify-between text-sm font-bold text-zinc-900">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(previewTotals.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </Drawer>

      {/* Quotation Detail Drawer */}
      <Drawer
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        width="max-w-2xl"
        title={selected ? `${selected.quotationNumber} · ${selected.customerName}` : 'Quotation'}
        subtitle={selected ? `${selected.planName} · ${selected.paymentTerms}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Badge variant={STATUS_VARIANTS[selected.status] || 'neutral'}>
                {selected.status}
              </Badge>
              <div className="flex gap-2">
                {selected.status === 'draft' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Send}
                    loading={actionLoading}
                    onClick={() =>
                      runAction(
                        () => quotationService.sendQuotation(selected.id, user),
                        (q) => `${q.quotationNumber} sent to customer.`
                      )
                    }
                  >
                    Send Quotation
                  </Button>
                )}
                {(selected.status === 'draft' || selected.status === 'sent') && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckCircle2}
                    loading={actionLoading}
                    onClick={() =>
                      runAction(
                        () => quotationService.confirmQuotation(selected.id, user),
                        (q) => `${q.quotationNumber} confirmed.`
                      )
                    }
                  >
                    Confirm Quotation
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-white border border-zinc-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-zinc-400">Customer</div>
                <div className="font-semibold text-zinc-900 mt-0.5">{selected.customerName}</div>
                <div className="text-zinc-500">#{selected.customerId}</div>
              </div>
              <div>
                <div className="text-zinc-400">Quoted</div>
                <div className="font-medium text-zinc-900 mt-0.5">{formatDate(selected.quotedAt)}</div>
              </div>
              <div>
                <div className="text-zinc-400">Expires</div>
                <div className="font-medium text-zinc-900 mt-0.5">{formatDate(selected.expiryDate)}</div>
                <div className="text-zinc-500">{selected.validityDays}-day validity</div>
              </div>
            </div>

            {selected.status === 'draft' && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-zinc-900">Edit Draft Terms</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    label="Payment Terms"
                    placeholder=""
                    value={editTerms.paymentTerms}
                    options={PAYMENT_TERM_OPTIONS}
                    onChange={(e) =>
                      setEditTerms((t) => ({ ...t, paymentTerms: e.target.value }))
                    }
                  />
                  <Input
                    label="Validity (Days)"
                    type="number"
                    min="0"
                    value={editTerms.validityDays}
                    onChange={(e) =>
                      setEditTerms((t) => ({ ...t, validityDays: e.target.value }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Save}
                    loading={actionLoading}
                    onClick={() =>
                      runAction(
                        () => quotationService.updateQuotation(selected.id, editTerms, user),
                        (q) => `${q.quotationNumber} updated.`
                      )
                    }
                  >
                    Save Terms
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Taxes</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {selected.items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-900">{it.productName}</div>
                        {it.variantName && (
                          <div className="text-[11px] text-zinc-500">{it.variantName}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">{it.quantity}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{formatMoney(it.unitPrice)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {formatMoney(it.taxAmount)}
                        <div className="text-[10px] text-zinc-400">{lineTaxRate(it)}%</div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums">
                        {formatMoney(it.lineAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-zinc-200 bg-zinc-50/70 px-4 py-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-600">
                  <span>Untaxed Amount</span>
                  <span className="tabular-nums font-medium text-zinc-900">{formatMoney(selected.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Taxes</span>
                  <span className="tabular-nums font-medium text-zinc-900">{formatMoney(selected.taxTotal)}</span>
                </div>
                <div className="border-t border-zinc-200 pt-2 flex justify-between text-sm font-bold text-zinc-900">
                  <span>Total</span>
                  <span className="tabular-nums">{formatMoney(selected.total)}</span>
                </div>
              </div>
            </div>

            {selected.status === 'confirmed' && (
              <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-zinc-900">Convert to Subscription</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Start Date"
                    type="date"
                    value={convertDates.startDate}
                    onChange={(e) =>
                      setConvertDates((d) => ({ ...d, startDate: e.target.value }))
                    }
                  />
                  <Input
                    label="Expiry Date"
                    type="date"
                    value={convertDates.expiryDate}
                    onChange={(e) =>
                      setConvertDates((d) => ({ ...d, expiryDate: e.target.value }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Repeat}
                    loading={actionLoading}
                    onClick={handleConvert}
                  >
                    Create Subscription
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
