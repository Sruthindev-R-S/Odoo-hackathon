import React from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export function AuthLayout({ title, subtitle, children }) {
  const { quickSwitchUser, resetDemoData } = useAuth();
  const navigate = useNavigate();

  const handleQuickLogin = async (email, targetPath) => {
    const res = await quickSwitchUser(email);
    if (res.success) {
      navigate(targetPath);
    }
  };

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

      {/* Demo Evaluator Quick Switcher */}
      <div className="bl-demo-strip">
        <div className="bl-demo-strip-title">
          <span>⚡ Evaluator Role Switcher (Pre-seeded Accounts)</span>
          <button
            type="button"
            onClick={resetDemoData}
            className="bl-btn-ghost bl-btn-sm"
            style={{ fontSize: 11, padding: '2px 6px' }}
            title="Restore original seed accounts and state"
          >
            Reset Demo Data
          </button>
        </div>
        <p style={{ color: '#71717a', fontSize: 11, marginBottom: 8 }}>
          Click any persona below to quickly authenticate and test role-specific boundaries:
        </p>
        <div className="bl-demo-btn-group">
          <button
            type="button"
            className="bl-btn bl-btn-secondary bl-btn-sm"
            onClick={() => handleQuickLogin('admin@brightloop.io', '/')}
          >
            👑 Admin (Eleanor)
          </button>
          <button
            type="button"
            className="bl-btn bl-btn-secondary bl-btn-sm"
            onClick={() => handleQuickLogin('marcus@brightloop.io', '/')}
          >
            💼 Staff (Marcus)
          </button>
          <button
            type="button"
            className="bl-btn bl-btn-secondary bl-btn-sm"
            onClick={() => handleQuickLogin('sarah@novasoft.com', '/')}
          >
            🏢 Customer A (NovaSoft)
          </button>
          <button
            type="button"
            className="bl-btn bl-btn-secondary bl-btn-sm"
            onClick={() => handleQuickLogin('david@apexlogistics.com', '/')}
          >
            🚛 Customer B (Apex)
          </button>
        </div>
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

