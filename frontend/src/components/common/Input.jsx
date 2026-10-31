import React, { useState } from 'react';

export function Input({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  helpText,
  disabled = false,
  required = false,
  autoComplete,
  labelRightAction,
  ...rest
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const inputId = id || name;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;

  return (
    <div className="bl-form-group">
      <div className="bl-label">
        <label htmlFor={inputId}>
          {label} {required && <span style={{ color: 'var(--bl-danger)' }} aria-hidden="true">*</span>}
        </label>
        {labelRightAction}
      </div>

      <div className="bl-input-wrapper">
        <input
          id={inputId}
          name={name}
          type={effectiveType}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          className="bl-input"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helpText ? helpId : undefined}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            className="bl-input-action-btn"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPassword ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#52525b' }}>HIDE</span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#52525b' }}>SHOW</span>
            )}
          </button>
        )}
      </div>

      {error && (
        <div id={errorId} className="bl-input-error" role="alert">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 10.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {!error && helpText && (
        <div id={helpId} className="bl-input-help">
          {helpText}
        </div>
      )}
    </div>
  );
}

