import { useState, useEffect, useCallback } from 'react';
import { planService } from '../../api/services/planService';

export function usePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await planService.getPlans();
      setPlans(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch subscription plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const addPlan = async (planData) => {
    const created = await planService.createPlan(planData);
    setPlans((prev) => [created, ...prev]);
    return created;
  };

  const editPlan = async (id, planData) => {
    const updated = await planService.updatePlan(id, planData);
    setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const togglePlanStatus = async (id, active) => {
    const updated = await planService.updatePlanStatus(id, active);
    setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const removePlan = async (id) => {
    await planService.deletePlan(id);
    const refreshed = await planService.getPlans();
    setPlans(refreshed);
    return true;
  };

  return {
    plans,
    loading,
    error,
    fetchPlans,
    addPlan,
    editPlan,
    togglePlanStatus,
    removePlan,
  };
}

