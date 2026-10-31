import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock } from 'lucide-react';
import Button from '../components/ui/Button';

export default function RequireAdmin({ children }) {
  const { user, signOut } = useAuth();

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (user.role !== 'admin') {
    const handleElevate = () => {
      const updated = { ...user, role: 'admin' };
      localStorage.setItem('brightloop_current_user_v1', JSON.stringify(updated));
      window.location.reload();
    };

    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#16233B] mb-2">Admin Access Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            You are currently signed in as{' '}
            <span className="font-semibold text-slate-800">{user.email}</span> (
            <span className="capitalize">{user.role}</span>).
            Only administrators are authorized to manage products, variants, and subscription plans.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" onClick={handleElevate}>
              Elevate to Admin (Demo Mode)
            </Button>
            <Button variant="secondary" onClick={signOut}>
              Sign out & Switch Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
