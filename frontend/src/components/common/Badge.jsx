import React from 'react';

export function Badge({ children, variant = 'default', style }) {
  const variantClass = {
    admin: 'bl-badge-admin',
    staff: 'bl-badge-staff',
    customer: 'bl-badge-customer',
    active: 'bl-badge-active',
    paid: 'bl-badge-paid',
    outstanding: 'bl-badge-outstanding',
    default: 'bl-badge-staff'
  }[variant] || 'bl-badge-staff';

  return (
    <span className={`bl-badge ${variantClass}`} style={style}>
      {children}
    </span>
  );
}

