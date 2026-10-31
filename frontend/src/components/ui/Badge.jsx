export default function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  const variantStyles = {
    neutral: 'bg-zinc-100 text-zinc-700 border border-zinc-200',
    loop: 'bg-zinc-900 text-white border border-zinc-900 font-medium',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200 font-medium',
    danger: 'bg-red-50 text-red-700 border border-red-200 font-medium',
    info: 'bg-zinc-100 text-zinc-800 border border-zinc-200 font-medium',
    outline: 'bg-transparent text-zinc-700 border border-zinc-300',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        sizeStyles[size] || sizeStyles.md
      } ${variantStyles[variant] || variantStyles.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

