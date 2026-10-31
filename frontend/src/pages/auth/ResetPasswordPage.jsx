import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { PasswordChecklist } from '../../components/common/PasswordChecklist';
import { useAuth } from '../../context/AuthContext';
import { validatePasswordRules } from '../../services/authService';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { validateResetToken, resetPassword } = useAuth();

  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function checkToken() {
      if (!token) {
        if (isMounted) {
          setTokenValid(false);
          setTokenError('No reset token was found in the link.');
          setIsValidating(false);
        }
        return;
      }

      const res = await validateResetToken(token);
      if (isMounted) {
        if (res.valid) {
          setTokenValid(true);
          setUserEmail(res.email || '');
        } else {
          setTokenValid(false);
          setTokenError(res.error || 'This reset link is invalid or has expired.');
        }
        setIsValidating(false);
      }
    }

    checkToken();
    return () => {
      isMounted = false;
    };
  }, [token, validateResetToken]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    const pwRules = validatePasswordRules(formData.newPassword);
    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required.';
    } else if (!pwRules.isValid) {
      newErrors.newPassword = 'Password does not meet the security requirements.';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your new password.';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(newErrors).length > 0) {
      setFormErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await resetPassword({
        token,
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword
      });

      if (res.success) {
        setIsSuccess(true);
      } else {
        setFormErrors({ general: res.error || 'Failed to update password.' });
      }
    } catch {
      setFormErrors({ general: 'An unexpected error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <AuthLayout title="Verifying reset link" subtitle="Checking security credentials...">
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--bl-text-muted)' }}>
          Validating link...
        </div>
      </AuthLayout>
    );
  }

  if (!tokenValid) {
    return (
      <AuthLayout title="Invalid reset link" subtitle="Link validation failed">
        <div className="bl-alert bl-alert-danger" role="alert">
          <div>{tokenError}</div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--bl-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
          Password reset links are valid for 15 minutes and can only be used once. Please request a new link to continue.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link to="/forgot-password" className="bl-btn bl-btn-primary bl-btn-lg" style={{ textDecoration: 'none' }}>
            Request new link
          </Link>
          <Link to="/signin" className="bl-btn bl-btn-secondary bl-btn-lg" style={{ textDecoration: 'none' }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (isSuccess) {
    return (
      <AuthLayout title="Password updated" subtitle="Your password has been changed">
        <div className="bl-alert bl-alert-success" role="alert" style={{ marginBottom: 20 }}>
          <div>You can now sign in to your Brightloop account using your new password.</div>
        </div>

        <Link to="/signin" className="bl-btn bl-btn-primary bl-btn-lg" style={{ textDecoration: 'none' }}>
          Sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set new password"
      subtitle={`Choose a new password for ${userEmail || 'your account'}`}
    >
      {formErrors.general && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <div>{formErrors.general}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          label="New password"
          placeholder="••••••••••••"
          value={formData.newPassword}
          onChange={handleChange}
          error={formErrors.newPassword}
          required
          disabled={isSubmitting}
          autoComplete="new-password"
        />

        <PasswordChecklist
          password={formData.newPassword}
          confirmPassword={formData.confirmPassword}
          showConfirmCheck={formData.confirmPassword.length > 0}
        />

        <div style={{ marginTop: 12 }}>
          <Input
            id="confirm-new-password"
            name="confirmPassword"
            type="password"
            label="Confirm new password"
            placeholder="••••••••••••"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={formErrors.confirmPassword}
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
            {isSubmitting ? 'Updating password...' : 'Reset password'}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
