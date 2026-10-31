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
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
    loop: 'bg-[#E6F5F6] text-[#0E7C86] border border-[#0E7C86]/20 font-semibold',
    success: 'bg-[#EAF5EE] text-[#2E7D4F] border border-[#2E7D4F]/20 font-medium',
    warning: 'bg-[#FEF7EC] text-[#B7791F] border border-[#B7791F]/20 font-medium',
    danger: 'bg-[#FDEEEE] text-[#C2362F] border border-[#C2362F]/20 font-medium',
    info: 'bg-[#EEF3FD] text-[#3B64C4] border border-[#3B64C4]/20 font-medium',
    outline: 'bg-transparent text-slate-600 border border-slate-300',
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

