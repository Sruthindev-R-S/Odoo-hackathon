import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Send,
  Printer,
  Calendar,
  ShieldAlert,
  Clock,
  DollarSign,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operationsService } from '../../api/services/operationsService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import EmptyState from '../../components/ui/EmptyState';
import MoneyText from '../../components/domain/MoneyText';
import { useToast } from '../../components/ui/useToast';
import { formatMoney, formatDate, getDueStatus } from '../../lib/format';
import { BrandLogo } from '../../components/common/BrandLogo';

const PAYMENT_METHODS = [
  { value: 'all', label: 'All Payment Methods' },
  { value: 'Bank Wire / NEFT', label: 'Bank Wire / NEFT' },
  { value: 'UPI / Instant Transfer', label: 'UPI / Instant Transfer' },
  { value: 'Credit Card (Manual POS)', label: 'Credit Card (Manual POS)' },
  { value: 'Online Checkout', label: 'Online Checkout' },
  { value: 'Corporate Cheque', label: 'Corporate Cheque' },
  { value: 'Cash / Direct Deposit', label: 'Cash / Direct Deposit' },
];

export default function PaymentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('payments'); // 'payments' | 'outstanding'
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filters for Payments
  const [selectedMethod, setSelectedMethod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Record Payment Modal
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [targetInvoiceId, setTargetInvoiceId] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    method: 'Bank Wire / NEFT',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [paymentErrors, setPaymentErrors] = useState({});

  // Receipt Modal / Drawer
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Chase Reminder State
  const [remindingId, setRemindingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedPayments, fetchedInvoices, fetchedSummary] = await Promise.all([
        operationsService.getPayments(
          {
            method: selectedMethod,
            search: searchQuery,
            fromDate,
            toDate,
          },
          user
        ),
        operationsService.getInvoices({}, user),
        operationsService.getPaymentSummary(user),
      ]);
      setPayments(fetchedPayments);
      setInvoices(fetchedInvoices);
      setSummary(fetchedSummary);
    } catch (err) {
      console.error(err);
      showToast('Failed to load payments and receivables data', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedMethod, searchQuery, fromDate, toDate, user, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Outstanding and Overdue Invoices
  const outstandingInvoices = useMemo(() => {
    return invoices.filter(
      (inv) => inv.status === 'confirmed' && (inv.amountDue || 0) > 0
    );
  }, [invoices]);

  const overdueInvoices = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return outstandingInvoices.filter((inv) => inv.dueDate && inv.dueDate < today);
  }, [outstandingInvoices]);

  // Target invoice details for recording payment
  const activeTargetInvoice = useMemo(() => {
    return invoices.find((i) => i.id === targetInvoiceId) || null;
  }, [invoices, targetInvoiceId]);

  // Handle open Record Payment Modal
  const handleOpenRecordPayment = (preselectedInvoice = null) => {
    if (preselectedInvoice) {
      setTargetInvoiceId(preselectedInvoice.id);
      setPaymentForm({
        amount: preselectedInvoice.amountDue || '',
        method: 'Bank Wire / NEFT',
        date: new Date().toISOString().slice(0, 10),
        note: `Payment for ${preselectedInvoice.invoiceNumber}`,
      });
    } else {
      const firstDue = outstandingInvoices[0];
      setTargetInvoiceId(firstDue ? firstDue.id : '');
      setPaymentForm({
        amount: firstDue ? firstDue.amountDue : '',
        method: 'Bank Wire / NEFT',
        date: new Date().toISOString().slice(0, 10),
        note: firstDue ? `Payment for ${firstDue.invoiceNumber}` : '',
      });
    }
    setPaymentErrors({});
    setRecordModalOpen(true);
  };

  // Change invoice in modal
  const handleTargetInvoiceChange = (invId) => {
    setTargetInvoiceId(invId);
    const matched = invoices.find((i) => i.id === invId);
    if (matched) {
      setPaymentForm((prev) => ({
        ...prev,
        amount: matched.amountDue || '',
        note: `Payment for ${matched.invoiceNumber}`,
      }));
    }
  };

  // Submit Payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (!targetInvoiceId) {
      setPaymentErrors({ invoice: 'Please select an invoice to record payment against' });
      return;
    }

    const errors = {};
    const amountNum = Number(paymentForm.amount);
    if (!amountNum || amountNum <= 0) {
      errors.amount = 'Amount must be greater than zero';
    } else if (activeTargetInvoice && amountNum > activeTargetInvoice.amountDue + 0.005) {
      errors.amount = `Amount cannot exceed remaining balance of ${formatMoney(activeTargetInvoice.amountDue)}`;
    }

    if (!paymentForm.date) {
      errors.date = 'Payment date is required';
    }

    if (Object.keys(errors).length > 0) {
      setPaymentErrors(errors);
      return;
    }

    setSubmittingPayment(true);
    try {
      const updatedInvoice = await operationsService.recordPayment(
        targetInvoiceId,
        {
          amount: amountNum,
          method: paymentForm.method,
          date: paymentForm.date,
          note: paymentForm.note,
        },
        user
      );

      showToast(
        `Payment of ${formatMoney(amountNum)} recorded for ${updatedInvoice.invoiceNumber}! Status: ${
          updatedInvoice.status === 'paid' ? 'Paid in full' : 'Partially settled'
        }`,
        'success'
      );
      setRecordModalOpen(false);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Chase / Send Reminder for Overdue Invoice
  const handleSendReminder = async (invoice) => {
    setRemindingId(invoice.id);
    try {
      await operationsService.sendPaymentReminder(invoice.id, user);
      showToast(
        `Payment reminder sent to ${invoice.customerEmail} for overdue invoice ${invoice.invoiceNumber}.`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to send reminder', 'error');
    } finally {
      setRemindingId(null);
    }
  };

  // Calculate filtered payments total sum for totals row
  const filteredPaymentsTotal = useMemo(() => {
    return payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }, [payments]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0E7C86] uppercase tracking-wider mb-1">
            <DollarSign className="w-3.5 h-3.5" />
            PDF Scene: The Money Comes In
          </div>
          <h1 className="text-2xl font-bold text-[#16233B] tracking-tight">
            Payments & Collections
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Payments arrive by different methods and on different days. Record incoming money against the right invoice, reconcile settlements, and chase overdue accounts before they turn into lost revenue.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            icon={Plus}
            onClick={() => handleOpenRecordPayment()}
            disabled={outstandingInvoices.length === 0}
          >
            Record Payment
          </Button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Collected */}
        <Card className="p-5 border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Revenue Collected
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#EAF5EE] text-[#2E7D4F] flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#16233B] mt-2 tabular-nums">
            {formatMoney(summary?.totalCollected || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary?.paymentCount || 0} transaction{summary?.paymentCount === 1 ? '' : 's'} reconciled
          </div>
        </Card>

        {/* Total Outstanding */}
        <Card className="p-5 border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Outstanding Balance
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#16233B] mt-2 tabular-nums">
            {formatMoney(summary?.totalOutstanding || 0)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Across {summary?.confirmedCount || 0} confirmed invoice{summary?.confirmedCount === 1 ? '' : 's'}
          </div>
        </Card>

        {/* Overdue at Risk (Crucial for "chased before they turn into lost revenue") */}
        <Card
          className={`p-5 transition-all ${
            (summary?.overdueCount || 0) > 0
              ? 'border-red-300 bg-red-50/20 ring-1 ring-red-200'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#C2362F]">
              Overdue at Risk
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-100 text-[#C2362F] flex items-center justify-center font-bold">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#C2362F] mt-2 tabular-nums">
            {formatMoney(summary?.overdueAmount || 0)}
          </div>
          <div className="text-xs font-semibold text-red-700 mt-1 flex items-center gap-1">
            <span>{summary?.overdueCount || 0} invoice{summary?.overdueCount === 1 ? '' : 's'} past due</span>
            {(summary?.overdueCount || 0) > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('outstanding')}
                className="underline hover:text-red-900 ml-1"
              >
                Chase now →
              </button>
            )}
          </div>
        </Card>

        {/* Settlement Rate */}
        <Card className="p-5 border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Paid Invoices Ratio
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#E6F5F6] text-[#0E7C86] flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#16233B] mt-2 tabular-nums">
            {summary?.totalInvoices > 0
              ? `${Math.round(((summary?.paidCount || 0) / summary.totalInvoices) * 100)}%`
              : '100%'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {summary?.paidCount || 0} of {summary?.totalInvoices || 0} invoices paid
          </div>
        </Card>
      </div>

      {/* Tabs Switcher: Payments Ledger vs. Outstanding & Overdue Invoices */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('payments')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'payments'
              ? 'border-[#0E7C86] text-[#0E7C86]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Incoming Payments Ledger</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {payments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outstanding')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'outstanding'
              ? 'border-[#0E7C86] text-[#0E7C86]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Outstanding & Overdue Invoices</span>
          {overdueInvoices.length > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
              {overdueInvoices.length} Overdue
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
              {outstandingInvoices.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: PAYMENTS LEDGER */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-72">
              <Input
                placeholder="Search invoice #, customer, UTR note..."
                prefix={<Search className="w-4 h-4 text-slate-400" />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              <div className="w-48">
                <Select
                  options={PAYMENT_METHODS}
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  placeholder="From"
                  className="w-32 text-xs py-1.5"
                />
                <span>to</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  placeholder="To"
                  className="w-32 text-xs py-1.5"
                />
              </div>

              {(searchQuery || selectedMethod !== 'all' || fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedMethod('all');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="text-xs font-semibold text-[#0E7C86] hover:underline px-2 py-1"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Payments Table */}
          {loading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
              Loading payment records...
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments recorded yet"
              description="When payments arrive via Bank Wire, UPI, Credit Card, or Cheque, record each against the corresponding invoice to reconcile balances."
              actionLabel="Record Incoming Payment"
              actionIcon={Plus}
              onAction={() => handleOpenRecordPayment()}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Payment Ref & Date</th>
                    <th scope="col" className="px-4 py-3.5">Invoice #</th>
                    <th scope="col" className="px-4 py-3.5">Customer & Organization</th>
                    <th scope="col" className="px-4 py-3.5">Payment Method</th>
                    <th scope="col" className="px-4 py-3.5">Transaction Note</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Amount Received</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Ref & Date */}
                      <td className="px-5 py-4">
                        <div className="font-mono text-xs font-bold text-[#16233B]">
                          {p.id}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {formatDate(p.date)}
                        </div>
                      </td>

                      {/* Invoice */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-[#0E7C86] bg-[#E6F5F6] px-2 py-0.5 rounded">
                          {p.invoiceNumber}
                        </span>
                        {p.subscriptionNumber && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {p.subscriptionNumber}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-4">
                        <div className="font-semibold text-[#16233B]">
                          {p.customerName}
                        </div>
                        <div className="text-xs text-slate-400">
                          {p.organization || p.customerEmail}
                        </div>
                      </td>

                      {/* Method */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <Badge variant="neutral" size="sm" className="font-medium text-slate-700">
                          {p.method}
                        </Badge>
                      </td>

                      {/* Note */}
                      <td className="px-4 py-4 text-xs text-slate-600 max-w-xs truncate">
                        {p.note || <span className="text-slate-400 italic">No reference note</span>}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="font-bold text-[#2E7D4F] tabular-nums text-sm">
                          +{formatMoney(p.amount)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Settled by {p.recordedBy || 'Finance'}
                        </div>
                      </td>

                      {/* Receipt Action */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0E7C86] hover:underline"
                        >
                          <Printer className="w-3 h-3" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Section 7.9: Totals row for the filtered set */}
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-[#16233B]">
                  <tr>
                    <td colSpan={5} className="px-5 py-3.5 text-right uppercase tracking-wider text-slate-500">
                      Total Filtered Receipts ({payments.length} transactions):
                    </td>
                    <td className="px-4 py-3.5 text-right font-extrabold text-[#2E7D4F] text-base tabular-nums">
                      {formatMoney(filteredPaymentsTotal)}
                    </td>
                    <td className="px-5 py-3.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OUTSTANDING & OVERDUE INVOICES TRACKER */}
      {activeTab === 'outstanding' && (
        <div className="space-y-4">
          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 flex items-start justify-between gap-4 text-amber-950">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm">
                  Receivables & Overdue Debt Collection
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  "At any moment, the team should be able to see which invoices are paid and which are still outstanding, so overdue ones can be chased before they turn into lost revenue."
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs uppercase font-semibold text-amber-800 block">Total Unpaid Balance</span>
              <span className="text-lg font-bold text-amber-950 tabular-nums">
                {formatMoney(summary?.totalOutstanding || 0)}
              </span>
            </div>
          </div>

          {outstandingInvoices.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-xl border border-slate-200">
              <CheckCircle2 className="w-12 h-12 text-[#2E7D4F] mx-auto mb-3" />
              <h3 className="font-bold text-base text-[#16233B]">All Invoices Settled</h3>
              <p className="text-xs text-slate-500 mt-1">There are no outstanding or overdue invoices at this time.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Invoice #</th>
                    <th scope="col" className="px-4 py-3.5">Customer</th>
                    <th scope="col" className="px-4 py-3.5">Due Date & Status</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Invoice Total</th>
                    <th scope="col" className="px-4 py-3.5 text-right">Amount Due</th>
                    <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outstandingInvoices.map((inv) => {
                    const dueInfo = getDueStatus(inv.dueDate);
                    const isOverdue = dueInfo.isOverdue;

                    return (
                      <tr
                        key={inv.id}
                        className={`transition-colors ${
                          isOverdue ? 'bg-red-50/25 hover:bg-red-50/50' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="px-5 py-4 font-mono font-bold text-xs text-[#0E7C86]">
                          {inv.invoiceNumber}
                          {inv.subscriptionNumber && (
                            <div className="text-[10px] text-slate-400 font-mono font-normal">
                              {inv.subscriptionNumber}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="font-semibold text-[#16233B]">{inv.customerName}</div>
                          <div className="text-xs text-slate-400">{inv.customerEmail}</div>
                        </td>

                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-xs text-slate-700">{formatDate(inv.dueDate)}</div>
                          {isOverdue ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C2362F] bg-red-100 px-2 py-0.5 rounded-full mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              {dueInfo.label}
                            </span>
                          ) : (
                            <span className="text-[11px] text-amber-700 font-medium">
                              {dueInfo.label}
                            </span>
                          )}
                          {inv.lastReminderSentAt && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Reminder sent {formatDate(inv.lastReminderSentAt, { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 text-right tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatMoney(inv.total)}
                        </td>

                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <span
                            className={`font-bold tabular-nums text-sm ${
                              isOverdue ? 'text-[#C2362F]' : 'text-slate-900'
                            }`}
                          >
                            {formatMoney(inv.amountDue)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {/* Chase / Send Reminder */}
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Send}
                              onClick={() => handleSendReminder(inv)}
                              loading={remindingId === inv.id}
                            >
                              Chase / Remind
                            </Button>

                            {/* Record Payment */}
                            <Button
                              variant="primary"
                              size="sm"
                              icon={CreditCard}
                              onClick={() => handleOpenRecordPayment(inv)}
                            >
                              Record Payment
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        title="Record Incoming Payment"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setRecordModalOpen(false)}
              disabled={submittingPayment}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmitPayment}
              loading={submittingPayment}
            >
              Confirm & Save Payment
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmitPayment} className="space-y-4">
          {/* Invoice Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#16233B] mb-1.5">
              Select Invoice to Settle <span className="text-[#C2362F]">*</span>
            </label>
            <select
              value={targetInvoiceId}
              onChange={(e) => handleTargetInvoiceChange(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 font-medium text-[#16233B] focus:outline-none focus:ring-1 focus:ring-[#0E7C86]"
            >
              {outstandingInvoices.length === 0 ? (
                <option value="">No outstanding invoices available</option>
              ) : (
                outstandingInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {inv.customerName} (Due: {formatMoney(inv.amountDue)})
                  </option>
                ))
              )}
            </select>
            {paymentErrors.invoice && (
              <p className="text-xs text-[#C2362F] mt-1">{paymentErrors.invoice}</p>
            )}
          </div>

          {/* Active Invoice Info Card */}
          {activeTargetInvoice && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-[#16233B]">{activeTargetInvoice.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Invoice Amount:</span>
                <span className="tabular-nums font-medium text-slate-700">{formatMoney(activeTargetInvoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already Paid:</span>
                <span className="tabular-nums font-medium text-[#2E7D4F]">{formatMoney(activeTargetInvoice.amountPaid || 0)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-[#16233B]">Current Balance Due:</span>
                <span className="tabular-nums font-bold text-sm text-[#0E7C86]">{formatMoney(activeTargetInvoice.amountDue)}</span>
              </div>
            </div>
          )}

          {/* Amount & Method Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <Input
                label="Payment Amount (₹)"
                required
                type="number"
                step="any"
                prefix="₹"
                value={paymentForm.amount}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                error={paymentErrors.amount}
                helperText="Defaults to full balance due"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#16233B] mb-1.5">
                Payment Method <span className="text-[#C2362F]">*</span>
              </label>
              <select
                value={paymentForm.method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, method: e.target.value }))
                }
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 font-medium text-[#16233B] focus:outline-none focus:ring-1 focus:ring-[#0E7C86]"
              >
                {PAYMENT_METHODS.filter((m) => m.value !== 'all').map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <Input
              label="Payment Received Date"
              required
              type="date"
              value={paymentForm.date}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, date: e.target.value }))
              }
              error={paymentErrors.date}
            />
          </div>

          {/* Transaction Note */}
          <div>
            <Input
              label="Reference Note / UTR / Cheque #"
              placeholder="e.g. UTR # 4209182390 or Bank wire confirmation"
              value={paymentForm.note}
              onChange={(e) =>
                setPaymentForm((prev) => ({ ...prev, note: e.target.value }))
              }
              helperText="Audit note for bank statement matching"
            />
          </div>
        </form>
      </Modal>

      {/* PRINTABLE RECEIPT DRAWER */}
      {selectedReceipt && (
        <Drawer
          isOpen={Boolean(selectedReceipt)}
          onClose={() => setSelectedReceipt(null)}
          title={`Payment Receipt — ${selectedReceipt.id}`}
          subtitle="Official Brightloop Software Payment Confirmation"
          footer={
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                size="sm"
                icon={Printer}
                onClick={() => window.print()}
              >
                Print Receipt
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSelectedReceipt(null)}
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-6 text-xs text-slate-700 bg-white p-2">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <BrandLogo size="md" />
                <div className="text-[11px] text-slate-400 mt-1">Brightloop Software Inc.</div>
              </div>
              <div className="text-right">
                <Badge variant="success" size="md">Settled & Reconciled</Badge>
                <div className="font-mono text-xs font-bold text-[#16233B] mt-1.5">{selectedReceipt.id}</div>
                <div className="text-slate-400 text-[10px]">{formatDate(selectedReceipt.date)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Received From</span>
                <div className="font-bold text-[#16233B] text-sm mt-0.5">{selectedReceipt.customerName}</div>
                {selectedReceipt.organization && (
                  <div className="text-slate-600 font-medium">{selectedReceipt.organization}</div>
                )}
                <div className="text-slate-400">{selectedReceipt.customerEmail}</div>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">Against Invoice</span>
                <div className="font-mono font-bold text-[#0E7C86] text-sm mt-0.5">{selectedReceipt.invoiceNumber}</div>
                {selectedReceipt.subscriptionNumber && (
                  <div className="text-[10px] text-slate-500 font-mono">{selectedReceipt.subscriptionNumber}</div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-semibold text-[#16233B]">{selectedReceipt.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction Reference:</span>
                <span className="font-mono font-medium text-slate-700">{selectedReceipt.note || 'Direct Reconciliation'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded By:</span>
                <span className="text-slate-700 font-medium">{selectedReceipt.recordedBy || 'Finance Desk'}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-[#16233B]">
                <span>Total Amount Paid:</span>
                <span className="tabular-nums text-base text-[#2E7D4F]">{formatMoney(selectedReceipt.amount)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 text-center pt-4 border-t border-slate-100">
              This is an automated system confirmation of payment reconciliation.
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
