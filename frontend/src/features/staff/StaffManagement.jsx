import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Users, Search, Trash2, Power } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService, validatePasswordRules } from '../../services/authService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Drawer from '../../components/ui/Drawer';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { useToast } from '../../components/ui/useToast';
import { formatDate } from '../../lib/format';

export default function StaffManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    title: 'Operations Specialist',
    password: '',
  });
  const [formErrors, setFormErrors] = useState({});

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authService.getStaffMembers(user);
      if (res.success) {
        setStaffList(res.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const handleOpenCreate = () => {
    setFormData({
      name: '',
      email: '',
      title: 'Operations Specialist',
      password: '',
    });
    setFormErrors({});
    setDrawerOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Full name is required.';
    if (!formData.email.trim()) {
      errors.email = 'Work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    const pwRules = validatePasswordRules(formData.password);
    if (!formData.password) {
      errors.password = 'Temporary password is required.';
    } else if (!pwRules.isValid) {
      errors.password = 'Password must satisfy all complexity rules below.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const res = await authService.createStaffMember(user, formData);
      if (res.success) {
        showToast(`Staff account created for ${res.data.name}.`, 'success');
        setDrawerOpen(false);
        await loadStaff();
      } else {
        if (res.fieldErrors) setFormErrors(res.fieldErrors);
        showToast(res.error || 'Failed to create staff account.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (member) => {
    const res = await authService.toggleStaffStatus(user, member.id);
    if (res.success) {
      showToast(
        `${member.name} marked as ${res.data.isActive ? 'active' : 'inactive'}.`,
        'info'
      );
      await loadStaff();
    } else {
      showToast(res.error || 'Could not update status.', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingStaff) return;
    setIsDeleting(true);
    try {
      const res = await authService.deleteStaffMember(user, deletingStaff.id);
      if (res.success) {
        showToast(`Removed ${deletingStaff.name} from staff.`, 'success');
        setDeletingStaff(null);
        await loadStaff();
      } else {
        showToast(res.error || 'Failed to remove staff member.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStaff = staffList.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.title?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Staff Members
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Provision internal operations accounts for customer, subscription, and billing support.
          </p>
        </div>
        <Button variant="primary" icon={UserPlus} onClick={handleOpenCreate}>
          Add Staff Member
        </Button>
      </div>

      {/* Filter Bar */}
      {staffList.length > 0 && (
        <div className="bg-white p-3.5 rounded-xl border border-zinc-200 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name, email, or title..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
            />
          </div>
          <div className="text-xs text-zinc-500 font-medium">
            {filteredStaff.length} {filteredStaff.length === 1 ? 'member' : 'members'}
          </div>
        </div>
      )}

      {/* List / States */}
      {loading ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center text-sm text-zinc-500">
          Loading staff directory...
        </div>
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff members added yet"
          description="Add operations staff so your team can manage customer quotations, subscriptions, and invoices without exposing administrator settings."
          actionLabel="Add Staff Member"
          actionIcon={UserPlus}
          onAction={handleOpenCreate}
        />
      ) : filteredStaff.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
          <p className="text-sm font-medium text-zinc-600">
            No staff members match "{searchQuery}"
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-zinc-900 underline underline-offset-4"
            onClick={() => setSearchQuery('')}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Work Email</th>
                  <th className="py-3 px-4">Role Scope</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Added</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 text-sm">
                {filteredStaff.map((member) => {
                  const active = member.isActive !== false;
                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-zinc-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">
                          {member.name}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {member.title || 'Operations Specialist'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-700 font-mono text-xs">
                        {member.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge variant="neutral" size="sm">
                          Staff · Operations
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        {active ? (
                          <Badge variant="success" size="sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-zinc-500">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Power}
                            onClick={() => handleToggleStatus(member)}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => setDeletingStaff(member)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove staff account"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Add Staff Drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add Staff Member"
        subtitle="Create an internal staff login with operational subscription and billing access."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              loading={isSaving}
            >
              Create Staff Account
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <Input
            label="Full Name"
            required
            placeholder="e.g. Riya Sharma"
            value={formData.name}
            error={formErrors.name}
            onChange={(e) => {
              setFormData((p) => ({ ...p, name: e.target.value }));
              if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
            }}
          />

          <Input
            label="Work Email"
            type="email"
            required
            placeholder="riya@brightloop.com"
            value={formData.email}
            error={formErrors.email}
            hint="Used by the staff member to sign in at /signin."
            onChange={(e) => {
              setFormData((p) => ({ ...p, email: e.target.value }));
              if (formErrors.email) setFormErrors((p) => ({ ...p, email: undefined }));
            }}
          />

          <Input
            label="Role Title"
            placeholder="Operations Specialist"
            value={formData.title}
            onChange={(e) =>
              setFormData((p) => ({ ...p, title: e.target.value }))
            }
          />

          <div className="space-y-2.5">
            <Input
              label="Temporary Password"
              type="password"
              required
              placeholder="••••••••••••"
              value={formData.password}
              error={formErrors.password}
              onChange={(e) => {
                setFormData((p) => ({ ...p, password: e.target.value }));
                if (formErrors.password)
                  setFormErrors((p) => ({ ...p, password: undefined }));
              }}
            />
            <PasswordChecklist
              password={formData.password}
              showConfirmCheck={false}
            />
          </div>
        </form>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingStaff)}
        onClose={() => setDeletingStaff(null)}
        title="Remove Staff Account"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingStaff(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDelete}
              loading={isDeleting}
            >
              Remove Account
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 leading-relaxed">
          Remove staff access for{' '}
          <strong className="text-zinc-900">{deletingStaff?.name}</strong> (
          <span className="font-mono text-xs">{deletingStaff?.email}</span>)? They will no longer be able to sign in to the operations workspace.
        </p>
      </Modal>
    </div>
  );
}
