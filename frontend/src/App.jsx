import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SignUpPage } from './pages/auth/SignUpPage';
import { SignInPage } from './pages/auth/SignInPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { NotFoundPage } from './pages/error/NotFoundPage';
import { BrandLogo } from './components/common/BrandLogo';
import { Badge } from './components/common/Badge';

function SessionOverview() {
  const { user, signOut } = useAuth();

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <div className="bl-auth-container">
      <div className="bl-auth-card" style={{ maxWidth: 480 }}>
        <div className="bl-auth-header">
          <BrandLogo size="lg" />
          <h1 className="bl-auth-title">Welcome, {user.name}</h1>
          <p className="bl-auth-subtitle">Authentication & Role Access Confirmed</p>
        </div>

        <div className="bl-alert bl-alert-success" style={{ marginBottom: 20 }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
          </svg>
          <div>
            <strong>Session Active</strong>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              You are signed in as a verified <strong>{user.role}</strong>.
            </div>
          </div>
        </div>

        <div style={{ background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div>
              <span style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>User Name</span>
              <div style={{ fontWeight: 600, marginTop: 2 }}>{user.name}</div>
            </div>
            <div>
              <span style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Role Tier</span>
              <div style={{ marginTop: 2 }}><Badge variant={user.role}>{user.role}</Badge></div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <span style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Work Email</span>
              <div style={{ fontFamily: 'var(--bl-font-mono)', fontWeight: 500, marginTop: 2 }}>{user.email}</div>
            </div>
            {user.organization && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Organization</span>
                <div style={{ fontWeight: 500, marginTop: 2 }}>{user.organization}</div>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="bl-btn bl-btn-primary bl-btn-lg"
        >
          Sign Out of Brightloop
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Pages */}
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/login" element={<Navigate to="/signin" replace />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Authenticated Landing */}
          <Route path="/" element={<SessionOverview />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
