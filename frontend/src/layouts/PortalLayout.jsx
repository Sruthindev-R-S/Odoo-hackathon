import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PORTAL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'subscriptions', label: 'My Subscriptions' },
  { id: 'invoices', label: 'My Invoices' },
];

export default function PortalLayout({ currentTab, onNavigate, children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate('/signin');
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans text-zinc-900">
      {/* Clean Top Bar */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold">
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full transform -rotate-45" />
              </div>
              <div>
                <span className="font-bold text-base tracking-tight text-zinc-900">
                  Brightloop
                </span>
                <span className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                  Customer Portal
                </span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Customer Portal">
              {PORTAL_TABS.map((tab) => {
                const active = currentTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/billing"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 bg-white no-underline transition-colors"
            >
              Plan Checkout
            </Link>
            <Link
              to="/account"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 bg-white no-underline transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline max-w-36 truncate">
                {user?.organization || user?.name || 'Account'}
              </span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 bg-white transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile Tab Strip */}
        <div className="md:hidden border-t border-zinc-100 px-4 py-2 flex items-center gap-1 overflow-x-auto bg-white">
          {PORTAL_TABS.map((tab) => {
            const active = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
