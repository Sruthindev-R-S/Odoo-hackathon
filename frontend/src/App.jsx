import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from 'react-router-dom';
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
import RequireRole, { getHomePathForRole } from './auth/RequireRole';
import AdminWorkspace from './features/dashboard/AdminWorkspace';
import CustomerBillingPage from './features/billing/CustomerBillingPage';
import StaffWorkspace from './features/staff/StaffWorkspace';
import CustomerPortal from './features/portal/CustomerPortal';

function RootWorkspaceRouter() {
  const { user } = useAuth();
  if (user?.role === 'staff') {
    return <Navigate to="/staff" replace />;
  }
  if (user?.role === 'customer') {
    return <Navigate to="/portal" replace />;
  }
  return <AdminWorkspace initialTab="products" />;
}

function DashboardRouter() {
  const { user } = useAuth();
  if (user?.role === 'staff') {
    return <StaffWorkspace initialTab="dashboard" />;
  }
  return (
    <RequireAdmin>
      <AdminWorkspace initialTab="dashboard" />
    </RequireAdmin>
  );
}

function AccountOverview() {
  const { user, signOut, switchRole } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  const homePath = getHomePathForRole(user.role);
  const homeLabel =
    user.role === 'admin'
      ? 'Open Admin Workspace'
      : user.role === 'staff'
      ? 'Open Staff Workspace'
      : 'Open Customer Portal';

  const handleRoleSwitch = (nextRole) => {
    const updated = switchRole(nextRole);
    if (updated) {
      navigate(getHomePathForRole(nextRole));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa] font-sans text-zinc-900">
      <header className="h-14 border-b border-zinc-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <BrandLogo size="md" />
          <nav className="hidden sm:flex items-center gap-4">
            <Link
              to={homePath}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 no-underline"
            >
              {homeLabel}
            </Link>
            <Link
              to="/billing"
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 no-underline"
            >
              Customer Billing & Checkout
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 hidden sm:inline">
            {user.email}
          </span>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate('/signin');
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-xl w-full mx-auto my-10 px-4 space-y-6">
        <div className="bg-white border border-zinc-200 rounded-xl p-7 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div>
              <h1 className="text-lg font-bold text-zinc-900">
                Account Overview
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Your Brightloop profile and active role permissions
              </p>
            </div>
            <Badge variant={user.role}>{user.role}</Badge>
          </div>

          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs text-zinc-400 mb-0.5">Name</div>
              <div className="font-medium text-zinc-900">{user.name}</div>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-0.5">Email</div>
              <div className="font-medium text-zinc-900 font-mono text-xs">
                {user.email}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-0.5">Organization</div>
              <div className="font-medium text-zinc-900">
                {user.organization || 'Brightloop Systems'}
              </div>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-0.5">Role Scope</div>
              <div className="text-xs text-zinc-600 leading-relaxed">
                {user.role === 'admin' &&
                  'Administrator: Full system access including products, variants, subscription plans, billing, and staff management.'}
                {user.role === 'staff' &&
                  'Staff: Operational access to customer subscriptions, quotations, invoices, payments, and read-only catalog.'}
                {user.role === 'customer' &&
                  'Customer: Self-service portal scoped exclusively to your own subscriptions and invoices.'}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 flex flex-wrap gap-2.5">
            <Link
              to={homePath}
              className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 no-underline transition-colors"
            >
              {homeLabel}
            </Link>
            <Link
              to="/billing"
              className="flex-1 text-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 no-underline transition-colors"
            >
              Plan Checkout
            </Link>
          </div>
        </div>

        {/* Workspace Role Switcher for Testing All 3 Dashboards */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-2xs space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Switch Role View
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Switch your active session role to preview Admin, Staff, or Customer dashboards.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['admin', 'staff', 'customer'].map((roleOpt) => {
              const active = user.role === roleOpt;
              return (
                <button
                  key={roleOpt}
                  type="button"
                  onClick={() => handleRoleSwitch(roleOpt)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
                  }`}
                >
                  {roleOpt}
                </button>
              );
            })}
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

            {/* Admin Workspace Routes */}
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="dashboard" />
                </RequireAdmin>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="staff" />
                </RequireAdmin>
              }
            />
            <Route
              path="/settings/staff"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="staff" />
                </RequireAdmin>
              }
            />
            <Route path="/dashboard" element={<DashboardRouter />} />
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
            <Route
              path="/taxes"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="taxes" />
                </RequireAdmin>
              }
            />
            <Route
              path="/settings/taxes"
              element={
                <RequireAdmin>
                  <AdminWorkspace initialTab="taxes" />
                </RequireAdmin>
              }
            />

            {/* Customer Plan Selection & Recurring Billing Checkout */}
            <Route path="/billing" element={<CustomerBillingPage />} />
            <Route path="/portal/billing" element={<CustomerBillingPage />} />
            <Route path="/portal/subscriptions/new" element={<CustomerBillingPage />} />
            <Route path="/checkout" element={<CustomerBillingPage />} />

            {/* Staff Operations Dashboard */}
            <Route
              path="/staff"
              element={
                <RequireRole allowedRoles={['staff', 'admin']} allowUnauthenticated>
                  <StaffWorkspace initialTab="dashboard" />
                </RequireRole>
              }
            />

            {/* Customer Self-Service Portal */}
            <Route
              path="/portal"
              element={
                <RequireRole allowedRoles={['customer']} allowUnauthenticated>
                  <CustomerPortal />
                </RequireRole>
              }
            />

            {/* Role-Aware Root & Account */}
            <Route path="/" element={<RootWorkspaceRouter />} />
            <Route path="/account" element={<AccountOverview />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
