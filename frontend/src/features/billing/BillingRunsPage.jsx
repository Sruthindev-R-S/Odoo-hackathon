import { useState, useEffect } from 'react';
import { Play, RotateCcw, CheckCircle2, AlertTriangle, ShieldCheck, Clock, FileText, ArrowRight } from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { billingService } from '../../api/services/billingService';
import { useToast } from '../../components/ui/ToastContext';
import { formatDate } from '../../lib/format';
import { Link } from 'react-router-dom';

export default function BillingRunsPage() {
  const { showToast } = useToast();
  const [runs, setRuns] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Run billing modal & execution state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null); // { created, skipped, failed }

  const loadData = async () => {
    setLoading(true);
    try {
      const [allRuns, allSubs] = await Promise.all([
        billingService.getBillingRuns(),
        billingService.getSubscriptions(),
      ]);
      setRuns(allRuns);
      setSubscriptions(allSubs);
    } catch (err) {
      console.error(err);
      showToast('Failed to load billing runs', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExecuteBilling = async () => {
    setConfirmModalOpen(false);
    setIsRunning(true);
    try {
      const result = await billingService.runBilling();
      setLastResult(result);
      showToast(
        `Billing run complete: Created ${result.created} · Skipped ${result.skipped} (already billed)`,
        'success'
      );
      await loadData();
    } catch (err) {
      showToast(err.message || 'Billing run failed', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-[#16233B] tracking-tight">
            Recurring Billing Runs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            "Billing Day" automation engine: Generates invoices for all active subscriptions due today without manual typing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs no-underline"
          >
            <FileText className="w-3.5 h-3.5" />
            View Invoices
          </Link>

          <Button
            variant="primary"
            icon={Play}
            onClick={() => setConfirmModalOpen(true)}
            loading={isRunning}
          >
            Run Billing Today
          </Button>
        </div>
      </div>

      {/* Execution Summary Banner (If just executed) */}
      {lastResult && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-4 animate-in slide-in-from-top-2 duration-200 ${
            lastResult.created > 0
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/70 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {lastResult.created > 0 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            )}
            <div>
              <div className="font-bold text-sm">
                Billing Run Finished: Created {lastResult.created} · Skipped {lastResult.skipped} (already billed) · Failed {lastResult.failed}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {lastResult.created === 0
                  ? 'Protection verified: All due subscriptions were already invoiced for this period. Nothing was billed twice.'
                  : `Successfully generated ${lastResult.created} new itemized invoice(s) in Draft/Confirmed status with auto-calculated taxes.`}
              </p>
            </div>
          </div>

          {lastResult.created > 0 && (
            <Link
              to="/invoices"
              className="text-xs font-bold text-[#0E7C86] hover:underline flex items-center gap-1 shrink-0"
            >
              Review Invoices <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* Info Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Active Subscriptions
          </div>
          <div className="text-2xl font-bold text-[#16233B] mt-1 tabular-nums">
            {activeSubscriptions.length}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Eligible for recurring invoice generation
          </p>
        </Card>

        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Duplicate Protection
          </div>
          <div className="text-sm font-bold text-[#2E7D4F] mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Active & Enforced
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Subscriptions already invoiced for the period are skipped
          </p>
        </Card>

        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Total Completed Runs
          </div>
          <div className="text-2xl font-bold text-[#16233B] mt-1 tabular-nums">
            {runs.length}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Audit trail of automated batch runs
          </p>
        </Card>
      </div>

      {/* Past Billing Runs Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#16233B]">
            Billing Run History
          </h2>
          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={loadData}
          >
            Refresh Log
          </Button>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
            Loading billing run history...
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No billing runs executed yet"
            description="When it is billing day, click 'Run Billing Today' to batch-generate invoices for all subscriptions due today with customer details, lines, and taxes."
            actionLabel="Execute First Billing Run"
            actionIcon={Play}
            onAction={() => setConfirmModalOpen(true)}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-[#F5F7FA] text-xs uppercase font-semibold text-[#16233B] border-b border-slate-200 tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Run ID & Timestamp</th>
                  <th scope="col" className="px-4 py-3.5 text-center">Invoices Created</th>
                  <th scope="col" className="px-4 py-3.5 text-center">Skipped (Already Billed)</th>
                  <th scope="col" className="px-4 py-3.5 text-center">Failed</th>
                  <th scope="col" className="px-4 py-3.5 text-center">Status</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#16233B] font-mono text-xs">
                        {run.id}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {formatDate(run.createdAt, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center tabular-nums font-bold text-[#0E7C86]">
                      {run.createdCount}
                    </td>

                    <td className="px-4 py-4 text-center tabular-nums text-slate-500">
                      {run.skippedCount}
                    </td>

                    <td className="px-4 py-4 text-center tabular-nums">
                      {run.failedCount > 0 ? (
                        <span className="text-[#C2362F] font-bold">{run.failedCount}</span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <Badge variant="success" size="sm">
                        Completed
                      </Badge>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to="/invoices"
                        className="text-xs font-semibold text-[#0E7C86] hover:underline"
                      >
                        Inspect Invoices
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Execute Recurring Billing Run"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmModalOpen(false)}
              disabled={isRunning}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExecuteBilling}
              loading={isRunning}
            >
              Confirm & Run Billing
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
          <p>
            Create invoices for all active subscriptions due today?
          </p>
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-[#16233B]">What happens automatically:</div>
            <div>• Each due subscription creates an itemized invoice pre-populated with customer details and line items.</div>
            <div>• Taxes are calculated automatically from rules (18% GST).</div>
            <div>• Subscriptions already billed for this billing period will be safely skipped to ensure nothing is billed twice.</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

