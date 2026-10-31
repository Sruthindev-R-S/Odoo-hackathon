import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Users,
  Search,
  Trash2,
  Power,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authService, validatePasswordRules } from '../../services/authService';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Switch from '../../components/ui/Switch';
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

  // Endpoint #7: Accept employee by ID modal
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptEmployeeId, setAcceptEmployeeId] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    title: 'Operations Specialist',
    password: '',
    autoAccept: true,
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
      autoAccept: true,
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
        showToast(
          `Staff account #${res.data.id} created for ${res.data.name}${
            res.data.isActive ? ' and accepted.' : ' (pending acceptance).'
          }`,
          'success'
        );
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

  const handleAcceptById = async (e) => {
    e.preventDefault();
    if (!acceptEmployeeId.trim()) return;
    setIsAccepting(true);
    try {
      const res = await authService.acceptEmployee(user, acceptEmployeeId.trim());
      if (res.success) {
        showToast(
          `Employee #${res.data.id} (${res.data.name}) accepted and activated.`,
          'success'
        );
        setAcceptEmployeeId('');
        setAcceptOpen(false);
        await loadStaff();
      } else {
        showToast(res.error || 'Could not accept employee.', 'error');
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleAcceptRow = async (member) => {
    const res = await authService.acceptEmployee(user, member.id);
    if (res.success) {
      showToast(`Employee ${res.data.name} (#${res.data.id}) accepted.`, 'success');
      await loadStaff();
    } else {
      showToast(res.error || 'Could not accept employee.', 'error');
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
        showToast(`Removed ${deletingStaff.name} from staff list.`, 'success');
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
      String(s.id || '')
        .toLowerCase()
        .includes(q) ||
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
            Register company staff accounts and accept pending employees for operational workspace access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={CheckCircle2}
            onClick={() => setAcceptOpen(true)}
          >
            Accept Employee ID
          </Button>
          <Button variant="primary" icon={UserPlus} onClick={handleOpenCreate}>
            Add Staff Member
          </Button>
        </div>
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
              placeholder="Search staff by ID, name, or email..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/15 focus:border-zinc-900"
            />
          </div>
          <div className="text-xs text-zinc-500 font-medium">
            {filteredStaff.length}{' '}
            {filteredStaff.length === 1 ? 'member' : 'members'}
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
          description="Register new operations staff or accept an existing pending company user ID so your team can manage quotations and subscriptions."
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
                  <th className="py-3 px-4">ID</th>
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
                  const isBackendNumeric = Number.isInteger(Number(member.id));
                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-zinc-50/70 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono text-xs text-zinc-600">
                        #{member.id}
                      </td>
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
                          {member.backendRole || 'STAFF'} · Operations
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4">
                        {active ? (
                          <Badge variant="success" size="sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Accepted
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Pending Approval
                          </Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-zinc-500">
                        {formatDate(member.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {!active && isBackendNumeric ? (
                            <Button
                              variant="primary"
                              size="sm"
                              icon={CheckCircle2}
                              onClick={() => handleAcceptRow(member)}
                            >
                              Accept Employee
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Power}
                              onClick={() => handleToggleStatus(member)}
                            >
                              {active ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeletingStaff(member)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove staff entry"
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
        subtitle="Registers a company user (POST /company-users/register) and optionally accepts them immediately."
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
            label="Name (Login Username)"
            required
            placeholder="e.g. Riya Sharma"
            value={formData.name}
            error={formErrors.name}
            hint="Used by the staff member as their login name at /signin."
            onChange={(e) => {
              setFormData((p) => ({ ...p, name: e.target.value }));
              if (formErrors.name)
                setFormErrors((p) => ({ ...p, name: undefined }));
            }}
          />

          <Input
            label="Work Email"
            type="email"
            required
            placeholder="riya@brightloop.com"
            value={formData.email}
            error={formErrors.email}
            onChange={(e) => {
              setFormData((p) => ({ ...p, email: e.target.value }));
              if (formErrors.email)
                setFormErrors((p) => ({ ...p, email: undefined }));
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

          <div className="pt-2 border-t border-zinc-200">
            <Switch
              label="Accept & Activate Employee Immediately"
              description="Automatically calls POST /company-users/accept-employee so this staff member can sign in right away."
              checked={formData.autoAccept}
              onChange={(checked) =>
                setFormData((p) => ({ ...p, autoAccept: checked }))
              }
            />
          </div>
        </form>
      </Drawer>

      {/* Endpoint #7: Accept Employee by ID Modal */}
      <Modal
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title="Accept Pending Employee"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setAcceptOpen(false)}
              disabled={isAccepting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isAccepting}
              onClick={handleAcceptById}
              disabled={!acceptEmployeeId.trim()}
            >
              Accept Employee
            </Button>
          </>
        }
      >
        <form onSubmit={handleAcceptById} className="space-y-3">
          <p className="text-xs text-zinc-600 leading-relaxed">
            Enter the numeric Company User ID of a registered employee to
            approve and activate their workspace access.
          </p>
          <Input
            label="Company User ID"
            type="number"
            min="1"
            required
            placeholder="e.g. 2"
            value={acceptEmployeeId}
            onChange={(e) => setAcceptEmployeeId(e.target.value)}
          />
        </form>
      </Modal>

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
          Remove staff directory entry for{' '}
          <strong className="text-zinc-900">{deletingStaff?.name}</strong> (
          <span className="font-mono text-xs">{deletingStaff?.email}</span>)?
        </p>
      </Modal>
    </div>
  );
}
