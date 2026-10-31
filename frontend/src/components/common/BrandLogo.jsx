import React from 'react';

export function BrandLogo({ size = 'md' }) {
  const isLarge = size === 'lg';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
      <svg
        width={isLarge ? 30 : 24}
        height={isLarge ? 30 : 24}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="24" height="24" rx="6" fill="#0f172a" />
        <path
          d="M7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17C10.5 17 9.5 16 9 15"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2" fill="#f97316" />
      </svg>
      <span
        style={{
          fontSize: isLarge ? 20 : 17,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          color: '#0f172a',
          fontFamily: 'inherit'
        }}
      >
        Brightloop
      </span>
    </div>
  );
}
