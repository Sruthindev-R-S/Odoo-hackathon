import React from 'react';
import { validatePasswordRules } from '../../services/authService';

export function PasswordChecklist({ password = '', confirmPassword, showConfirmCheck = false }) {
  const rules = validatePasswordRules(password);
  const passwordsMatch = showConfirmCheck && password.length > 0 && password === confirmPassword;

  const items = [
    {
      id: 'rule-length',
      label: 'More than 8 characters (min. 9 characters)',
      valid: rules.hasMinLength
    },
    {
      id: 'rule-upper',
      label: 'At least one uppercase letter (A–Z)',
      valid: rules.hasUppercase
    },
    {
      id: 'rule-lower',
      label: 'At least one lowercase letter (a–z)',
      valid: rules.hasLowercase
    },
    {
      id: 'rule-special',
      label: 'At least one special character (!@#$%^&*...)',
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
    <div
      className="bl-pw-checklist"
      role="region"
      aria-label="Password security requirements"
    >
      <div className="bl-pw-checklist-title">Password Requirements</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <li
            key={item.id}
            id={item.id}
            className={`bl-pw-item ${item.valid ? 'is-valid' : ''}`}
            aria-checked={item.valid}
            role="checkbox"
          >
            <span className="bl-pw-indicator" aria-hidden="true">
              {item.valid ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#a1a1aa' }} />
              )}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

