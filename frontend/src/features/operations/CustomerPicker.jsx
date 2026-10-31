import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { authService } from '../../services/authService';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';

/**
 * Customer selector for quotations and subscriptions.
 *
 * The backend references customers by their numeric `users.id`, so the picker
 * always resolves a Customer ID. New customers can be registered inline through
 * POST /user/register without leaving the current Admin / Staff session.
 */
export default function CustomerPicker({
  value,
  onChange,
  customers = [],
  onCustomerRegistered,
  errors = {},
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quick, setQuick] = useState({
    name: '',
    email: '',
    password: '',
    organization: '',
  });
  const [quickError, setQuickError] = useState('');
  const [registering, setRegistering] = useState(false);

  const keyOf = (c) => String(c.customerId ?? c.id);
  const selectedKey = customers.some(
    (c) => keyOf(c) === String(value.customerId ?? '')
  )
    ? String(value.customerId)
    : '';

  const handlePick = (key) => {
    const found = customers.find((c) => keyOf(c) === key);
    if (!found) return;
    onChange({
      customerId: found.customerId ?? found.id,
      customerName: found.name || '',
      customerEmail: found.email || '',
      customerOrganization: found.organization || '',
    });
  };

  const handleQuickRegister = async () => {
    setQuickError('');
    if (!quick.name.trim() || !quick.email.trim() || quick.password.length < 8) {
      setQuickError('Name, email, and a password of at least 8 characters are required.');
      return;
    }
    setRegistering(true);
    try {
      const cust = await authService.registerCustomerDirectoryEntry(quick);
      onChange({
        customerId: cust.customerId ?? cust.id,
        customerName: cust.name || quick.name.trim(),
        customerEmail: cust.email || quick.email.trim().toLowerCase(),
        customerOrganization: cust.organization || quick.organization.trim(),
      });
      if (onCustomerRegistered) onCustomerRegistered(cust);
      setQuick({ name: '', email: '', password: '', organization: '' });
      setQuickOpen(false);
    } catch (err) {
      setQuickError(err.message || 'Could not register customer.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Select
            label="Registered Customer"
            placeholder={
              customers.length > 0
                ? 'Select a registered customer...'
                : 'No known customers yet — register one below'
            }
            value={selectedKey}
            options={customers.map((c) => ({
              value: keyOf(c),
              label: `#${keyOf(c)} · ${c.name}${c.email ? ` (${c.email})` : ''}`,
            }))}
            onChange={(e) => handlePick(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={UserPlus}
          onClick={() => setQuickOpen((o) => !o)}
        >
          {quickOpen ? 'Cancel' : 'Register Customer'}
        </Button>
      </div>

      {quickOpen && (
        <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50 space-y-3">
          <div className="text-xs font-semibold text-zinc-900">
            Register a new customer account
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Name"
              value={quick.name}
              onChange={(e) => setQuick((q) => ({ ...q, name: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={quick.email}
              onChange={(e) => setQuick((q) => ({ ...q, email: e.target.value }))}
            />
            <Input
              label="Temporary Password"
              type="password"
              value={quick.password}
              helperText="At least 8 characters"
              onChange={(e) =>
                setQuick((q) => ({ ...q, password: e.target.value }))
              }
            />
            <Input
              label="Organization (Optional)"
              value={quick.organization}
              onChange={(e) =>
                setQuick((q) => ({ ...q, organization: e.target.value }))
              }
            />
          </div>
          {quickError && (
            <p className="text-xs font-medium text-red-600">{quickError}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={registering}
              onClick={handleQuickRegister}
            >
              Register & Select
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label="Customer ID"
          type="number"
          min="1"
          required
          value={value.customerId ?? ''}
          error={errors.customerId}
          onChange={(e) => onChange({ customerId: e.target.value })}
        />
        <Input
          label="Customer Name"
          required
          value={value.customerName || ''}
          error={errors.customerName}
          onChange={(e) => onChange({ customerName: e.target.value })}
        />
        <Input
          label="Customer Email"
          type="email"
          value={value.customerEmail || ''}
          error={errors.customerEmail}
          onChange={(e) => onChange({ customerEmail: e.target.value })}
        />
      </div>
    </div>
  );
}

