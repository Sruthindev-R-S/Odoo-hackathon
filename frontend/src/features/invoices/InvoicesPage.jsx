import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  Printer,
  Send,
  CreditCard,
  AlertCircle,
  Clock,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { billingService } from '../../api/services/billingService';
import { useToast } from '../../components/ui/ToastContext';
import { formatMoney, formatDate, getDueStatus } from '../../lib/format';
import { Link } from 'react-router-dom';

export default function InvoicesPage() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'draft' | 'confirmed' | 'paid' | 'overdue'
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Invoice for Detail / Drawer / Modal
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // Record Payment Modal
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Bank Wire / NEFT');
  const [paymentNote, setPaymentNote] = useState('');

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await billingService.getInvoices();
      setInvoices(data);
    } catch (err) {
      console.error(err);
      showToast('Failed to load invoices', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  // Compute counts for tabs
  const tabCounts = useMemo(() => {
    const counts = { all: invoices.length, draft: 0, confirmed: 0, paid: 0, overdue: 0 };
    invoices.forEach((inv) => {
      if (inv.status === 'draft') counts.draft++;
      if (inv.status === 'confirmed') counts.confirmed++;
      if (inv.status === 'paid') counts.paid++;

      const dueInfo = getDueStatus(inv.dueDate);
      if (inv.status === 'confirmed' && dueInfo.isOverdue) {
        counts.overdue++;
      }
    });
    return counts;
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Tab filter
      if (activeTab === 'draft' && inv.status !== 'draft') return false;
      if (activeTab === 'confirmed' && inv.status !== 'confirmed') return false;
      if (activeTab === 'paid' && inv.status !== 'paid') return false;
      if (activeTab === 'overdue') {
        const dueInfo = getDueStatus(inv.dueDate);
        if (!(inv.status === 'confirmed' && dueInfo.isOverdue)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesNumber = inv.invoiceNumber?.toLowerCase().includes(query);
        const matchesCustomer = inv.customerName?.toLowerCase().includes(query);
        const matchesOrg = inv.organization?.toLowerCase().includes(query);
        const matchesSub = inv.subscriptionNumber?.toLowerCase().includes(query);
        return matchesNumber || matchesCustomer || matchesOrg || matchesSub;
      }

      return true;
    });
  }, [invoices, activeTab, searchQuery]);

  // Actions
  const handleConfirmInvoice = async (invoiceId) => {
    setIsActionPending(true);
    try {
      const updated = await billingService.confirmInvoice(invoiceId);
      showToast(`Invoice ${updated.invoiceNumber} confirmed (Outstanding)`, 'success');
      setSelectedInvoice(updated);
      await loadInvoices();
    } catch (err) {
      showToast(err.message || 'Failed to confirm invoice', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSendInvoice = async (invoiceId) => {
    setIsActionPending(true);
    try {
      const updated = await billingService.sendInvoice(invoiceId);
      showToast(`Invoice ${updated.invoiceNumber} sent to ${updated.customerEmail}`, 'success');
      setSelectedInvoice(updated);
      await loadInvoices();
    } catch (err) {
      showToast(err.message || 'Failed to send invoice', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleOpenPayment = (inv) => {
    setPaymentModalInvoice(inv);
    setPaymentMethod('Bank Wire / NEFT');
    setPaymentNote(`Full settlement for ${inv.invoiceNumber}`);
  };

  const handleRecordPaymentSubmit = async () => {
    if (!paymentModalInvoice) return;
    setIsActionPending(true);
    try {
      const updated = await billingService.recordInvoicePayment(paymentModalInvoice.id, {
        method: paymentMethod,
        note: paymentNote,
      });
      showToast(`Payment recorded. Invoice ${updated.invoiceNumber} marked Paid!`, 'success');
      setPaymentModalInvoice(null);
      if (selectedInvoice?.id === updated.id) {
        setSelectedInvoice(updated);
      }
      await loadInvoices();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCancelInvoice = async (invoiceId) => {
    if (!window.confirm('Are you sure you want to cancel this invoice?')) return;
    setIsActionPending(true);
    try {
      const updated = await billingService.cancelInvoice(invoiceId);
      showToast(`Invoice ${updated.invoiceNumber} cancelled`, 'success');
      setSelectedInvoice(updated);
      await loadInvoices();
    } catch (err) {
      showToast(err.message || 'Failed to cancel invoice', 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-[#16233B] tracking-tight">
            Invoices & Accounts Receivable
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track recurring invoices generated from subscriptions. Confirm, send, record payments, and track overdue accounts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/billing-runs"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#0E7C86] hover:bg-[#0B656D] rounded-lg shadow-2xs no-underline transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Run Billing
          </Link>
        </div>
      </div>

      {/* Tabs Filter Bar as defined in Section 7.8 */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All', count: tabCounts.all },
            { id: 'draft', label: 'Draft', count: tabCounts.draft },
            { id: 'confirmed', label: 'Outstanding', count: tabCounts.confirmed },
            { id: 'paid', label: 'Paid', count: tabCounts.paid },
            { id: 'overdue', label: 'Overdue', count: tabCounts.overdue, isDanger: true },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#16233B] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : tab.isDanger && tab.count > 0
                      ? 'bg-red-100 text-red-700 font-bold'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search invoice #, customer..."
            prefix={<Search className="w-4 h-4 text-slate-400" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Invoices Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          Loading invoices...
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices generated yet"
          description="Invoices are created automatically from subscriptions when it is billing day. You can also run billing to generate them now."
          actionLabel="Go to Billing Runs"
          actionIcon={Clock}
          onAction={() => (window.location.href = '/billing-runs')}
        />
      ) : filteredInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          No invoices match the selected filter or search term.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3.5">Invoice #</th>
                <th scope="col" className="px-4 py-3.5">Customer & Organization</th>
                <th scope="col" className="px-4 py-3.5">Invoice Date</th>
                <th scope="col" className="px-4 py-3.5">Due Date</th>
                <th scope="col" className="px-4 py-3.5 text-right">Total</th>
                <th scope="col" className="px-4 py-3.5 text-center">Status</th>
                <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map((inv) => {
                const dueInfo = getDueStatus(inv.dueDate);
                const isOverdue = inv.status === 'confirmed' && dueInfo.isOverdue;

                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => setSelectedInvoice(inv)}
                  >
                    <td className="px-5 py-4 font-mono font-bold text-xs text-[#0E7C86]">
                      {inv.invoiceNumber}
                    </td>

                    <td className="px-4 py-4">
                      <div className="font-semibold text-[#16233B]">
                        {inv.customerName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {inv.organization || inv.customerEmail}
                      </div>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-600">
                      {formatDate(inv.date)}
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap text-xs">
                      <div>{formatDate(inv.dueDate)}</div>
                      {isOverdue && (
                        <span className="text-[11px] font-bold text-[#C2362F] flex items-center gap-0.5 mt-0.5">
                          <AlertCircle className="w-3 h-3" />
                          {dueInfo.label}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-right font-bold text-[#16233B] tabular-nums whitespace-nowrap">
                      <MoneyText amount={inv.total} />
                    </td>

                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      {inv.status === 'draft' && (
                        <Badge variant="neutral" size="sm">
                          Draft
                        </Badge>
                      )}
                      {inv.status === 'confirmed' && !isOverdue && (
                        <Badge variant="warning" size="sm">
                          Outstanding
                        </Badge>
                      )}
                      {inv.status === 'confirmed' && isOverdue && (
                        <Badge variant="danger" size="sm">
                          Overdue
                        </Badge>
                      )}
                      {inv.status === 'paid' && (
                        <Badge variant="success" size="sm">
                          Paid
                        </Badge>
                      )}
                      {inv.status === 'cancelled' && (
                        <Badge variant="outline" size="sm" className="line-through">
                          Cancelled
                        </Badge>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedInvoice(inv);
                        }}
                        className="text-xs font-semibold text-[#0E7C86] hover:underline"
                      >
                        Inspect & Actions →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail / Action Modal */}
      {selectedInvoice && (
        <Modal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          title={`Invoice ${selectedInvoice.invoiceNumber}`}
          maxWidth="max-w-2xl"
          footer={
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Draft: Confirm or Cancel */}
                {selectedInvoice.status === 'draft' && (
                  <>
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      onClick={() => handleCancelInvoice(selectedInvoice.id)}
                      disabled={isActionPending}
                    >
                      Cancel Invoice
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleConfirmInvoice(selectedInvoice.id)}
                      loading={isActionPending}
                    >
                      Confirm Invoice
                    </Button>
                  </>
                )}

                {/* Confirmed: Send, Record Payment, Cancel */}
                {selectedInvoice.status === 'confirmed' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Send}
                      onClick={() => handleSendInvoice(selectedInvoice.id)}
                      disabled={isActionPending}
                    >
                      {selectedInvoice.sentAt ? 'Resend' : 'Send to Customer'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CreditCard}
                      onClick={() => handleOpenPayment(selectedInvoice)}
                      disabled={isActionPending}
                    >
                      Record Payment
                    </Button>
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      onClick={() => handleCancelInvoice(selectedInvoice.id)}
                      disabled={isActionPending}
                    >
                      Cancel
                    </Button>
                  </>
                )}

                {/* Paid: Read-only */}
                {selectedInvoice.status === 'paid' && (
                  <span className="text-xs font-semibold text-[#2E7D4F] flex items-center gap-1 bg-[#EAF5EE] px-3 py-1.5 rounded-lg border border-[#2E7D4F]/20">
                    <CheckCircle2 className="w-4 h-4" /> Fully Settled
                  </span>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-5 text-xs text-slate-600">
            {/* Top Info Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Status</span>
                <span className="font-bold text-[#16233B] capitalize">{selectedInvoice.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Invoice Date</span>
                <span className="font-medium text-[#16233B]">{formatDate(selectedInvoice.date)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Due Date</span>
                <span className="font-medium text-[#16233B]">{formatDate(selectedInvoice.dueDate)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Subscription</span>
                <span className="font-mono text-[#0E7C86] font-semibold">{selectedInvoice.subscriptionNumber || '—'}</span>
              </div>
            </div>

            {/* Parties */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Billed To</div>
                <div className="font-bold text-[#16233B] text-sm">{selectedInvoice.customerName}</div>
                {selectedInvoice.organization && <div className="text-slate-700 font-medium">{selectedInvoice.organization}</div>}
                <div className="text-slate-500">{selectedInvoice.customerEmail}</div>
                <div className="text-slate-500 mt-1">{selectedInvoice.billingAddress}</div>
              </div>
              <div className="sm:text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Billing Period</div>
                <div className="text-slate-700 font-medium">{selectedInvoice.period || 'Monthly Cycle'}</div>
                <div className="text-slate-400 text-[11px] mt-1">Automatic Tax: {selectedInvoice.taxRate || '18% GST'}</div>
                {selectedInvoice.paymentMethod && (
                  <div className="text-[#2E7D4F] font-medium mt-1">Settled via {selectedInvoice.paymentMethod}</div>
                )}
              </div>
            </div>

            {/* Itemized Lines */}
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">Itemized Lines</div>
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-[11px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Line Description</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedInvoice.lineItems?.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-2.5">
                        <div className="font-medium text-[#16233B]">{item.name}</div>
                        {item.variant && <div className="text-[10px] text-slate-400 mt-0.5">Variant: {item.variant}</div>}
                      </td>
                      <td className="p-2.5 text-center tabular-nums">{item.quantity}</td>
                      <td className="p-2.5 text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
                      <td className="p-2.5 text-right font-medium text-[#16233B] tabular-nums">{formatMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="flex flex-col items-end pt-2">
              <div className="w-56 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal:</span>
                  <span className="tabular-nums font-medium text-[#16233B]">{formatMoney(selectedInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax ({selectedInvoice.taxRate || '18% GST'}):</span>
                  <span className="tabular-nums font-medium text-[#16233B]">{formatMoney(selectedInvoice.taxAmount)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm text-[#16233B]">
                  <span>Total Amount:</span>
                  <span className="tabular-nums">{formatMoney(selectedInvoice.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
        <Modal
          isOpen={Boolean(paymentModalInvoice)}
          onClose={() => setPaymentModalInvoice(null)}
          title={`Record Payment for ${paymentModalInvoice.invoiceNumber}`}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setPaymentModalInvoice(null)}
                disabled={isActionPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRecordPaymentSubmit}
                loading={isActionPending}
              >
                Confirm Payment ({formatMoney(paymentModalInvoice.total)})
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs text-slate-600">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div className="flex justify-between text-slate-700">
                <span>Customer:</span>
                <span className="font-bold text-[#16233B]">{paymentModalInvoice.customerName}</span>
              </div>
              <div className="flex justify-between text-slate-700 mt-1">
                <span>Amount Due:</span>
                <span className="font-bold text-base text-[#16233B] tabular-nums">{formatMoney(paymentModalInvoice.total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#16233B] mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-[#16233B] focus:outline-none focus:ring-1 focus:ring-[#0E7C86]"
              >
                <option value="Bank Wire / NEFT">Bank Wire / NEFT</option>
                <option value="UPI / Instant Transfer">UPI / Instant Transfer</option>
                <option value="Credit Card (Manual POS)">Credit Card (Manual POS)</option>
                <option value="Corporate Cheque">Corporate Cheque</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#16233B] mb-1">
                Payment Reference Note
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. UTR / Transaction # / Bank reference"
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-[#16233B] focus:outline-none focus:ring-1 focus:ring-[#0E7C86]"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
