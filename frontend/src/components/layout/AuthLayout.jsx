import React from 'react';
import { BrandLogo } from '../common/BrandLogo';
import { Link } from 'react-router-dom';

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="bl-auth-container">
      <div className="bl-auth-header-logo">
        <Link to="/signin" style={{ textDecoration: 'none' }}>
          <BrandLogo size="lg" />
        </Link>
      </div>

      <div className="bl-auth-card">
        <div className="bl-auth-card-heading">
          <h1 className="bl-auth-title">{title}</h1>
          {subtitle && <p className="bl-auth-subtitle">{subtitle}</p>}
        </div>

        {children}
      </div>

      <footer className="bl-auth-footer-nav">
        <span>© {new Date().getFullYear()} Brightloop Inc.</span>
        <span className="bl-dot">•</span>
        <a href="#privacy" onClick={(e) => e.preventDefault()}>Privacy</a>
        <span className="bl-dot">•</span>
        <a href="#terms" onClick={(e) => e.preventDefault()}>Terms</a>
        <span className="bl-dot">•</span>
        <a href="#support" onClick={(e) => e.preventDefault()}>Contact</a>
      </footer>
    </div>
  );
}
