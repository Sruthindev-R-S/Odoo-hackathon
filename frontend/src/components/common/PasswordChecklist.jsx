import React from 'react';
import { validatePasswordRules } from '../../services/authService';

export function PasswordChecklist({ password = '', confirmPassword, showConfirmCheck = false }) {
  const rules = validatePasswordRules(password);
  const passwordsMatch = showConfirmCheck && password.length > 0 && password === confirmPassword;

  const items = [
    {
      id: 'rule-length',
      label: 'At least 8 characters',
      valid: rules.hasMinLength
    },
    {
      id: 'rule-upper',
      label: 'One uppercase letter',
      valid: rules.hasUppercase
    },
    {
      id: 'rule-lower',
      label: 'One lowercase letter',
      valid: rules.hasLowercase
    },
    {
      id: 'rule-special',
      label: 'One special character (!@#$%^&*)',
      valid: rules.hasSpecial
    }
  ];

  if (showConfirmCheck && confirmPassword !== undefined) {
    items.push({
      id: 'rule-match',
      label: 'Passwords match',
      valid: Boolean(passwordsMatch)
    });
  }

  return (
    <div className="bl-pw-checklist" role="region" aria-label="Password security requirements">
      <div className="bl-pw-checklist-grid">
        {items.map((item) => (
          <div
            key={item.id}
            className={`bl-pw-item ${item.valid ? 'is-valid' : ''}`}
            aria-checked={item.valid}
            role="checkbox"
          >
            <span className="bl-pw-icon" aria-hidden="true">
              {item.valid ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                </svg>
              ) : (
                <span className="bl-pw-dot" />
              )}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
