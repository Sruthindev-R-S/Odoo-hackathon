import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../context/AuthContext';
import { getHomePathForRole } from '../../auth/RequireRole';

export function SignInPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    accountType: 'company',
    name: '',
    password: '',
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Please enter your registered name.');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn({
        name: formData.name.trim(),
        password: formData.password,
        accountType: formData.accountType,
      });
      if (result.success) {
        navigate(getHomePathForRole(result.user?.role), { replace: true });
      } else {
        setError(result.error || 'Invalid credentials.');
      }
    } catch {
      setError('Unable to connect. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to Brightloop"
      subtitle="Select your account type and enter your registered name and password."
    >
      {error && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--bl-text-primary)',
              marginBottom: 6,
            }}
          >
            Sign in as
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            {[
              { value: 'company', label: 'Company User (Admin / Staff)' },
              { value: 'customer', label: 'Customer Portal' },
            ].map((opt) => {
              const selected = formData.accountType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, accountType: opt.value }));
                    if (error) setError('');
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: selected
                      ? '1px solid #18181b'
                      : '1px solid #e4e4e7',
                    backgroundColor: selected ? '#18181b' : '#ffffff',
                    color: selected ? '#ffffff' : '#3f3f46',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <Input
          id="signin-name"
          name="name"
          type="text"
          label="Name"
          placeholder={
            formData.accountType === 'company'
              ? 'Enter company user name'
              : 'Enter customer name'
          }
          value={formData.name}
          onChange={handleChange}
          required
          disabled={isSubmitting}
          autoComplete="username"
        />

        <Input
          id="signin-password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••••••"
          value={formData.password}
          onChange={handleChange}
          required
          disabled={isSubmitting}
          autoComplete="current-password"
          labelRightAction={
            <Link
              to="/forgot-password"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--bl-text-secondary)',
                textDecoration: 'none',
              }}
            >
              Forgot password?
            </Link>
          }
        />

        <div style={{ marginTop: 20 }}>
          <button
            type="submit"
            className="bl-btn bl-btn-primary bl-btn-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>

      <div className="bl-card-subtle-footer">
        Don’t have an account? <Link to="/signup">Sign up</Link>
      </div>
    </AuthLayout>
  );
}
