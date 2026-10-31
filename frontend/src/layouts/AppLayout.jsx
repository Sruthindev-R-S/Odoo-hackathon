import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronRight,
} from 'lucide-react';

export default function AppLayout({ currentTab, onNavigate, children }) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Admin Overview',
      icon: LayoutDashboard,
      description: 'Catalog summary and stats',
    },
    {
      id: 'products',
      label: 'Products & Variants',
      icon: Package,
      description: 'Catalog items, margins & variants',
    },
    {
      id: 'plans',
      label: 'Subscription Plans',
      icon: CalendarDays,
      description: 'Pricing tiers & recurrence rules',
    },
  ];

  const handleNavClick = (id) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col md:flex-row font-sans">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-[#16233B] text-white px-4 py-3.5 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0E7C86] text-white flex items-center justify-center font-bold">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full transform -rotate-45" />
          </div>
          <span className="font-bold text-base tracking-tight">Brightloop</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar (Desktop & Mobile drawer) */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-[#16233B] text-white flex-shrink-0 border-r border-slate-800 z-30`}
      >
        {/* Brand Header */}
        <div className="hidden md:flex items-center gap-3 px-6 py-6 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-xl bg-[#0E7C86] text-white flex items-center justify-center font-bold shadow-sm">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full transform -rotate-45" />
          </div>
          <div>
            <div className="font-extrabold text-base tracking-tight text-white">
              Brightloop
            </div>
            <div className="text-[11px] text-teal-300 font-medium tracking-wide uppercase">
              Subscription Management
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 px-3 py-6 space-y-1.5">
          <div className="px-3 pb-2 text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Catalog Administration
          </div>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-standard text-left ${
                  isActive
                    ? 'bg-[#0E7C86] text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="w-4 h-4 text-teal-200" />}
              </button>
            );
          })}
        </div>

        {/* User Info & Logout footer */}
        <div className="p-4 border-t border-slate-800 bg-[#121c2f]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-[#0E7C86]/30 text-teal-300 border border-[#0E7C86]/40 flex items-center justify-center font-bold text-xs uppercase">
              {user?.name ? user.name.substring(0, 2) : 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {user?.name || 'Administrator'}
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {user?.email || 'admin@brightloop.com'}
              </div>
            </div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-900/60 text-teal-300 border border-teal-700/50">
              Admin
            </span>
          </div>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-slate-700/60"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-medium text-slate-700">Admin Workspace</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-[#16233B] capitalize">
              {currentTab === 'dashboard'
                ? 'Overview'
                : currentTab === 'products'
                ? 'Products & Variants'
                : 'Subscription Plans'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <Shield className="w-3.5 h-3.5 text-[#0E7C86]" />
              Role: <strong className="text-[#16233B]">Administrator</strong> (Full Catalog Access)
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
