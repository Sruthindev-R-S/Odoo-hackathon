import React from 'react';
import { BrandLogo } from '../common/BrandLogo';

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="bl-auth-container">
      {/* Website Top Bar */}
      <header style={{ width: '100%', maxWidth: 440, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '0 4px' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#71717a' }}>
          brightloop.io
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#15803d' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#15803d', display: 'inline-block' }} />
          <span>Secure SSL Portal</span>
        </div>
      </header>

      <div className="bl-auth-card">
        <div className="bl-auth-header">
          <BrandLogo size="lg" />
          <h1 className="bl-auth-title">{title}</h1>
          {subtitle && <p className="bl-auth-subtitle">{subtitle}</p>}
        </div>

        {children}
      </div>

      {/* Website Footer */}
      <footer style={{ marginTop: 24, fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>
        <div>© 2026 Brightloop Technologies. All rights reserved.</div>
        <div style={{ marginTop: 4, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <span>Privacy Policy</span>
          <span>•</span>
          <span>Terms of Service</span>
          <span>•</span>
          <span>Security</span>
        </div>
      </footer>
    </div>
  );
}
