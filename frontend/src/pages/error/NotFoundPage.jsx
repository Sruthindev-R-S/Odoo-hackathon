import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', textAlign: 'center', padding: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>404 – Page Not Found</h1>
      <p style={{ fontSize: 14, color: '#52525b', maxWidth: 400, marginBottom: 24 }}>
        The page you are trying to visit does not exist or has been relocated.
      </p>
      <Link to="/" className="bl-btn bl-btn-primary" style={{ textDecoration: 'none' }}>
        Back to Home
      </Link>
    </div>
  );
}

