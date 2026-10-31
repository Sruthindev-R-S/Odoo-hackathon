import React from 'react';

export function BrandLogo({ size = 'md', showBadge = true }) {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: isLarge ? 10 : 8, userSelect: 'none' }}>
      <svg
        width={isLarge ? 32 : isSmall ? 22 : 26}
        height={isLarge ? 32 : isSmall ? 22 : 26}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Minimal continuous loop */}
        <circle cx="16" cy="16" r="13" stroke="#09090b" strokeWidth="2.5" />
        <path
          d="M10 16C10 12.6863 12.6863 10 16 10C19.3137 10 22 12.6863 22 16C22 19.3137 19.3137 22 16 22"
          stroke="#09090b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Subtle warm accent point */}
        <circle cx="16" cy="16" r="2.5" fill="#ea580c" />
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            fontSize: isLarge ? 20 : isSmall ? 14 : 17,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#09090b'
          }}
        >
          Brightloop
        </span>
        {showBadge && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: '#f4f4f5',
              color: '#52525b',
              border: '1px solid #e4e4e7',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}
          >
            Portal
          </span>
        )}
      </div>
    </div>
  );
}

