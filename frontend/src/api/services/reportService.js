import { apiClient, isNetworkOfflineError, getStoredCurrentUser } from '../client.js';

function request(path, query = {}, actorUser = null) {
  const actor = actorUser || getStoredCurrentUser();
  return apiClient.get(path, { actorUser: actor, query });
}

function withOfflineFallback(error) {
  if (!isNetworkOfflineError(error)) throw error;
  return null;
}

export const reportService = {
  async getDashboard(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/dashboard', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },

  async getActiveSubscriptions(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/active-subscriptions', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },

  async getRevenue(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/revenue', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },

  async getPayments(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/payments', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },

  async getOutstandingInvoices(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/outstanding-invoices', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },

  async getOverdueInvoices(filters = {}, actorUser = null) {
    try {
      return await request('/api/reports/overdue-invoices', filters, actorUser);
    } catch (error) {
      return withOfflineFallback(error);
    }
  },
};
