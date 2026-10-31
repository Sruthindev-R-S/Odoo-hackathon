import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  PlayCircle,
  Search,
  CreditCard,
  Printer,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operationsService } from '../../api/services/operationsService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { InvoiceStatusBadge } from '../../components/domain/SubscriptionStatusBadge';
import { useToast } from '../../components/ui/useToast';
import { formatDate, formatMoney } from '../../lib/format';

export default function InvoiceManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [invoices, setInvoices] = useState([]);
  const [billingRuns, setBillingRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [confirmBillingOpen, setConfirmBillingOpen] = useState(false);
  const [runningBilling, setRunningBilling] = useState(false);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentModalInv, setPaymentModalInv] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'Bank Transfer',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invList, runList] = await Promise.all([
        operationsService.getInvoices(user),
        operationsService.getBillingRuns(),
      ]);
      setInvoices(invList);
      setBillingRuns(runList);
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

  const tabs = [
    { id: 'all', label: 'All', count: invoices.length },
    {
      id: 'draft',
      label: 'Draft',
      count: invoices.filter((i) => i.status === 'draft').length,
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
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
  ];

  const filteredInvoices = invoices.filter((inv) => {
    if (tab === 'draft' && inv.status !== 'draft') return false;
    if (
      tab === 'outstanding' &&
      !(inv.status === 'confirmed' && inv.amountDue > 0)
    )
      return false;
    if (tab === 'paid' && inv.status !== 'paid') return false;
    if (tab === 'overdue' && !isInvOverdue(inv)) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      inv.subscriptionNumber?.toLowerCase().includes(q) ||
      inv.planName?.toLowerCase().includes(q)
    );
  });

  const handleRunBilling = async () => {
    setRunningBilling(true);
    try {
      const summary = await operationsService.runBilling(user);
      setConfirmBillingOpen(false);
      showToast(
        `Billing run finished: Created ${summary.createdCount} · Skipped ${summary.skippedCount} (already billed).`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Billing run failed.', 'error');
    } finally {
      setRunningBilling(false);
    }
  };

  const handleStatusChange = async (inv, nextStatus) => {
    try {
      const updated = await operationsService.updateInvoiceStatus(
        inv.id,
        nextStatus
      );
      setSelectedInvoice(updated);
      showToast(
        `Invoice ${updated.invoiceNumber} ${
          nextStatus === 'confirmed' ? 'confirmed' : 'cancelled'
        }.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Could not update invoice.', 'error');
    }
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
        `Payment recorded on ${updated.invoiceNumber} (${updated.status}).`,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Invoices & Payments
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Run recurring billing cycles without duplicates, confirm invoices, and reconcile incoming payments.
          </p>
        </div>
        <Button
          variant="primary"
          icon={PlayCircle}
          onClick={() => setConfirmBillingOpen(true)}
        >
          Run Billing
        </Button>
      </div>

      {/* Latest Billing Run Summary (if run at least once) */}
      {billingRuns.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="text-zinc-600">
            Last billing run by{' '}
            <strong className="text-zinc-900">{billingRuns[0].actor}</strong> on{' '}
            {formatDate(billingRuns[0].timestamp)}
          </div>
          <div className="flex items-center gap-3 font-medium">
            <span className="text-zinc-900">
              Created: <strong>{billingRuns[0].createdCount}</strong>
            </span>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600">
              Skipped (already billed):{' '}
              <strong>{billingRuns[0].skippedCount}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
            placeholder="Search invoice #, customer..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
          />
        </div>
      </div>

      {/* Table / Empty */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading invoices...
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices generated yet"
          description="Run billing to create invoices for all active subscriptions due in the current cycle."
          actionLabel="Run Billing"
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
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Amount Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-zinc-50/70 transition-colors"
                  >
                    <td
                      onClick={() => setSelectedInvoice(inv)}
                      className="py-3.5 px-4 font-mono text-xs font-semibold text-zinc-900 cursor-pointer underline-offset-2 hover:underline"
                    >
                      {inv.invoiceNumber}
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
                    <td className="py-3.5 px-4 text-right">
                      <MoneyText amount={inv.total} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <MoneyText amount={inv.amountDue} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {inv.status === 'draft' && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleStatusChange(inv, 'confirmed')}
                          >
                            Confirm
                          </Button>
                        )}
                        {inv.status === 'confirmed' && inv.amountDue > 0 && (
                          <Button
                            variant="primary"
                            size="sm"
                            icon={CreditCard}
                            onClick={() => openPaymentModal(inv)}
                          >
                            Record Payment
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          View
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

      {/* Run Billing Confirmation Modal */}
      <Modal
        isOpen={confirmBillingOpen}
        onClose={() => setConfirmBillingOpen(false)}
        title="Run Recurring Billing"
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
              Run Billing Now
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Create invoices for all active, unpaused subscriptions due in the current billing cycle? Any subscription already billed for its active cycle will be automatically skipped to prevent duplicate charges.
        </p>
      </Modal>

      {/* Record Payment Modal */}
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
              Save Payment
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

      {/* Invoice Detail Drawer */}
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
            <div className="w-full flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print / PDF
              </Button>
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
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500">Billed To</div>
                <div className="text-sm font-bold text-zinc-900">
                  {selectedInvoice.customerName}
                </div>
                <div className="text-xs text-zinc-500">
                  {selectedInvoice.customerEmail}
                </div>
              </div>
              <InvoiceStatusBadge
                status={selectedInvoice.status}
                dueDate={selectedInvoice.dueDate}
                amountDue={selectedInvoice.amountDue}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 text-xs">
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

            {/* Line Items */}
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase">
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {(selectedInvoice.lines || []).map((line) => (
                    <tr key={line.id}>
                      <td className="py-3 px-3 font-medium text-zinc-900">
                        {line.description}
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
                <div className="flex justify-between text-zinc-600">
                  <span>Total</span>
                  <span className="tabular-nums font-semibold text-zinc-900">
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
