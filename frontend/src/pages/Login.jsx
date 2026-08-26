import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

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
    <div className="login-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
      <div className="login-card">
        <h1 className="login-logo">PINakee</h1>
        <p className="login-subtitle">Complaint Management System</p>
        
        {error && <div className="alert alert-danger" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {view === 'login' && (
          <form onSubmit={handleLoginSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. admin@pinakee.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
              style={{ marginBottom: '1rem' }}
            >
              {submitting ? 'Authenticating...' : 'Sign In'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                className="btn-link"
                style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', fontSize: '0.875rem' }}
                onClick={() => {
                  setView('forgot');
                  setError('');
                  setSuccess('');
                }}
              >
                Forgot Password?
              </button>
            </div>
          </form>
        )}

        {view === 'forgot' && (
          <form onSubmit={handleForgotSubmit}>
            <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Reset Your Password</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', textAlign: 'center' }}>
              Enter the email address registered with your account. We will send a secure validation code to reset your password.
            </p>

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
              style={{ marginBottom: '1rem' }}
            >
              {submitting ? 'Requesting Code...' : 'Send Recovery Code'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <button
                type="button"
                className="btn-link"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => {
                  setView('login');
                  setError('');
                  setSuccess('');
                }}
              >
                ← Back to Sign In
              </button>

              <button
                type="button"
                className="btn-link"
                style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer' }}
                onClick={() => {
                  setView('reset');
                  setError('');
                  setSuccess('');
                }}
              >
                Enter Recovery Code →
              </button>
            </div>
          </form>
        )}

        {view === 'reset' && (
          <form onSubmit={handleResetSubmit}>
            <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Enter Validation Code</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', textAlign: 'center' }}>
              Copy the recovery token generated for your email address to set a new password.
            </p>

            <div className="form-group">
              <label className="form-label">Recovery Token / Code</label>
              <input
                type="text"
                className="form-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter 64-char secure token"
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
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={submitting}
              style={{ marginBottom: '1rem' }}
            >
              {submitting ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <button
                type="button"
                className="btn-link"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                onClick={() => {
                  setView('forgot');
                  setError('');
                  setSuccess('');
                }}
              >
                ← Back
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
