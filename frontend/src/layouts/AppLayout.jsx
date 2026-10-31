import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Package,
  CalendarDays,
  FileSpreadsheet,
  Tag,
  Percent,
  Receipt,
  Repeat,
  FileText,
  Users,
  BookOpen,
  CreditCard,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

const ADMIN_NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Admin Overview',
    icon: LayoutDashboard,
    group: 'Catalog & System',
  },
  {
    id: 'products',
    label: 'Products & Variants',
    icon: Package,
    group: 'Catalog & System',
  },
  {
    id: 'plans',
    label: 'Subscription Plans',
    icon: CalendarDays,
    group: 'Catalog & System',
  },
  {
    id: 'templates',
    label: 'Quotation Templates',
    icon: FileSpreadsheet,
    group: 'Catalog & System',
  },
  {
    id: 'discounts',
    label: 'Discount Rules',
    icon: Tag,
    group: 'Catalog & System',
  },
  {
    id: 'taxes',
    label: 'Tax Rules',
    icon: Percent,
    group: 'Catalog & System',
  },
  {
    id: 'billing',
    label: 'Customer Billing',
    icon: Receipt,
    group: 'Operations',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: Repeat,
    group: 'Operations',
  },
  {
    id: 'invoices',
    label: 'Billing Day & Invoices',
    icon: FileText,
    group: 'Operations',
  },
  {
    id: 'payments',
    label: 'The Money Comes In (Payments)',
    icon: CreditCard,
    group: 'Operations',
  },
  {
    id: 'finance',
    label: 'Finance Lead (Month-End)',
    icon: TrendingUp,
    group: 'Operations',
  },
  {
    id: 'staff',
    label: 'Staff Members',
    icon: Users,
    group: 'Administration',
  },
];

const STAFF_NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Operations Overview',
    icon: LayoutDashboard,
    group: 'Daily Operations',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: Repeat,
    group: 'Daily Operations',
  },
  {
    id: 'invoices',
    label: 'Billing Day & Invoices',
    icon: FileText,
    group: 'Daily Operations',
  },
  {
    id: 'payments',
    label: 'The Money Comes In (Payments)',
    icon: CreditCard,
    group: 'Daily Operations',
  },
  {
    id: 'finance',
    label: 'Finance Lead (Month-End)',
    icon: TrendingUp,
    group: 'Daily Operations',
  },
  {
    id: 'catalog',
    label: 'Catalog (View Only)',
    icon: BookOpen,
    group: 'Reference',
  },
];

export default function AppLayout({
  currentTab,
  onNavigate,
  workspaceRole = 'admin',
  children,
}) {
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isStaffWorkspace = workspaceRole === 'staff';
  const navigationItems = isStaffWorkspace ? STAFF_NAV_ITEMS : ADMIN_NAV_ITEMS;

  const groups = Array.from(new Set(navigationItems.map((i) => i.group)));
  const activeItem =
    navigationItems.find((i) => i.id === currentTab) || navigationItems[0];

  const handleNavClick = (id) => {
    onNavigate(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col md:flex-row font-sans text-zinc-900">
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white text-zinc-900 px-4 py-3.5 flex items-center justify-between border-b border-zinc-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full transform -rotate-45" />
          </div>
          <span className="font-bold text-base tracking-tight text-zinc-900">
            Brightloop
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-zinc-600 hover:text-zinc-900"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:flex flex-col w-full md:w-64 bg-white text-zinc-900 flex-shrink-0 border-r border-zinc-200 z-30`}
      >
        {/* Brand Header */}
        <div className="hidden md:flex items-center gap-3 px-6 py-6 border-b border-zinc-200">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full transform -rotate-45" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-zinc-900">
              Brightloop
            </div>
            <div className="text-[11px] text-zinc-500 font-medium tracking-wide uppercase">
              {isStaffWorkspace ? 'Staff Operations' : 'Subscription Management'}
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 px-3 py-5 space-y-5 overflow-y-auto">
          {groups.map((groupName) => (
            <div key={groupName} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                {groupName}
              </div>
              {navigationItems
                .filter((item) => item.group === groupName)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                        isActive
                          ? 'bg-zinc-900 text-white shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 ${
                          isActive ? 'text-white' : 'text-zinc-500'
                        }`}
                      />
                      <span className="flex-1">{item.label}</span>
                      {isActive && (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>

        {/* User Info & Logout footer */}
        <div className="p-4 border-t border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-zinc-200 text-zinc-800 flex items-center justify-center font-bold text-xs uppercase">
              {user?.name
                ? user.name.substring(0, 2)
                : isStaffWorkspace
                ? 'ST'
                : 'AD'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-900 truncate">
                {user?.name || (isStaffWorkspace ? 'Operations Staff' : 'Administrator')}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {user?.email || (isStaffWorkspace ? 'staff@brightloop.com' : 'Not signed in')}
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-white">
              {isStaffWorkspace ? 'Staff' : 'Admin'}
            </span>
          </div>

          <div className="flex gap-2">
            <Link
              to="/account"
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-md transition-colors border border-zinc-200 bg-white no-underline font-medium"
            >
              Account
            </Link>
            <button
              onClick={
                user
                  ? signOut
                  : () => {
                      window.location.href = '/signin';
                    }
              }
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-md transition-colors border border-zinc-200 bg-white font-medium"
            >
              <LogOut className="w-3.5 h-3.5" />
              {user ? 'Sign Out' : 'Sign In'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 bg-white border-b border-zinc-200">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="font-medium text-zinc-700">
              {isStaffWorkspace ? 'Staff Workspace' : 'Admin Workspace'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-semibold text-zinc-900">
              {activeItem?.label || 'Overview'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-full border border-zinc-200">
              <Shield className="w-3.5 h-3.5 text-zinc-900" />
              Role:{' '}
              <strong className="text-zinc-900">
                {isStaffWorkspace ? 'Staff' : 'Administrator'}
              </strong>{' '}
              ({isStaffWorkspace ? 'Operations Access' : 'Full System Access'})
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
