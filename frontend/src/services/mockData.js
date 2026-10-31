/**
 * Brightloop Initial Mock Data
 * Realistic seed data for small business subscription management
 */

export const INITIAL_USERS = [
  {
    id: 'user_admin_01',
    name: 'Eleanor Vance',
    email: 'admin@brightloop.io',
    password: 'Password123!',
    role: 'admin',
    title: 'Operations Director',
    organization: 'Brightloop HQ',
    createdAt: '2026-01-10T08:00:00Z',
    status: 'active'
  },
  {
    id: 'user_staff_01',
    name: 'Marcus Thorne',
    email: 'marcus@brightloop.io',
    password: 'Password123!',
    role: 'staff',
    title: 'Subscription Operations Lead',
    organization: 'Brightloop Team',
    createdAt: '2026-01-15T09:30:00Z',
    status: 'active'
  },
  {
    id: 'user_staff_02',
    name: 'Elena Rostova',
    email: 'elena@brightloop.io',
    password: 'Password123!',
    role: 'staff',
    title: 'Customer Success Specialist',
    organization: 'Brightloop Team',
    createdAt: '2026-02-01T11:00:00Z',
    status: 'active'
  },
  {
    id: 'user_cust_01',
    name: 'Sarah Lin',
    email: 'sarah@novasoft.com',
    password: 'Password123!',
    role: 'customer',
    customerId: 'cust_novasoft',
    organization: 'NovaSoft Solutions Ltd.',
    businessSize: '12-50 employees',
    createdAt: '2026-01-20T14:15:00Z',
    status: 'active'
  },
  {
    id: 'user_cust_02',
    name: 'David Chen',
    email: 'david@apexlogistics.com',
    password: 'Password123!',
    role: 'customer',
    customerId: 'cust_apex',
    organization: 'Apex Logistics Global',
    businessSize: '50-100 employees',
    createdAt: '2026-02-10T10:00:00Z',
    status: 'active'
  }
];

export const INITIAL_SUBSCRIPTIONS = [
  // NovaSoft Solutions Subscriptions (cust_novasoft)
  {
    id: 'sub_nova_01',
    subscriptionNumber: 'SUB-2026-0041',
    customerId: 'cust_novasoft',
    customerName: 'NovaSoft Solutions Ltd.',
    planName: 'Brightloop Pro Growth',
    interval: 'monthly',
    unitPrice: 299.00,
    quantity: 1,
    amount: 299.00,
    status: 'active',
    startDate: '2026-01-20',
    currentPeriodEnd: '2026-11-20',
    nextBillingDate: '2026-11-20',
    canCloseEarly: true,
    canPause: true,
    canRenew: true,
    lineItems: [
      { name: 'Core Recurring Billing Engine', qty: 1, price: 199.00 },
      { name: 'Automated Invoicing & Dunning', qty: 1, price: 100.00 }
    ]
  },
  {
    id: 'sub_nova_02',
    subscriptionNumber: 'SUB-2026-0089',
    customerId: 'cust_novasoft',
    planName: 'Cloud Document Storage Add-on',
    interval: 'monthly',
    unitPrice: 49.00,
    quantity: 1,
    amount: 49.00,
    status: 'active',
    startDate: '2026-02-01',
    currentPeriodEnd: '2026-11-01',
    nextBillingDate: '2026-11-01',
    canCloseEarly: true,
    canPause: false,
    canRenew: true,
    lineItems: [
      { name: 'Encrypted Storage Tier (50GB)', qty: 1, price: 49.00 }
    ]
  },

  // Apex Logistics Subscriptions (cust_apex)
  {
    id: 'sub_apex_01',
    subscriptionNumber: 'SUB-2026-0012',
    customerId: 'cust_apex',
    customerName: 'Apex Logistics Global',
    planName: 'Enterprise Annual Suite',
    interval: 'yearly',
    unitPrice: 2400.00,
    quantity: 1,
    amount: 2400.00,
    status: 'active',
    startDate: '2025-12-01',
    currentPeriodEnd: '2026-12-01',
    nextBillingDate: '2026-12-01',
    canCloseEarly: false,
    canPause: true,
    canRenew: true,
    lineItems: [
      { name: 'Enterprise Billing & Multi-Currency', qty: 1, price: 2000.00 },
      { name: 'Dedicated API Bandwidth', qty: 1, price: 400.00 }
    ]
  }
];

export const INITIAL_INVOICES = [
  // NovaSoft Invoices
  {
    id: 'inv_nova_104',
    invoiceNumber: 'INV-2026-104',
    customerId: 'cust_novasoft',
    customerName: 'NovaSoft Solutions Ltd.',
    subscriptionNumber: 'SUB-2026-0041',
    date: '2026-10-20',
    dueDate: '2026-11-04',
    amount: 348.00,
    status: 'paid',
    paidAt: '2026-10-21',
    paymentMethod: 'Credit Card (ending 4242)',
    period: 'Oct 20, 2026 - Nov 19, 2026'
  },
  {
    id: 'inv_nova_092',
    invoiceNumber: 'INV-2026-092',
    customerId: 'cust_novasoft',
    customerName: 'NovaSoft Solutions Ltd.',
    subscriptionNumber: 'SUB-2026-0041',
    date: '2026-09-20',
    dueDate: '2026-10-04',
    amount: 348.00,
    status: 'paid',
    paidAt: '2026-09-21',
    paymentMethod: 'Credit Card (ending 4242)',
    period: 'Sep 20, 2026 - Oct 19, 2026'
  },
  {
    id: 'inv_nova_118',
    invoiceNumber: 'INV-2026-118',
    customerId: 'cust_novasoft',
    customerName: 'NovaSoft Solutions Ltd.',
    subscriptionNumber: 'SUB-2026-0041',
    date: '2026-10-31',
    dueDate: '2026-11-14',
    amount: 348.00,
    status: 'outstanding',
    paidAt: null,
    paymentMethod: 'Auto-debit pending',
    period: 'Nov 20, 2026 - Dec 19, 2026'
  },

  // Apex Logistics Invoices
  {
    id: 'inv_apex_003',
    invoiceNumber: 'INV-2025-003',
    customerId: 'cust_apex',
    customerName: 'Apex Logistics Global',
    subscriptionNumber: 'SUB-2026-0012',
    date: '2025-12-01',
    dueDate: '2025-12-15',
    amount: 2400.00,
    status: 'paid',
    paidAt: '2025-12-02',
    paymentMethod: 'Wire Transfer',
    period: 'Dec 01, 2025 - Nov 30, 2026'
  }
];

