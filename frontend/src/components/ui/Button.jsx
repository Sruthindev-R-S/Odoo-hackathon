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
      'bg-zinc-900 hover:bg-zinc-800 text-white focus:ring-zinc-900/30 shadow-xs active:translate-y-[0.5px]',
    secondary:
      'bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-200 focus:ring-zinc-300 shadow-xs',
    outline:
      'bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 focus:ring-zinc-300 shadow-xs',
    ghost:
      'bg-transparent hover:bg-zinc-100 text-zinc-800 focus:ring-zinc-300',
    danger:
      'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500/30 shadow-xs',
    dangerOutline:
      'bg-white hover:bg-red-50 text-red-600 border border-red-200 focus:ring-red-200',
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

