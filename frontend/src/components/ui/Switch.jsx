export default function Switch({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  id,
}) {
  const switchId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="flex flex-col">
        {label && (
          <label
            htmlFor={switchId}
            className="text-sm font-medium text-zinc-900 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
        {description && (
          <span className="text-xs text-zinc-500 leading-relaxed">
            {description}
          </span>
        )}
      </div>

      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
          checked ? 'bg-zinc-900' : 'bg-zinc-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

