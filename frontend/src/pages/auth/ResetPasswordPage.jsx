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
          setTokenError('No password reset token was provided in the link.');
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
      <AuthLayout title="Verifying reset link" subtitle="Validating your token security...">
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#71717a' }}>
          <div
            style={{
              display: 'inline-block',
              width: 24,
              height: 24,
              border: '2px solid #e4e4e7',
              borderTopColor: '#09090b',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
              marginBottom: 12
            }}
          />
          <div>Checking link validity...</div>
        </div>
      </AuthLayout>
    );
  }

  // Token is invalid or expired
  if (!tokenValid) {
    return (
      <AuthLayout title="Invalid Reset Link" subtitle="Security token verification failed">
        <div className="bl-alert bl-alert-danger" role="alert">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4z" />
          </svg>
          <div>
            <strong>Unable to proceed</strong>
            <p style={{ marginTop: 4, fontSize: 13 }}>{tokenError}</p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: '#52525b', marginBottom: 20 }}>
          For your protection, reset links are single-use and expire after 15 minutes. You can request a fresh link at any time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link to="/forgot-password" className="bl-btn bl-btn-primary bl-btn-lg" style={{ textDecoration: 'none' }}>
            Request New Reset Link
          </Link>
          <Link to="/signin" className="bl-btn bl-btn-secondary bl-btn-lg" style={{ textDecoration: 'none' }}>
            Back to Sign In
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Reset was successful
  if (isSuccess) {
    return (
      <AuthLayout title="Password Reset Complete" subtitle="Your credentials have been securely updated">
        <div className="bl-alert bl-alert-success" role="alert" style={{ marginBottom: 24 }}>
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
          </svg>
          <div>
            <strong>Success</strong>
            <p style={{ fontSize: 13, marginTop: 4 }}>
              Your password has been changed. You can now sign in to Brightloop with your new password.
            </p>
          </div>
        </div>

        <Link to="/signin" className="bl-btn bl-btn-primary bl-btn-lg" style={{ textDecoration: 'none' }}>
          Sign In Now →
        </Link>
      </AuthLayout>
    );
  }

  // Valid token: show reset form
  return (
    <AuthLayout
      title="Create new password"
      subtitle={`Set a new secure password for ${userEmail || 'your account'}`}
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
          label="New Password"
          placeholder="Enter new password"
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

        <div style={{ marginTop: 14 }}>
          <Input
            id="confirm-new-password"
            name="confirmPassword"
            type="password"
            label="Confirm New Password"
            placeholder="Repeat new password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={formErrors.confirmPassword}
            required
            disabled={isSubmitting}
            autoComplete="new-password"
          />
        </div>

        <div style={{ marginTop: 24 }}>
          <button
            type="submit"
            className="bl-btn bl-btn-primary bl-btn-lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating Password...' : 'Save New Password & Sign In'}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
