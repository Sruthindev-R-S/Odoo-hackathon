import { useSearchParams } from 'react-router-dom';
import AppLayout from '../../layouts/AppLayout';
import AdminDashboard from './AdminDashboard';
import ProductManagement from '../products/ProductManagement';
import PlanManagement from '../plans/PlanManagement';
import CustomerBillingPage from '../billing/CustomerBillingPage';

export default function AdminWorkspace({ initialTab = 'dashboard' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || initialTab;

  const handleTabChange = (tabId) => {
    setSearchParams({ tab: tabId });
  };

  return (
    <AppLayout currentTab={currentTab} onNavigate={handleTabChange}>
      {currentTab === 'dashboard' && (
        <AdminDashboard onNavigate={handleTabChange} />
      )}
      {currentTab === 'products' && <ProductManagement />}
      {currentTab === 'plans' && <PlanManagement />}
      {currentTab === 'billing' && <CustomerBillingPage />}
    </AppLayout>
  );
}
