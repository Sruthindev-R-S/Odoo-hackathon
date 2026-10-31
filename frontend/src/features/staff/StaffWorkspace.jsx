import { useSearchParams } from 'react-router-dom';
import AppLayout from '../../layouts/AppLayout';
import StaffDashboard from './StaffDashboard';
import SubscriptionManagement from '../operations/SubscriptionManagement';
import InvoiceManagement from '../operations/InvoiceManagement';
import PaymentsPage from '../payments/PaymentsPage';
import StaffCatalogView from './StaffCatalogView';

export default function StaffWorkspace({ initialTab = 'dashboard' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || initialTab;

  const handleTabChange = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onNavigate={handleTabChange}
      workspaceRole="staff"
    >
      {currentTab === 'dashboard' && (
        <StaffDashboard onNavigate={handleTabChange} />
      )}
      {currentTab === 'subscriptions' && (
        <SubscriptionManagement
          onInvoiceGenerated={() => handleTabChange('invoices')}
        />
      )}
      {currentTab === 'invoices' && <InvoiceManagement />}
      {currentTab === 'payments' && <PaymentsPage />}
      {currentTab === 'catalog' && <StaffCatalogView />}
    </AppLayout>
  );
}
