import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordRules } from '../../services/authService';

export function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear specific field error as user types to restore state
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

    // Client-side instant inline validation on blur
    if (name === 'email' && formData.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        setErrors((prev) => ({ ...prev, email: 'Please enter a valid work email.' }));
      }
    }
    if (name === 'password' && formData.password) {
      const pwRules = validatePasswordRules(formData.password);
      if (!pwRules.isValid) {
        setErrors((prev) => ({
          ...prev,
          password: 'Password must satisfy all security requirements listed below.'
        }));
      }
    }
    if (name === 'confirmPassword' && formData.confirmPassword) {
      if (formData.password !== formData.confirmPassword) {
        setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match.' }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');

    // Pre-submission validation
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required.';
    if (!formData.organization.trim()) newErrors.organization = 'Company or business name is required.';
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = 'Please enter a valid work email.';
    }

    const pwRules = validatePasswordRules(formData.password);
    if (!formData.password) {
      newErrors.password = 'Password is required.';
    } else if (!pwRules.isValid) {
      newErrors.password = 'Password does not meet the complexity requirements.';
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
      // Call service adapter
      const result = await signUp(formData);
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        // Recoverable error: preserve values and show message
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
        }
        setGeneralError(result.error || 'Failed to create account.');
      }
    } catch {
      setGeneralError('An unexpected network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Join Brightloop"
      subtitle="Create an account for your business to manage recurring subscriptions"
    >
      {generalError && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4z" />
          </svg>
          <div>{generalError}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input
            id="signup-name"
            name="name"
            label="Your Name"
            placeholder="e.g. Alex Morgan"
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
            label="Business Name"
            placeholder="e.g. Lumina Labs"
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
          label="Work Email"
          placeholder="alex@lumina.io"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.email}
          helpText="Each email belongs to only one Brightloop account."
          required
          disabled={isSubmitting}
          autoComplete="email"
        />

        <Input
          id="signup-password"
          name="password"
          type="password"
          label="Password"
          placeholder="Create a strong password"
          value={formData.password}
          onChange={handleChange}
          onBlur={handleBlur}
          error={errors.password}
          required
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        {/* Live validation checklist beside/under password field */}
        <PasswordChecklist
          password={formData.password}
          confirmPassword={formData.confirmPassword}
          showConfirmCheck={formData.confirmPassword.length > 0}
        />

        <div style={{ marginTop: 14 }}>
          <Input
            id="signup-confirm-password"
            name="confirmPassword"
            type="password"
            label="Confirm Password"
            placeholder="Repeat your password"
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
            {isSubmitting ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.6s linear infinite'
                  }}
                />
                <span>Creating Account...</span>
              </>
            ) : (
              'Create Small Business Account'
            )}
          </button>
        </div>
      </form>

      <div className="bl-auth-footer">
        Already have an account? <Link to="/signin">Sign In</Link>
      </div>
    </AuthLayout>
  );
}
