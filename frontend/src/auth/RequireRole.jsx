import { Navigate, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';

export function getHomePathForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'staff') return '/staff';
  if (role === 'customer') return '/portal';
  return '/signin';
}

export default function RequireRole({
  allowedRoles = [],
  allowUnauthenticated = false,
  children,
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user && !allowUnauthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (user && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    const destination = getHomePathForRole(user.role);
    const destinationLabel =
      user.role === 'staff'
        ? 'Staff Workspace'
        : user.role === 'customer'
        ? 'Customer Portal'
        : 'Admin Workspace';

    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-xl border border-zinc-200 p-8 shadow-xs text-center">
          <div className="w-11 h-11 bg-zinc-100 text-zinc-900 border border-zinc-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 mb-3">
            403 · Access Restricted
          </div>
          <h2 className="text-lg font-bold text-zinc-900 mb-2">
            Insufficient Role Permissions
          </h2>
          <p className="text-sm text-zinc-600 mb-6 leading-relaxed">
            Signed in as <span className="font-semibold text-zinc-900">{user.email}</span> (
            <span className="capitalize font-medium text-zinc-800">{user.role}</span>). This section is restricted to{' '}
            <span className="font-medium text-zinc-900">{allowedRoles.join(' / ')}</span> accounts.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Button variant="primary" onClick={() => navigate(destination)}>
              Go to {destinationLabel}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                signOut();
                navigate('/signin');
              }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
