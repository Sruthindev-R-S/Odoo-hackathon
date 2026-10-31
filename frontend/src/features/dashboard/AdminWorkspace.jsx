import { useSearchParams } from 'react-router-dom';
import AppLayout from '../../layouts/AppLayout';
import AdminDashboard from './AdminDashboard';
import ProductManagement from '../products/ProductManagement';
import PlanManagement from '../plans/PlanManagement';
import TaxManagement from '../taxes/TaxManagement';
import CustomerBillingPage from '../billing/CustomerBillingPage';
import SubscriptionManagement from '../operations/SubscriptionManagement';
import InvoiceManagement from '../operations/InvoiceManagement';
import PaymentsPage from '../payments/PaymentsPage';
import StaffManagement from '../staff/StaffManagement';

export default function AdminWorkspace({ initialTab = 'dashboard' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || initialTab;

  const handleTabChange = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onNavigate={handleTabChange}
      workspaceRole="admin"
    >
      {currentTab === 'dashboard' && (
        <AdminDashboard onNavigate={handleTabChange} />
      )}
      {currentTab === 'products' && <ProductManagement />}
      {currentTab === 'plans' && <PlanManagement />}
      {currentTab === 'taxes' && <TaxManagement />}
      {currentTab === 'billing' && <CustomerBillingPage />}
      {currentTab === 'subscriptions' && (
        <SubscriptionManagement
          onInvoiceGenerated={() => handleTabChange('invoices')}
        />
      )}
      {currentTab === 'invoices' && (
        <InvoiceManagement
          onConfigureTaxes={() => handleTabChange('taxes')}
        />
      )}
      {currentTab === 'payments' && <PaymentsPage />}
      {currentTab === 'staff' && <StaffManagement />}
    </AppLayout>
  );
}
