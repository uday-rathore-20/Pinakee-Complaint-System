import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const rawBase = (import.meta.env.VITE_API_BASE_URL || '/api')
  .trim()
  .replace(/\/+$/, '');

const API_BASE = rawBase.endsWith('/api')
  ? rawBase
  : `${rawBase}/api`;

const Login = () => {
  const [view, setView] = useState('login'); // 'login', 'forgot', 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Load simulator emails log in dev mode
  useEffect(() => {
    let interval;
    if (view === 'forgot' || view === 'reset') {
      const fetchSimulated = async () => {
        try {
          const res = await fetch(`${API_BASE}/auth/simulated-emails`);
          const data = await res.json();
          if (res.ok && data.success) {
            setSimulatedLog(data.logs);
          }
        } catch (e) {
          console.error('Failed to fetch simulated emails:', e);
        }
      };

      fetchSimulated();
      interval = setInterval(fetchSimulated, 3000);
    }
    return () => clearInterval(interval);
  }, [view]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        navigate('/');
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(data.message);
      } else {
        setError(data.message || 'Failed to request password reset.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess('Your password has been reset successfully. Please log in with your new password.');
        setView('login');
        setPassword('');
        setNewPassword('');
        setToken('');
      } else {
        setError(data.message || 'Failed to reset password. Check if the token is valid or expired.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src="/pinakee-logo.png"
            alt="PINakee Tech Solutions LLP"
            className="login-logo-img"
          />
          <p className="login-tagline">
            Enterprise Complaint & Service Management Platform
          </p>
        </div>
        
        {error && (
          <div className="alert alert-danger" style={{ whiteSpace: 'pre-line', marginBottom: '1.25rem' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            <div>{success}</div>
          </div>
        )}

        {view === 'login' && (
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label">Work Email Address</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. admin@pinakee.com"
                  required
                  style={{ paddingLeft: '2.4rem' }}
                />
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/>
                </svg>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Password</label>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600' }}
                  onClick={() => {
                    setView('forgot');
                    setError('');
                    setSuccess('');
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{ paddingLeft: '2.4rem' }}
                />
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
              style={{ padding: '0.7rem 1rem' }}
            >
              {submitting ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotSubmit}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Reset Your Password
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Enter your registered work email. We will send a secure validation code to reset your credentials.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. user@pinakee.com"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
              style={{ marginBottom: '1.25rem' }}
            >
              {submitting ? 'Requesting Code...' : 'Send Recovery Code'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '600' }}
                onClick={() => {
                  setView('login');
                  setError('');
                  setSuccess('');
                }}
              >
                &larr; Back to Sign In
              </button>

              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: '600' }}
                onClick={() => {
                  setView('reset');
                  setError('');
                  setSuccess('');
                }}
              >
                Have a Code? Enter &rarr;
              </button>
            </div>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                Enter Validation Code
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Enter the recovery token and specify your new secure password.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Recovery Token / Code</label>
              <input
                type="text"
                className="form-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste 64-char security token"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
              style={{ marginBottom: '1.25rem' }}
            >
              {submitting ? 'Resetting Password...' : 'Save New Password'}
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.82rem' }}>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: '600' }}
                onClick={() => {
                  setView('forgot');
                  setError('');
                  setSuccess('');
                }}
              >
                &larr; Back to Recovery
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Simulated Mail Logs Panel in Dev Mode */}
      {(view === 'forgot' || view === 'reset') && simulatedLog && (
        <div className="card" style={{ width: '420px', padding: '1rem', background: '#f8fafc', border: '1px dashed #94a3b8', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
              ✉️ Mail Simulator (Dev Tool)
            </span>
            <button
              type="button"
              style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', cursor: 'pointer' }}
              onClick={() => {
                const tokens = simulatedLog.match(/Token:\s*([a-f0-9]{64})/gi);
                if (tokens && tokens.length > 0) {
                  const lastToken = tokens[tokens.length - 1].split('Token:')[1].trim();
                  setToken(lastToken);
                  setView('reset');
                  setSuccess('Code automatically filled from simulator logs!');
                }
              }}
            >
              Auto-fill Code
            </button>
          </div>
          <pre style={{ margin: 0, fontSize: '0.75rem', color: '#334155', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
            {simulatedLog.split('==================================================').reverse().filter(Boolean)[0]?.trim() || 'No recovery emails simulated yet.'}
          </pre>
        </div>
      )}
    </div>
  );
};

export default Login;
