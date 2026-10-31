import { useState, useEffect } from 'react';
import {
  Repeat,
  FileText,
  CreditCard,
  BookOpen,
  Plus,
  PlayCircle,
  ArrowRight,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { operationsService } from '../../api/services/operationsService';
import { planService } from '../../api/services/planService';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import MoneyText from '../../components/domain/MoneyText';
import {
  SubscriptionStatusBadge,
  InvoiceStatusBadge,
} from '../../components/domain/SubscriptionStatusBadge';
import { formatDate, formatMoney } from '../../lib/format';

export default function StaffDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchOverview() {
      try {
        const [subs, invs, planList] = await Promise.all([
          operationsService.getSubscriptions(user),
          operationsService.getInvoices(user),
          planService.getPlans(),
        ]);
        if (active) {
          setSubscriptions(subs);
          setInvoices(invs);
          setPlans(planList);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchOverview();
    return () => {
      active = false;
    };
  }, [user]);

  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const openInvoices = invoices.filter(
    (i) => i.status === 'confirmed' && i.amountDue > 0
  );
  const totalOutstanding = openInvoices.reduce(
    (sum, i) => sum + (Number(i.amountDue) || 0),
    0
  );
  const totalCollected = invoices.reduce(
    (sum, i) => sum + (Number(i.amountPaid) || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Header Card */}
      <div className="bg-white rounded-xl p-6 sm:p-8 text-zinc-900 border border-zinc-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-semibold text-zinc-800">
            <Briefcase className="w-3.5 h-3.5 text-zinc-900" />
            Operations Workspace · Staff
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
            Subscriptions & Billing Desk
          </h1>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Prepare customer quotations, activate subscriptions, run scheduled billing, and record customer payments. Catalog configuration and staff management remain administrator-only.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => onNavigate('subscriptions')}
          >
            Manage Subscriptions
          </Button>
          <Button
            variant="secondary"
            icon={PlayCircle}
            onClick={() => onNavigate('invoices')}
          >
            Invoices & Billing
          </Button>
          <Button
            variant="secondary"
            icon={CreditCard}
            onClick={() => onNavigate('payments')}
          >
            The Money Comes In
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          hoverable
          onClick={() => onNavigate('subscriptions')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
              <Repeat className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {loading ? '—' : activeSubs.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Active Subscriptions
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {subscriptions.length} total across all stages
            </p>
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => onNavigate('invoices')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {loading ? '—' : formatMoney(totalOutstanding)}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Outstanding Balance
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {openInvoices.length} unpaid confirmed invoices
            </p>
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => onNavigate('payments')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {loading ? '—' : formatMoney(totalCollected)}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              The Money Comes In
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              {formatMoney(totalCollected)} collected customer receipts
            </p>
          </div>
        </Card>

        <Card
          hoverable
          onClick={() => onNavigate('catalog')}
          className="p-6 cursor-pointer border-zinc-200 hover:border-zinc-400 bg-white"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-zinc-900 tabular-nums">
              {loading ? '—' : plans.length}
            </div>
            <div className="text-sm font-semibold text-zinc-700 mt-0.5">
              Catalog Plans (View Only)
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Available plans for customer quotes
            </p>
          </div>
        </Card>
      </div>

      {/* Recent Activity Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Subscriptions */}
        <Card className="p-6 border-zinc-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Recent Subscriptions
              </h2>
              <p className="text-xs text-zinc-500">
                Latest quotations and active customer agreements
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('subscriptions')}
            >
              View all
            </Button>
          </div>

          {subscriptions.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-zinc-200 rounded-xl">
              <p className="text-sm text-zinc-500 mb-3">
                No subscriptions created yet.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={() => onNavigate('subscriptions')}
              >
                Create Quotation
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {subscriptions.slice(0, 5).map((sub) => (
                <div
                  key={sub.id}
                  onClick={() => onNavigate('subscriptions')}
                  className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        {sub.subscriptionNumber}
                      </span>
                      <span className="text-sm font-medium text-zinc-800 truncate">
                        {sub.customerName}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {sub.planName} · Next: {formatDate(sub.nextBillingDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <MoneyText
                      amount={sub.recurringAmount}
                      className="text-xs"
                    />
                    <SubscriptionStatusBadge
                      status={sub.status}
                      isPaused={sub.isPaused}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Invoices */}
        <Card className="p-6 border-zinc-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                Recent Invoices
              </h2>
              <p className="text-xs text-zinc-500">
                Generated billing statements and due balances
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('invoices')}
            >
              View all
            </Button>
          </div>

          {invoices.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-zinc-200 rounded-xl">
              <p className="text-sm text-zinc-500 mb-3">
                No invoices generated yet.
              </p>
              <Button
                variant="secondary"
                size="sm"
                icon={PlayCircle}
                onClick={() => onNavigate('invoices')}
              >
                Open Billing
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {invoices.slice(0, 5).map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => onNavigate('invoices')}
                  className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-sm font-medium text-zinc-800 truncate">
                        {inv.customerName}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Due {formatDate(inv.dueDate)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <MoneyText amount={inv.amountDue} className="text-xs" />
                    <InvoiceStatusBadge
                      status={inv.status}
                      dueDate={inv.dueDate}
                      amountDue={inv.amountDue}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
