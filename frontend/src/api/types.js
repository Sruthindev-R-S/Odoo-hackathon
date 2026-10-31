/**
 * Type definitions and constants for Products, Variants, and Subscription Plans.
 */

export const PRODUCT_TYPES = [
  { value: 'standard', label: 'Standard Product' },
  { value: 'software', label: 'Software / SaaS' },
  { value: 'service', label: 'Managed Service' },
  { value: 'addon', label: 'Add-on / Module' },
  { value: 'hardware', label: 'Hardware / Device' },
  { value: 'consumable', label: 'Usage / Consumable' },
];

export const BILLING_PERIODS = [
  { value: 'daily', label: 'Daily', adjectival: 'day' },
  { value: 'weekly', label: 'Weekly', adjectival: 'week' },
  { value: 'monthly', label: 'Monthly', adjectival: 'month' },
  { value: 'yearly', label: 'Yearly', adjectival: 'year' },
];

export const AUTO_CLOSE_POLICIES = [
  { value: 'end_of_term', label: 'End of Term' },
  { value: 'immediate', label: 'Immediate on Expiry' },
  { value: 'none', label: 'None (Manual Close)' },
];

/**
 * Default blank product schema for creation forms.
 */
export const INITIAL_PRODUCT_STATE = {
  name: '',
  type: 'standard',
  salesPrice: '',
  costPrice: '',
  notes: '',
  isActive: true,
  variants: [],
};

/**
 * Default blank variant schema.
 */
export const INITIAL_VARIANT_STATE = {
  attribute: '',
  value: '',
  extraPrice: '',
};

/**
 * Default blank subscription plan schema with the 4 behavioral switches.
 */
export const INITIAL_PLAN_STATE = {
  name: '',
  productId: '',
  price: '',
  billingPeriod: 'monthly',
  minQuantity: 1,
  availableFrom: '',
  availableTo: '',
  autoClose: 'end_of_term',
  // 4 behavior switches
  autoCloseOnEnd: true, // Closes automatically when it ends
  allowEarlyClose: false, // Can be closed early
  allowPause: true, // Can be paused
  allowRenewal: true, // Can be renewed
};
