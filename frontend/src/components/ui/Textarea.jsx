import { forwardRef } from 'react';

const Textarea = forwardRef(function Textarea(
  {
    label,
    error,
    helperText,
    id,
    rows = 3,
    className = '',
    required = false,
    ...props
  },
  ref
) {
  const areaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={areaId} className="block text-xs font-semibold text-zinc-900 tracking-tight">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}

      <div className="relative rounded-lg shadow-2xs">
        <textarea
          ref={ref}
          id={areaId}
          rows={rows}
          className={`block w-full rounded-lg border text-sm text-zinc-900 placeholder-zinc-400 bg-white transition-standard focus:outline-none focus:ring-2 px-3 py-2 ${
            error
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400 bg-red-50/20'
              : 'border-zinc-300 focus:ring-zinc-900/20 focus:border-zinc-900'
          } ${className}`}
          {...props}
        />
      </div>

      {error ? (
        <p className="text-xs text-red-600 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-zinc-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Textarea;

