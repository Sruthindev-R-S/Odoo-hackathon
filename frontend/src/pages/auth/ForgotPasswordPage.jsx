import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../context/AuthContext';

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [demoUrl, setDemoUrl] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setSubmitted(true);
        if (res.demoResetUrl) {
          setDemoUrl(res.demoResetUrl);
        }
      } else {
        setError(res.error || 'Failed to request reset link.');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email associated with your account to receive a secure reset link"
    >
      {submitted ? (
        <div style={{ textAlign: 'center' }}>
          <div className="bl-alert bl-alert-success" style={{ textAlign: 'left', marginBottom: 20 }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
            </svg>
            <div>
              <strong>Reset link sent</strong>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                If <strong>{email}</strong> is registered with Brightloop, an email containing your password reset link has been dispatched.
              </div>
            </div>
          </div>

          {demoUrl && (
            <div className="bl-card" style={{ padding: 16, background: '#fff7ed', borderColor: '#fed7aa', marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9a3412', marginBottom: 4 }}>
                🧪 Demo Simulation: Reset Link Generated
              </div>
              <p style={{ fontSize: 12, color: '#7c2d12', marginBottom: 12 }}>
                In this preview environment, you can directly open your simulated reset link:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link
                  to={demoUrl}
                  className="bl-btn bl-btn-primary bl-btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  Open Valid Reset Link →
                </Link>
                <Link
                  to="/reset-password?token=invalid_expired_token_123"
                  className="bl-btn bl-btn-outline bl-btn-sm"
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  Simulate Expired / Invalid Link
                </Link>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Link to="/signin" className="bl-btn bl-btn-secondary bl-btn-lg" style={{ textDecoration: 'none' }}>
              Back to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="bl-alert bl-alert-danger" role="alert">
              <div>{error}</div>
            </div>
          )}

          <Input
            id="reset-email"
            name="email"
            type="email"
            label="Email address"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            required
            disabled={isSubmitting}
            autoComplete="email"
            helpText="We will send a one-time link that remains active for 15 minutes."
          />

          <div style={{ marginTop: 20 }}>
            <button
              type="submit"
              className="bl-btn bl-btn-primary bl-btn-lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending Request...' : 'Send Password Reset Link'}
            </button>
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/signin" style={{ fontSize: 13 }}>
              Remember your password? Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}

