import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Complaints from './pages/Complaints';
import ComplaintDetail from './pages/ComplaintDetail';
import Users from './pages/Users';

// Sidebar Navigation Shell for Authenticated users
const AppLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isLinkActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="app-container">
      {/* Fixed Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          PINakee
        </div>

        {/* Current User Info */}
        <div className="sidebar-user">
          <div className="name">{user.first_name} {user.last_name}</div>
          <span className="role-badge">{user.role}</span>
          {user.department && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>{user.department}</div>}
        </div>

        {/* Navigation Menu */}
        <nav className="sidebar-menu">
          <Link to="/" className={`sidebar-link ${isLinkActive('/') ? 'active' : ''}`}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            Dashboard
          </Link>
          
          <Link to="/complaints" className={`sidebar-link ${isLinkActive('/complaints') ? 'active' : ''}`}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            Complaints
          </Link>

          {user.role === 'ADMIN' && (
            <Link to="/users" className={`sidebar-link ${isLinkActive('/users') ? 'active' : ''}`}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              Users
            </Link>
          )}
        </nav>

        {/* Logout Control */}
        <button onClick={logout} className="logout-button">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
          </svg>
          Sign Out
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="header">
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Welcome back,</span>{' '}
            <strong>{user.first_name}!</strong>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            System Time: {new Date().toLocaleDateString()}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};

// Route check: Redirect to Login if unauthenticated
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-container"><h2>Loading session...</h2></div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

// Route check: Redirect Admin-only pages
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-container"><h2>Loading session...</h2></div>;
  }

  if (!user || user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Route check: Redirect authenticated users away from Login page
const GuestRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-container"><h2>Loading session...</h2></div>;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Guest Auth Route */}
          <Route path="/login" element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          } />

          {/* Secure Application Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/complaints" element={
            <ProtectedRoute>
              <Complaints />
            </ProtectedRoute>
          } />

          <Route path="/complaints/:id" element={
            <ProtectedRoute>
              <ComplaintDetail />
            </ProtectedRoute>
          } />

          <Route path="/users" element={
            <ProtectedRoute>
              <AdminRoute>
                <Users />
              </AdminRoute>
            </ProtectedRoute>
          } />

          {/* Fallback routing redirection */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
