/**
 * Role-based permission checks for Brightloop.
 * Roles: Admin, Staff, Customer
 */

export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  CUSTOMER: 'customer',
};

/**
 * Check if the user has admin privileges.
 * @param {Object} user 
 * @returns {boolean}
 */
export function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

/**
 * Check if the user can manage products and plans.
 * Only Admins have write permissions for products and plans.
 * Staff have view-only access.
 * @param {Object} user 
 * @returns {boolean}
 */
export function canManageCatalog(user) {
  return user?.role === ROLES.ADMIN;
}

/**
 * Check if the user can view the catalog.
 * @param {Object} user 
 * @returns {boolean}
 */
export function canViewCatalog(user) {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.STAFF;
}

