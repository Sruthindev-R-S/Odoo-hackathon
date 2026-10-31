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
      subtitle="Welcome back. Enter your credentials to continue."
    >
      {error && (
        <div className="bl-alert bl-alert-danger" role="alert">
          <div>{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          id="signin-email"
          name="email"
          type="email"
          label="Work email"
          placeholder="name@company.com"
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
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--bl-text-secondary)', textDecoration: 'none' }}
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
