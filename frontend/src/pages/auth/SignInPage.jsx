import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input } from '../../components/common/Input';
import { useAuth } from '../../context/AuthContext';

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn(formData);
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        // Recoverable error: keep entered email so user doesn't retype
        setError(result.error || 'Invalid credentials.');
      }
    } catch {
      setError('Network communication failed. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign in to Brightloop"
      subtitle="Access your subscriptions, invoices, or team operations workspace"
    >
      {error && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4z" />
          </svg>
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          id="signin-email"
          name="email"
          type="email"
          label="Email address"
          placeholder="you@company.com"
          value={formData.email}
          onChange={handleChange}
          required
          disabled={isSubmitting}
          autoComplete="email"
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
              style={{ fontSize: 12, fontWeight: 500, color: '#52525b' }}
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
                <span>Signing In...</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </div>
      </form>

      <div className="bl-auth-footer">
        Don’t have an account yet? <Link to="/signup">Sign Up</Link>
      </div>
    </AuthLayout>
  );
}
