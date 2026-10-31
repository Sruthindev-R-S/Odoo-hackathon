import { useState, useMemo } from 'react';
import { Plus, Search, Filter, CalendarDays } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import PlanTable from './PlanTable';
import PlanDrawer from './PlanDrawer';
import { usePlans } from './usePlans';
import { useToast } from '../../components/ui/ToastContext';
import { BILLING_PERIODS } from '../../api/types';

export default function PlanManagement() {
  const { plans, loading, addPlan, editPlan, removePlan } = usePlans();
  const { showToast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  // Delete modal state
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.productName && p.productName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesPeriod = selectedPeriod === 'all' || p.billingPeriod === selectedPeriod;

      return matchesSearch && matchesPeriod;
    });
  }, [plans, searchQuery, selectedPeriod]);

  const handleOpenAdd = () => {
    setEditingPlan(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (plan) => {
    setEditingPlan(plan);
    setDrawerOpen(true);
  };

  const handleSavePlan = async (formData) => {
    if (editingPlan) {
      await editPlan(editingPlan.id, formData);
      showToast(`Subscription plan "${formData.name}" updated`, 'success');
    } else {
      await addPlan(formData);
      showToast(`Subscription plan "${formData.name}" created`, 'success');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingPlan) return;
    setIsDeleting(true);
    try {
      await removePlan(deletingPlan.id);
      showToast(`Subscription plan "${deletingPlan.name}" removed`, 'success');
      setDeletingPlan(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete plan', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-zinc-200">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Subscription Plans
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Configure subscription tiers, recurring billing frequencies, minimum quantities, and lifecycle rules.
          </p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={handleOpenAdd}
        >
          Create Plan
        </Button>
      </div>

      {/* Filter and Search Bar (only show when plans exist) */}
      {plans.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search plans or products..."
              prefix={<Search className="w-4 h-4 text-zinc-400" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-zinc-500 flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Billing Period:
            </span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-xs bg-zinc-50 border border-zinc-300 rounded-lg px-2.5 py-2 font-medium text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="all">All Periods ({plans.length})</option>
              {BILLING_PERIODS.map((bp) => (
                <option key={bp.value} value={bp.value}>
                  {bp.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Content Area */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-zinc-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-zinc-200 border-t-zinc-900 mb-3" />
          <p className="text-sm font-medium">Loading subscription plans...</p>
        </div>
      ) : plans.length === 0 ? (
        /* Empty State mandated by Requirement 6 */
        <EmptyState
          icon={CalendarDays}
          title="No subscription plans created yet"
          description="Create recurring plans linked to your catalog products with defined billing frequencies, minimum quantities, and term behavior."
          actionLabel="Create First Plan"
          actionIcon={Plus}
          onAction={handleOpenAdd}
        />
      ) : filteredPlans.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm font-medium text-zinc-600">
            No plans match "{searchQuery}"
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-zinc-900 underline underline-offset-4"
            onClick={() => {
              setSearchQuery('');
              setSelectedPeriod('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <PlanTable
          plans={filteredPlans}
          onEdit={handleOpenEdit}
          onDelete={(p) => setDeletingPlan(p)}
        />
      )}

      {/* Add / Edit Drawer */}
      <PlanDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSavePlan}
        initialData={editingPlan}
        isEditing={Boolean(editingPlan)}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingPlan)}
        onClose={() => setDeletingPlan(null)}
        title="Delete Subscription Plan"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingPlan(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={isDeleting}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Are you sure you want to delete the plan{' '}
          <strong className="text-zinc-900">"{deletingPlan?.name}"</strong>?
          This will prevent new subscriptions from using this plan template.
        </p>
      </Modal>
    </div>
  );
}

