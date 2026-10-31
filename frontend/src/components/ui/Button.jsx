import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const Button = forwardRef(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    loading = false,
    type = 'button',
    icon: Icon,
    ...props
  },
  ref
) {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-lg transition-standard focus:outline-none focus:ring-2 focus:ring-offset-1 select-none disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-[#0E7C86] hover:bg-[#0B656D] text-white focus:ring-[#0E7C86]/40 shadow-sm active:translate-y-[0.5px]',
    secondary:
      'bg-[#F5F7FA] hover:bg-[#EAEFF5] text-[#16233B] border border-[#E2E8F0] focus:ring-slate-300',
    outline:
      'bg-white hover:bg-slate-50 text-[#16233B] border border-slate-300 focus:ring-slate-300 shadow-xs',
    ghost:
      'bg-transparent hover:bg-slate-100 text-[#16233B] focus:ring-slate-300',
    danger:
      'bg-[#C2362F] hover:bg-[#A82B25] text-white focus:ring-[#C2362F]/40 shadow-sm',
    dangerOutline:
      'bg-white hover:bg-red-50 text-[#C2362F] border border-red-200 focus:ring-red-200',
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`${baseStyles} ${sizeStyles[size] || sizeStyles.md} ${variantStyles[variant] || variantStyles.primary} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4 text-current" />
      ) : null}
      {children}
    </button>
  );
});

export default Button;

