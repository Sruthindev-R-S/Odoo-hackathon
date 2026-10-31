/**
 * Pure formatting helpers for currency, numbers, and dates.
 * Enforces tabular numerals and consistent currency representations.
 */

/**
 * Format monetary amount with standard currency symbol (default INR ₹).
 * @param {number|string} amount 
 * @param {string} currency 
 * @returns {string}
 */
export function formatMoney(amount, currency = 'INR') {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return '₹0.00';

  // Standard formatting for Indian Rupee or specified currency
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Format percentage (e.g. margin)
 * @param {number|string} value 
 * @returns {string}
 */
export function formatPercent(value) {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(1)}%`;
}

/**
 * Calculate gross profit and margin percentage from sales and cost prices.
 * @param {number} salesPrice 
 * @param {number} costPrice 
 * @returns {{ profit: number, marginPercent: number }}
 */
export function calculateMargin(salesPrice, costPrice) {
  const sales = Number(salesPrice) || 0;
  const cost = Number(costPrice) || 0;
  const profit = sales - cost;
  const marginPercent = sales > 0 ? (profit / sales) * 100 : 0;
  return { profit, marginPercent };
}

/**
 * Format ISO date string into readable human date (e.g. "Oct 31, 2026")
 * @param {string} dateString 
 * @returns {string}
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Determine plan availability state given start and end dates.
 * @param {string} fromDate 
 * @param {string} toDate 
 * @returns {'active'|'upcoming'|'expired'}
 */
export function getPlanAvailability(fromDate, toDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    if (today < from) return 'upcoming';
  }

  if (toDate) {
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    if (today > to) return 'expired';
  }

  return 'active';
}

/**
 * Calculate due date status relative to today.
 * @param {string} dueDateString 
 * @returns {{ label: string, isOverdue: boolean, days: number }}
 */
export function getDueStatus(dueDateString) {
  if (!dueDateString) return { label: 'No due date', isOverdue: false, days: 0 };
  const due = new Date(dueDateString);
  const now = new Date();
  const d1 = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const d2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return { label: `${days} day${days > 1 ? 's' : ''} overdue`, isOverdue: true, days };
  } else if (diffDays === 0) {
    return { label: 'Due today', isOverdue: false, days: 0 };
  } else {
    return { label: `Due in ${diffDays} day${diffDays > 1 ? 's' : ''}`, isOverdue: false, days: diffDays };
  }
}


