import { forwardRef } from 'react';

const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    id,
    type = 'text',
    className = '',
    prefix,
    suffix,
    required = false,
    ...props
  },
  ref
) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-[#16233B] tracking-tight">
          {label} {required && <span className="text-[#C2362F]">*</span>}
        </label>
      )}

      <div className="relative rounded-lg shadow-2xs">
        {prefix && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 text-sm">
            {prefix}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`block w-full rounded-lg border text-sm text-[#16233B] placeholder-slate-400 bg-white transition-standard focus:outline-none focus:ring-2 focus:border-transparent ${
            prefix ? 'pl-8' : 'pl-3'
          } ${suffix ? 'pr-8' : 'pr-3'} py-2 ${
            error
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400 bg-red-50/20'
              : 'border-slate-300 focus:ring-[#0E7C86]/30 focus:border-[#0E7C86]'
          } ${className}`}
          {...props}
        />

        {suffix && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-500 text-sm">
            {suffix}
          </div>
        )}
      </div>

      {error ? (
        <p className="text-xs text-[#C2362F] font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Input;

