import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  PlayCircle,
  Search,
  CreditCard,
  Printer,
  CheckCircle2,
  XCircle,
  Send,
  SlidersHorizontal,
  MailCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operationsService } from '../../api/services/operationsService';
import { taxService } from '../../api/services/taxService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { InvoiceStatusStepper } from '../../components/domain/StatusStepper';
import { InvoiceStatusBadge } from '../../components/domain/SubscriptionStatusBadge';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatMoney } from '../../lib/format';

export default function InvoiceManagement({ onConfigureTaxes }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState([]);
  const [billingRuns, setBillingRuns] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [eligibleSubsCount, setEligibleSubsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [confirmBillingOpen, setConfirmBillingOpen] = useState(false);
  const [billingDate, setBillingDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [runningBilling, setRunningBilling] = useState(false);
  const [confirmingBatch, setConfirmingBatch] = useState(false);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentModalInv, setPaymentModalInv] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [actionBusyId, setActionBusyId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'Bank Transfer',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invList, runList, rulesList, subsList] = await Promise.all([
        operationsService.getInvoices(user),
        operationsService.getBillingRuns(),
        taxService.getTaxRules(),
        operationsService.getSubscriptions(user),
      ]);
      setInvoices(invList);
      setBillingRuns(runList);
      setTaxRules(rulesList);
      setEligibleSubsCount(
        subsList.filter((s) => s.status === 'active' && !s.isPaused).length
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const today = new Date().toISOString().slice(0, 10);

  const isInvOverdue = (inv) =>
    inv.status === 'confirmed' &&
    inv.amountDue > 0 &&
    inv.dueDate &&
    inv.dueDate < today;

  const draftCount = invoices.filter((i) => i.status === 'draft').length;
  const activeTaxRules = taxRules.filter((r) => r.isActive !== false);

  const tabs = [
    { id: 'all', label: 'All', count: invoices.length },
    {
      id: 'draft',
      label: 'Draft',
      count: draftCount,
    },
    {
      id: 'confirmed',
      label: 'Confirmed',
      count: invoices.filter((i) => i.status === 'confirmed' && i.amountDue > 0)
        .length,
    },
    {
      id: 'paid',
      label: 'Paid',
      count: invoices.filter((i) => i.status === 'paid').length,
    },
    {
      id: 'overdue',
      label: 'Overdue',
      count: invoices.filter(isInvOverdue).length,
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      count: invoices.filter((i) => i.status === 'cancelled').length,
    },
  ];

  const filteredInvoices = invoices.filter((inv) => {
    if (tab === 'draft' && inv.status !== 'draft') return false;
    if (
      tab === 'confirmed' &&
      !(inv.status === 'confirmed' && inv.amountDue > 0)
    )
      return false;
    if (tab === 'paid' && inv.status !== 'paid') return false;
    if (tab === 'overdue' && !isInvOverdue(inv)) return false;
    if (tab === 'cancelled' && inv.status !== 'cancelled') return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.customerEmail?.toLowerCase().includes(q) ||
      inv.subscriptionNumber?.toLowerCase().includes(q) ||
      inv.planName?.toLowerCase().includes(q)
    );
  });

  const handleRunBilling = async () => {
    setRunningBilling(true);
    try {
      const summary = await operationsService.runBilling(user, { billingDate });
      setConfirmBillingOpen(false);
      showToast(
        `Billing Day complete: Created ${summary.createdCount} Draft invoice${
          summary.createdCount === 1 ? '' : 's'
        }${
          summary.discountedCount > 0
            ? ` (${summary.discountedCount} discounted automatically)`
            : ''
        } · Skipped ${summary.skippedCount} (already billed)${
          summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : ''
        }.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Billing run failed.', 'error');
    } finally {
      setRunningBilling(false);
    }
  };

  const handleConfirmAllDrafts = async () => {
    setConfirmingBatch(true);
    try {
      const { confirmedCount } = await operationsService.confirmAllDraftInvoices();
      showToast(
        `Confirmed ${confirmedCount} Draft invoice${
          confirmedCount === 1 ? '' : 's'
        }.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Could not confirm draft invoices.', 'error');
    } finally {
      setConfirmingBatch(false);
    }
  };

  const handleStatusChange = async (inv, nextStatus) => {
    setActionBusyId(inv.id);
    try {
      const updated = await operationsService.updateInvoiceStatus(
        inv.id,
        nextStatus
      );
      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(updated);
      }
      showToast(
        `Invoice ${updated.invoiceNumber} ${
          nextStatus === 'confirmed'
            ? 'moved from Draft to Confirmed'
            : 'cancelled'
        }.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Could not update invoice.', 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSendInvoice = async (inv) => {
    setActionBusyId(inv.id);
    try {
      const updated = await operationsService.sendInvoice(inv.id, user);
      if (selectedInvoice?.id === inv.id) {
        setSelectedInvoice(updated);
      }
      showToast(
        `Invoice ${updated.invoiceNumber} sent to ${updated.sentTo}.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Could not send invoice.', 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  const handlePrintInvoice = (inv) => {
    setSelectedInvoice(inv);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const openPaymentModal = (inv) => {
    setPaymentForm({
      amount: String(inv.amountDue),
      method: 'Bank Transfer',
      date: today,
      note: '',
    });
    setPaymentModalInv(inv);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalInv) return;

    setPaymentLoading(true);
    try {
      const updated = await operationsService.recordPayment(
        paymentModalInv.id,
        paymentForm,
        user
      );
      showToast(
        `Payment recorded — ${updated.invoiceNumber} is now ${
          updated.status === 'paid' ? 'Paid' : 'partially settled'
        }.`,
        'success'
      );
      setPaymentModalInv(null);
      if (selectedInvoice?.id === updated.id) {
        setSelectedInvoice(updated);
      }
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to record payment.', 'error');
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Billing Day & Invoices
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Generate cycle invoices automatically from subscriptions with pre-filled lines and taxes, then move each from Draft to Confirmed to Paid.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {draftCount > 0 && (
            <Button
              variant="secondary"
              icon={CheckCircle2}
              loading={confirmingBatch}
              onClick={handleConfirmAllDrafts}
            >
              Confirm All Drafts ({draftCount})
            </Button>
          )}
          <Button
            variant="primary"
            icon={PlayCircle}
            onClick={() => setConfirmBillingOpen(true)}
          >
            Run Billing Day
          </Button>
        </div>
      </div>

      {/* Automatic Tax Rules & Duplicate Guard Status Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs print:hidden">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Admin Tax Rules:
          </span>
          {activeTaxRules.length === 0 ? (
            <span className="text-zinc-500">0% (No active tax rules)</span>
          ) : (
            activeTaxRules.map((rule) => (
              <Badge key={rule.id} variant="neutral" size="sm">
                {rule.name} · {rule.rate}%
              </Badge>
            ))
          )}
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-600">
            Active due subscriptions: <strong className="text-zinc-900">{eligibleSubsCount}</strong>
          </span>
        </div>

        {onConfigureTaxes && (
          <button
            type="button"
            onClick={onConfigureTaxes}
            className="text-xs font-semibold text-zinc-900 hover:underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer self-start sm:self-auto"
          >
            Manage Tax Rules →
          </button>
        )}
      </div>

      {/* Latest Billing Run Summary (if run at least once) */}
      {billingRuns.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs print:hidden">
          <div className="text-zinc-600">
            Latest Billing Day run by{' '}
            <strong className="text-zinc-900">{billingRuns[0].actor}</strong> on{' '}
            {formatDate(billingRuns[0].timestamp)}
          </div>
          <div className="flex items-center gap-3 font-medium flex-wrap">
            <span className="text-zinc-900">
              Created (Draft): <strong>{billingRuns[0].createdCount}</strong>
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600">
              Skipped (already billed):{' '}
              <strong>{billingRuns[0].skippedCount}</strong>
            </span>
            {billingRuns[0].pausedCount > 0 && (
              <>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">
                  Paused skipped: <strong>{billingRuns[0].pausedCount}</strong>
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {t.label}{' '}
                <span
                  className={`ml-1 tabular-nums ${
                    active ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  {t.count}
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
            placeholder="Search invoice #, customer, plan..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
          />
        </div>
      </div>

      {/* Table / Empty */}
      <div className="print:hidden">
        {loading ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
            Loading invoices...
          </div>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices generated yet"
            description="Run Billing Day to automatically create Draft invoices from all active subscriptions with customer details, product lines, taxes, and totals pre-filled."
            actionLabel="Run Billing Day"
            actionIcon={PlayCircle}
            onAction={() => setConfirmBillingOpen(true)}
          />
        ) : filteredInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
            <p className="text-sm font-medium text-zinc-600">
              No invoices match the selected filter.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-zinc-900 underline underline-offset-4"
              onClick={() => {
                setTab('all');
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
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Subscription</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Tax</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Due</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 text-sm">
                  {filteredInvoices.map((inv) => {
                    const busy = actionBusyId === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        className="hover:bg-zinc-50/70 transition-colors"
                      >
                        <td
                          onClick={() => setSelectedInvoice(inv)}
                          className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-900 cursor-pointer underline-offset-2 hover:underline"
                        >
                          <div>{inv.invoiceNumber}</div>
                          {inv.sentAt && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-sans font-medium text-zinc-500 mt-0.5">
                              <MailCheck className="w-3 h-3 text-zinc-700" />
                              Sent
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-900">
                            {inv.customerName}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {inv.customerEmail}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-zinc-600">
                          <span className="font-mono font-medium text-zinc-800">
                            {inv.subscriptionNumber}
                          </span>{' '}
                          · {inv.planName}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-zinc-600 tabular-nums">
                          {formatDate(inv.dueDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <InvoiceStatusBadge
                            status={inv.status}
                            dueDate={inv.dueDate}
                            amountDue={inv.amountDue}
                          />
                        </td>
                        <td className="py-3.5 px-4 text-right text-xs text-zinc-600 tabular-nums">
                          {formatMoney(inv.taxAmount || 0)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <MoneyText amount={inv.total} />
                          {inv.discountAmount > 0 && (
                            <div className="text-[11px] font-medium text-emerald-700">
                              -{formatMoney(inv.discountAmount)} discount
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <MoneyText amount={inv.amountDue} />
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                            {inv.status === 'draft' && (
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  handleStatusChange(inv, 'confirmed')
                                }
                              >
                                Confirm
                              </Button>
                            )}
                            {inv.status === 'confirmed' && inv.amountDue > 0 && (
                              <Button
                                variant="primary"
                                size="sm"
                                icon={CreditCard}
                                disabled={busy}
                                onClick={() => openPaymentModal(inv)}
                              >
                                Pay
                              </Button>
                            )}
                            {inv.status !== 'cancelled' && (
                              <Button
                                variant="outline"
                                size="sm"
                                icon={Send}
                                disabled={busy}
                                onClick={() => handleSendInvoice(inv)}
                                title="Send invoice to customer"
                              >
                                Send
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Printer}
                              onClick={() => handlePrintInvoice(inv)}
                              title="Print invoice"
                            >
                              Print
                            </Button>
                            {(inv.status === 'draft' ||
                              (inv.status === 'confirmed' &&
                                inv.amountPaid === 0)) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  handleStatusChange(inv, 'cancelled')
                                }
                                title="Cancel unpaid invoice"
                              >
                                Cancel
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedInvoice(inv)}
                            >
                              Details
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Run Billing Day Confirmation Modal */}
      <Modal
        isOpen={confirmBillingOpen}
        onClose={() => setConfirmBillingOpen(false)}
        title="Run Billing Day"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmBillingOpen(false)}
              disabled={runningBilling}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={runningBilling}
              onClick={handleRunBilling}
            >
              Generate Cycle Invoices
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-sm text-zinc-600 leading-relaxed">
          <p>
            Automatically create <strong>Draft</strong> invoices for all active, unpaused subscriptions due in the current cycle?
          </p>
          <Input
            label="Billing Date"
            type="date"
            required
            value={billingDate}
            hint="Evaluates automatic discount validity dates, usage limits, and tax rules on this billing date."
            onChange={(e) => setBillingDate(e.target.value)}
          />
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-zinc-500">Eligible Active Subscriptions</span>
              <span className="font-semibold text-zinc-900 tabular-nums">
                {eligibleSubsCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Automatic Tax Rules Applied</span>
              <span className="font-semibold text-zinc-900">
                {activeTaxRules.length > 0
                  ? activeTaxRules.map((r) => `${r.name} (${r.rate}%)`).join(', ')
                  : '0% (No active tax rules)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Duplicate & Skip Guard</span>
              <span className="font-semibold text-zinc-900">
                Cycle-key deduplication active
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal (Confirmed -> Paid) */}
      <Modal
        isOpen={Boolean(paymentModalInv)}
        onClose={() => setPaymentModalInv(null)}
        title={
          paymentModalInv
            ? `Record Payment · ${paymentModalInv.invoiceNumber}`
            : 'Record Payment'
        }
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setPaymentModalInv(null)}
              disabled={paymentLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={paymentLoading}
              onClick={handleRecordPayment}
            >
              Confirm Payment
            </Button>
          </>
        }
      >
        {paymentModalInv && (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex justify-between text-xs">
              <span className="text-zinc-600">
                Customer: <strong>{paymentModalInv.customerName}</strong>
              </span>
              <span className="text-zinc-900 font-semibold tabular-nums">
                Balance due: {formatMoney(paymentModalInv.amountDue)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Payment Amount"
                type="number"
                step="0.01"
                min="0.01"
                max={paymentModalInv.amountDue}
                required
                prefix="₹"
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm((p) => ({ ...p, amount: e.target.value }))
                }
              />
              <Select
                label="Payment Method"
                placeholder=""
                value={paymentForm.method}
                options={[
                  { value: 'Bank Transfer', label: 'Bank Transfer / NEFT' },
                  { value: 'UPI', label: 'UPI' },
                  { value: 'Card', label: 'Corporate Card' },
                ]}
                onChange={(e) =>
                  setPaymentForm((p) => ({ ...p, method: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Input
                label="Payment Date"
                type="date"
                required
                value={paymentForm.date}
                onChange={(e) =>
                  setPaymentForm((p) => ({ ...p, date: e.target.value }))
                }
              />
              <Input
                label="Reference / Note"
                placeholder="UTR or transaction ID"
                value={paymentForm.note}
                onChange={(e) =>
                  setPaymentForm((p) => ({ ...p, note: e.target.value }))
                }
              />
            </div>
          </form>
        )}
      </Modal>

      {/* Invoice Detail & Print Drawer */}
      <Drawer
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        title={
          selectedInvoice
            ? `Invoice ${selectedInvoice.invoiceNumber}`
            : 'Invoice'
        }
        subtitle={
          selectedInvoice
            ? `${selectedInvoice.customerName} · ${selectedInvoice.subscriptionNumber}`
            : ''
        }
        footer={
          selectedInvoice && (
            <div className="w-full flex flex-wrap items-center justify-between gap-2 print:hidden">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Printer}
                  onClick={() => window.print()}
                >
                  Print
                </Button>
                {selectedInvoice.status !== 'cancelled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Send}
                    onClick={() => handleSendInvoice(selectedInvoice)}
                  >
                    {selectedInvoice.sentAt ? 'Resend' : 'Send'}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {selectedInvoice.status === 'draft' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={XCircle}
                      onClick={() =>
                        handleStatusChange(selectedInvoice, 'cancelled')
                      }
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CheckCircle2}
                      onClick={() =>
                        handleStatusChange(selectedInvoice, 'confirmed')
                      }
                    >
                      Confirm Invoice
                    </Button>
                  </>
                )}
                {selectedInvoice.status === 'confirmed' &&
                  selectedInvoice.amountDue > 0 && (
                    <>
                      {selectedInvoice.amountPaid === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={XCircle}
                          onClick={() =>
                            handleStatusChange(selectedInvoice, 'cancelled')
                          }
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        variant="primary"
                        size="sm"
                        icon={CreditCard}
                        onClick={() => openPaymentModal(selectedInvoice)}
                      >
                        Record Payment
                      </Button>
                    </>
                  )}
              </div>
            </div>
          )
        }
      >
        {selectedInvoice && (
          <div className="space-y-5">
            {/* Lifecycle Stepper: Draft -> Confirmed -> Paid */}
            <div className="print:hidden">
              <InvoiceStatusStepper currentStatus={selectedInvoice.status} />
            </div>

            {/* Sent Notification Strip */}
            {selectedInvoice.sentAt && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-zinc-700 print:hidden">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <MailCheck className="w-3.5 h-3.5 text-zinc-900" />
                  Sent to <strong>{selectedInvoice.sentTo}</strong>
                </span>
                <span className="text-zinc-500">
                  {formatDate(selectedInvoice.sentAt)}
                </span>
              </div>
            )}

            {/* Customer & Status */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
                  Billed To
                </div>
                <div className="text-sm font-bold text-zinc-900 mt-0.5">
                  {selectedInvoice.customerName}
                </div>
                {selectedInvoice.customerOrganization && (
                  <div className="text-xs font-medium text-zinc-700">
                    {selectedInvoice.customerOrganization}
                  </div>
                )}
                <div className="text-xs text-zinc-500">
                  {selectedInvoice.customerEmail}
                </div>
                {selectedInvoice.billingAddress && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {selectedInvoice.billingAddress}
                  </div>
                )}
              </div>
              <InvoiceStatusBadge
                status={selectedInvoice.status}
                dueDate={selectedInvoice.dueDate}
                amountDue={selectedInvoice.amountDue}
              />
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs">
              <div>
                <div className="text-zinc-500">Subscription</div>
                <div className="font-semibold text-zinc-900 font-mono mt-0.5">
                  {selectedInvoice.subscriptionNumber}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Invoice Date</div>
                <div className="font-semibold text-zinc-900 mt-0.5">
                  {formatDate(selectedInvoice.invoiceDate)}
                </div>
              </div>
              <div>
                <div className="text-zinc-500">Due Date</div>
                <div className="font-semibold text-zinc-900 mt-0.5">
                  {formatDate(selectedInvoice.dueDate)}
                </div>
              </div>
            </div>

            {/* Product Lines & Automatic Taxes */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase">
                    <th className="py-2.5 px-3">Product Line</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(selectedInvoice.lines || []).map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 px-3">
                        <div className="font-medium text-zinc-900">
                          {line.description || line.name}
                        </div>
                        {line.variant &&
                          !(line.description || '').includes(line.variant) && (
                            <div className="text-[11px] text-zinc-500 mt-0.5">
                              Variant: {line.variant}
                            </div>
                          )}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-zinc-600">
                        {line.quantity}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-zinc-600">
                        {formatMoney(line.unitPrice)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-zinc-900">
                        {formatMoney(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bg-zinc-50 border-t border-zinc-200 p-3.5 space-y-1.5 text-xs">
                {selectedInvoice.discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-zinc-600">
                      <span>Gross Amount</span>
                      <span className="tabular-nums font-medium text-zinc-900">
                        {formatMoney(selectedInvoice.grossSubtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-medium">
                      <span>
                        Discount (
                        {selectedInvoice.discountLabel ||
                          selectedInvoice.discountName}
                        )
                      </span>
                      <span className="tabular-nums">
                        -{formatMoney(selectedInvoice.discountAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium text-zinc-900">
                    {formatMoney(selectedInvoice.subtotal)}
                  </span>
                </div>

                {(selectedInvoice.taxLines || []).length > 0 ? (
                  selectedInvoice.taxLines.map((tl, idx) => (
                    <div
                      key={tl.id || idx}
                      className="flex justify-between text-zinc-600"
                    >
                      <span>
                        Tax · {tl.name}
                        {tl.rate !== undefined &&
                        !String(tl.name).includes('%')
                          ? ` (${tl.rate}%)`
                          : ''}
                      </span>
                      <span className="tabular-nums font-medium text-zinc-900">
                        {formatMoney(tl.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-zinc-600">
                    <span>Tax ({selectedInvoice.taxRate || '0%'})</span>
                    <span className="tabular-nums font-medium text-zinc-900">
                      {formatMoney(selectedInvoice.taxAmount || 0)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between border-t border-zinc-200 pt-1.5 font-semibold text-zinc-900">
                  <span>Invoice Total</span>
                  <span className="tabular-nums">
                    {formatMoney(selectedInvoice.total)}
                  </span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Amount Paid</span>
                  <span className="tabular-nums text-emerald-700 font-medium">
                    {formatMoney(selectedInvoice.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-sm font-bold text-zinc-900">
                  <span>Balance Due</span>
                  <span className="tabular-nums">
                    {formatMoney(selectedInvoice.amountDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payments History */}
            {(selectedInvoice.payments || []).length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Payments Recorded
                </div>
                <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-200 bg-white">
                  {selectedInvoice.payments.map((p) => (
                    <div
                      key={p.id}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-zinc-900">
                          {formatMoney(p.amount)}
                        </span>{' '}
                        <span className="text-zinc-500">via {p.method}</span>
                        {p.note && (
                          <span className="text-zinc-400"> · {p.note}</span>
                        )}
                      </div>
                      <span className="text-zinc-500 tabular-nums">
                        {formatDate(p.date)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
