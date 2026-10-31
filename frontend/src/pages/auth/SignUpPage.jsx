import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordRules } from '../../services/authService';
import { getHomePathForRole } from '../../auth/RequireRole';

export function SignUpPage() {
  const { user, signUp } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    role: 'customer',
    name: '',
    organization: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  if (user) {
    return <Navigate to={getHomePathForRole(user.role)} replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (generalError) setGeneralError('');
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    if (name === 'email' && formData.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        setErrors((prev) => ({
          ...prev,
          email: 'Please enter a valid work email.',
        }));
      }
    }
    if (name === 'password' && formData.password) {
      const pwRules = validatePasswordRules(formData.password);
      if (!pwRules.isValid) {
        setErrors((prev) => ({
          ...prev,
          password: 'Password must satisfy all security requirements.',
        }));
      }
    }
    if (name === 'confirmPassword' && formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        setErrors((prev) => ({
          ...prev,
          confirmPassword: 'Passwords do not match.',
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required.';
    if (!formData.organization.trim())
      newErrors.organization = 'Company name is required.';
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid work email.';
    }

    const pwRules = validatePasswordRules(formData.password);
    if (!formData.password) {
      newErrors.password = 'Password is required.';
    } else if (!pwRules.isValid) {
      newErrors.password = 'Password does not meet the security requirements.';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password.';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp(formData);
      if (result.success) {
        navigate(getHomePathForRole(result.user?.role), { replace: true });
      } else {
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
        }
        setGeneralError(result.error || 'Failed to create account.');
      }
    } catch {
      setGeneralError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your Brightloop account"
      subtitle="Register as a Customer or System Administrator. Staff accounts are provisioned exclusively by Administrators."
    >
      {generalError && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <div>{generalError}</div>
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
            Account Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { value: 'customer', label: 'Customer Portal' },
              { value: 'admin', label: 'Administrator' },
            ].map((opt) => {
              const selected = formData.role === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, role: opt.value }))
                  }
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 13,
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
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--bl-text-muted)',
              marginTop: 6,
              marginBottom: 0,
            }}
          >
            Internal staff members cannot self-register — only an Administrator can add staff.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input
            id="signup-name"
            name="name"
            label="Full name"
            placeholder="Alex Morgan"
            value={formData.name}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.name ? errors.name : undefined}
            required
            disabled={isSubmitting}
            autoComplete="name"
          />

          <Input
            id="signup-organization"
            name="organization"
            label="Company name"
            placeholder="Acme Corp"
            value={formData.organization}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.organization ? errors.organization : undefined}
            required
            disabled={isSubmitting}
            autoComplete="organization"
          />
        </div>

        <Input
          id="signup-email"
          name="email"
          type="email"
          label="Work email"
          placeholder="alex@acmecorp.com"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.email}
          required
          disabled={isSubmitting}
          autoComplete="email"
        />

        <Input
          id="signup-password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••••••"
          value={formData.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.password}
          required
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        <PasswordChecklist
          password={formData.password}
          confirmPassword={formData.confirmPassword}
          showConfirmCheck={formData.confirmPassword.length > 0}
        />

        <div style={{ marginTop: 12 }}>
          <Input
            id="signup-confirm-password"
            name="confirmPassword"
            type="password"
            label="Confirm password"
            placeholder="••••••••••••"
            value={formData.confirmPassword}
            onChange={handleChange}
            onBlur={handleBlur}
            error={errors.confirmPassword}
            required
            disabled={isSubmitting}
            autoComplete="new-password"
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            type="submit"
            className="bl-btn bl-btn-primary bl-btn-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </div>

        <p
          style={{
            fontSize: 12,
            color: 'var(--bl-text-muted)',
            textAlign: 'center',
            marginTop: 12,
            lineHeight: 1.4,
          }}
        >
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>

      <div className="bl-card-subtle-footer">
        Already have an account? <Link to="/signin">Sign in</Link>
      </div>
    </AuthLayout>
  );
}
