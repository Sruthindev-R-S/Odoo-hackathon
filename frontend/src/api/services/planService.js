/**
 * Subscription Plan Service Layer
 * 
 * Provides a clean abstraction for Subscription Plan management.
 * Starts completely empty with zero dummy/mock data.
 * 
 * To connect to the real backend API later:
 * Simply replace the internal storage calls with your backend endpoints:
 *   e.g. return apiClient.get('/api/plans')
 */

const STORAGE_KEY = 'brightloop_plans';

function getStoredPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredPlans(plans) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (err) {
    console.error('Failed to persist plans to storage', err);
  }
}

export const planService = {
  /**
   * Fetch all subscription plans.
   * @returns {Promise<Array>} List of subscription plans
   */
  async getPlans() {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return getStoredPlans();
  },

  /**
   * Fetch a single plan by ID.
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async getPlanById(id) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const plans = getStoredPlans();
    return plans.find((p) => p.id === id) || null;
  },

  /**
   * Create a new subscription plan.
   * @param {Object} planData 
   * @returns {Promise<Object>} Created plan
   */
  async createPlan(planData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const plans = getStoredPlans();

    const newPlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: planData.name.trim(),
      productId: planData.productId,
      productName: planData.productName || '',
      price: Number(planData.price) || 0,
      billingPeriod: planData.billingPeriod || 'monthly',
      minQuantity: Number(planData.minQuantity) || 1,
      availableFrom: planData.availableFrom || null,
      availableTo: planData.availableTo || null,
      // 4 behavior switches
      autoCloseOnEnd: Boolean(planData.autoCloseOnEnd),
      allowEarlyClose: Boolean(planData.allowEarlyClose),
      allowPause: Boolean(planData.allowPause),
      allowRenewal: Boolean(planData.allowRenewal),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    plans.unshift(newPlan);
    setStoredPlans(plans);
    return newPlan;
  },

  /**
   * Update an existing plan.
   * @param {string} id 
   * @param {Object} planData 
   * @returns {Promise<Object>} Updated plan
   */
  async updatePlan(id, planData) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const plans = getStoredPlans();
    const index = plans.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Plan with ID "${id}" not found.`);
    }

    const updated = {
      ...plans[index],
      name: planData.name !== undefined ? planData.name.trim() : plans[index].name,
      productId: planData.productId !== undefined ? planData.productId : plans[index].productId,
      productName: planData.productName !== undefined ? planData.productName : plans[index].productName,
      price: planData.price !== undefined ? Number(planData.price) : plans[index].price,
      billingPeriod: planData.billingPeriod !== undefined ? planData.billingPeriod : plans[index].billingPeriod,
      minQuantity: planData.minQuantity !== undefined ? Number(planData.minQuantity) : plans[index].minQuantity,
      availableFrom: planData.availableFrom !== undefined ? planData.availableFrom : plans[index].availableFrom,
      availableTo: planData.availableTo !== undefined ? planData.availableTo : plans[index].availableTo,
      autoCloseOnEnd: planData.autoCloseOnEnd !== undefined ? Boolean(planData.autoCloseOnEnd) : plans[index].autoCloseOnEnd,
      allowEarlyClose: planData.allowEarlyClose !== undefined ? Boolean(planData.allowEarlyClose) : plans[index].allowEarlyClose,
      allowPause: planData.allowPause !== undefined ? Boolean(planData.allowPause) : plans[index].allowPause,
      allowRenewal: planData.allowRenewal !== undefined ? Boolean(planData.allowRenewal) : plans[index].allowRenewal,
      updatedAt: new Date().toISOString(),
    };

    plans[index] = updated;
    setStoredPlans(plans);
    return updated;
  },

  /**
   * Delete a plan by ID.
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async deletePlan(id) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const plans = getStoredPlans();
    const filtered = plans.filter((p) => p.id !== id);

    if (filtered.length === plans.length) {
      throw new Error(`Plan with ID "${id}" not found.`);
    }

    setStoredPlans(filtered);
    return true;
  },
};

