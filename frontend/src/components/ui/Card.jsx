export default function Card({ children, className = '', hoverable = false, ...props }) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-2xs ${
        hoverable ? 'hover:shadow-sm hover:border-slate-300 transition-standard' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

