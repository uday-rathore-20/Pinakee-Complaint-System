import React from 'react';

/**
 * Enterprise Error Boundary component for PINAKEE Complaint Management System.
 * Catches JavaScript rendering errors in child component trees, logs sanitized
 * diagnostics, and displays a resilient fallback UI with recovery actions.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error: error || new Error('Unknown rendering error')
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log sanitized error diagnostic to console for development/debugging
    // Avoid logging authentication tokens, secrets, or sensitive customer details
    console.error('ErrorBoundary caught rendering error:', {
      message: error?.message || 'Unknown error',
      componentStack: errorInfo?.componentStack ? errorInfo.componentStack.split('\n').slice(0, 5).join('\n') : null
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null
    });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleGoDashboard = () => {
    this.setState({
      hasError: false,
      error: null
    });
    if (window.location.pathname !== '/') {
      window.location.href = '/';
    } else {
      this.handleReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.handleReset })
          : this.props.fallback;
      }

      const isRoot = !this.props.isLayoutLevel;

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: isRoot ? '100vh' : '400px',
            width: '100%',
            padding: '2rem',
            boxSizing: 'border-box',
            backgroundColor: isRoot ? 'var(--bg-color, #f8fafc)' : 'transparent'
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: 'var(--card-bg, #ffffff)',
              borderRadius: 'var(--radius-lg, 10px)',
              border: '1px solid var(--border-color, #e2e8f0)',
              boxShadow: 'var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.07))',
              padding: '2rem',
              textAlign: 'center'
            }}
          >
            {/* Warning / Error Indicator Icon */}
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--danger-bg, #fef2f2)',
                color: 'var(--danger, #ef4444)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem auto'
              }}
            >
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h2
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.25rem',
                fontWeight: '700',
                color: 'var(--text-main, #0f172a)'
              }}
            >
              Something went wrong
            </h2>

            <p
              style={{
                margin: '0 0 1.5rem 0',
                fontSize: '0.9rem',
                color: 'var(--text-muted, #64748b)',
                lineHeight: '1.5'
              }}
            >
              This section could not be displayed correctly. You can try refreshing this view or return to the main dashboard.
            </p>

            {/* Recovery Actions */}
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.2rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer'
                }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={this.handleGoDashboard}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.2rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-md, 6px)',
                  cursor: 'pointer'
                }}
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
