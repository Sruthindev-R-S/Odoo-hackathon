import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/ToastContext';
import { SignUpPage } from './pages/auth/SignUpPage';
import { SignInPage } from './pages/auth/SignInPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { NotFoundPage } from './pages/error/NotFoundPage';
import { BrandLogo } from './components/common/BrandLogo';
import { Badge } from './components/common/Badge';
import RequireAdmin from './auth/RequireAdmin';
import AdminWorkspace from './features/dashboard/AdminWorkspace';
import CustomerBillingPage from './features/billing/CustomerBillingPage';

function AccountOverview() {
  const { user, signOut } = useAuth();

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bl-bg)' }}>
      <header style={{ height: 56, borderBottom: '1px solid var(--bl-border)', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <BrandLogo size="md" />
          <nav style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link
              to="/products"
              style={{
                fontSize: 13,
                textDecoration: 'none',
                color: 'var(--bl-text-secondary)',
                fontWeight: 500,
                transition: 'color 0.15s'
              }}
            >
              Products & Variants
            </Link>
            <Link
              to="/plans"
              style={{
                fontSize: 13,
                textDecoration: 'none',
                color: 'var(--bl-text-secondary)',
                fontWeight: 500,
                transition: 'color 0.15s'
              }}
            >
              Subscription Plans
            </Link>
            <Link
              to="/billing"
              style={{
                fontSize: 13,
                textDecoration: 'none',
                color: 'var(--bl-text-secondary)',
                fontWeight: 500,
                transition: 'color 0.15s'
              }}
            >
              Customer Billing
            </Link>
            <Link
              to="/admin"
              style={{
                fontSize: 13,
                textDecoration: 'none',
                color: 'var(--bl-text-secondary)',
                fontWeight: 500,
                transition: 'color 0.15s'
              }}
            >
              Workspace
            </Link>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--bl-text-secondary)' }}>{user.email}</span>
          <button
            type="button"
            onClick={signOut}
            className="bl-btn bl-btn-secondary"
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 640, width: '100%', margin: '40px auto', padding: '0 16px' }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--bl-border)', borderRadius: 'var(--bl-radius-lg)', padding: 28, boxShadow: 'var(--bl-shadow-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--bl-border)' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--bl-text-primary)' }}>Account Overview</h1>
              <p style={{ fontSize: 13, color: 'var(--bl-text-secondary)', margin: '4px 0 0 0' }}>Your Brightloop profile and organization settings</p>
            </div>
            <Badge variant={user.role}>{user.role}</Badge>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--bl-text-muted)', marginBottom: 2 }}>Name</div>
              <div style={{ fontWeight: 500, color: 'var(--bl-text-primary)' }}>{user.name}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--bl-text-muted)', marginBottom: 2 }}>Email</div>
              <div style={{ fontWeight: 500, color: 'var(--bl-text-primary)', fontFamily: 'var(--bl-font-mono)' }}>{user.email}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--bl-text-muted)', marginBottom: 2 }}>Organization</div>
              <div style={{ fontWeight: 500, color: 'var(--bl-text-primary)' }}>{user.organization || 'Brightloop Systems'}</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: 'var(--bl-text-muted)', marginBottom: 2 }}>Role access</div>
              <div style={{ color: 'var(--bl-text-secondary)' }}>
                {user.role === 'admin' && 'Administrator: Full management, catalog and staff configuration privileges.'}
                {user.role === 'staff' && 'Staff: Operations and customer subscription support.'}
                {user.role === 'customer' && 'Customer: Self-service access to your company subscriptions and invoices.'}
              </div>
            </div>

            <div style={{ marginTop: 12, paddingTop: 18, borderTop: '1px solid var(--bl-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bl-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Catalog Administration
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <Link
                  to="/products"
                  className="bl-btn bl-btn-primary"
                  style={{ textDecoration: 'none', textAlign: 'center', flex: 1, minWidth: 160, padding: '9px 16px', fontSize: 13 }}
                >
                  Manage Products & Variants
                </Link>
                <Link
                  to="/plans"
                  className="bl-btn bl-btn-secondary"
                  style={{ textDecoration: 'none', textAlign: 'center', flex: 1, minWidth: 160, padding: '9px 16px', fontSize: 13 }}
                >
                  Manage Subscription Plans
                </Link>
                <Link
                  to="/billing"
                  className="bl-btn bl-btn-secondary"
                  style={{ textDecoration: 'none', textAlign: 'center', flex: 1, minWidth: 160, padding: '9px 16px', fontSize: 13 }}
                >
                  Customer Billing & Checkout
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Authentication Pages */}
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/login" element={<Navigate to="/signin" replace />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Product & Plan Management Routes */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="dashboard" />
                </RequireAdmin>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="dashboard" />
                </RequireAdmin>
              }
            />
            <Route
              path="/products"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="products" />
                </RequireAdmin>
              }
            />
            <Route
              path="/plans"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="plans" />
                </RequireAdmin>
              }
            />
            <Route
              path="/settings/products"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="products" />
                </RequireAdmin>
              }
            />
            <Route
              path="/settings/plans"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="plans" />
                </RequireAdmin>
              }
            />

            {/* Customer Plan Selection & Recurring Billing Checkout */}
            <Route path="/billing" element={<CustomerBillingPage />} />
            <Route path="/portal/billing" element={<CustomerBillingPage />} />
            <Route path="/portal/subscriptions/new" element={<CustomerBillingPage />} />
            <Route path="/checkout" element={<CustomerBillingPage />} />

            {/* Main Products & Plans Catalog Workspace */}
            <Route path="/" element={<AdminWorkspace initialTab="products" />} />
            <Route path="/account" element={<AccountOverview />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
