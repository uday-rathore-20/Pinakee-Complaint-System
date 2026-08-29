import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider, useSocket } from './context/SocketContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Complaints from './pages/Complaints';
import ComplaintDetail from './pages/ComplaintDetail';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

// In-app Notifications Dropdown Widget
const NotificationWidget = () => {
  const { authFetch } = useAuth();
  const socket = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await authFetch('/notifications?limit=20');
      const result = await res.json();
      if (res.ok && result.success) {
        setNotifications(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await authFetch('/notifications/unread-count');
      const result = await res.json();
      if (res.ok && result.success) {
        setUnreadCount(result.data.count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    const interval = setInterval(() => {
      fetchNotifications();
      fetchUnreadCount();
    }, 30000); // fallback polling at longer intervals

    return () => clearInterval(interval);
  }, []);

  // Listen for real-time notification events
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (newNotif) => {
      setNotifications(prev => {
        // Prevent duplicate entries
        if (prev.some(n => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev].slice(0, 20);
      });
      setUnreadCount(prev => prev + 1);
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      const res = await authFetch('/notifications/mark-all-read', { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      const res = await authFetch(`/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  return (
    <div className="notifications-widget" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="notifications-trigger"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          padding: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-color)'
        }}
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        {unreadCount > 0 && (
          <span className="unread-badge" style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            padding: '0.15rem 0.35rem',
            fontSize: '0.7rem',
            fontWeight: 'bold',
            lineHeight: 1
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notifications-dropdown" style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          width: '320px',
          background: '#fff',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          zIndex: 1000,
          marginTop: '0.5rem',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div className="dropdown-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary-color)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  padding: 0
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="dropdown-list" style={{
            overflowY: 'auto',
            flexGrow: 1
          }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notification-item ${n.is_read ? 'read' : 'unread'}`}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #f1f5f9',
                    background: n.is_read ? '#fff' : '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => {
                    if (!n.is_read) handleMarkRead(n.id);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{
                      fontWeight: n.is_read ? '500' : '600',
                      fontSize: '0.85rem',
                      color: n.is_read ? 'var(--text-color)' : 'var(--primary-dark)'
                    }}>
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--primary-color)',
                        display: 'inline-block'
                      }} />
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    {n.message}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {n.complaint_id && (
                      <Link
                        to={`/complaints/${n.complaint_id}`}
                        onClick={() => setIsOpen(false)}
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--primary-light)',
                          textDecoration: 'none',
                          fontWeight: '500'
                        }}
                      >
                        View Ticket &rarr;
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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

          <Link to="/profile" className={`sidebar-link ${isLinkActive('/profile') ? 'active' : ''}`}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            My Profile
          </Link>

          {(user.role === 'ADMIN' || user.role === 'DEPT_HEAD') && (
            <Link to="/reports" className={`sidebar-link ${isLinkActive('/reports') ? 'active' : ''}`}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"/>
              </svg>
              Reports & Analytics
            </Link>
          )}

          {user.role === 'ADMIN' && (
            <>
              <Link to="/users" className={`sidebar-link ${isLinkActive('/users') ? 'active' : ''}`}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Users
              </Link>
              <Link to="/audit-logs" className={`sidebar-link ${isLinkActive('/audit-logs') ? 'active' : ''}`}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Audit Trails
              </Link>
              <Link to="/settings" className={`sidebar-link ${isLinkActive('/settings') ? 'active' : ''}`}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                System Settings
              </Link>
            </>
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
        <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Welcome back,</span>{' '}
            <strong>{user.first_name}!</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <NotificationWidget />
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              System Time: {new Date().toLocaleDateString()}
            </div>
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

// Route check: Redirect non-staff pages (Admin & Dept Head allowed)
const AdminOrHeadRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-container"><h2>Loading session...</h2></div>;
  }

  if (!user || (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD')) {
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
      <SocketProvider>
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

            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute>
                <AdminOrHeadRoute>
                  <Reports />
                </AdminOrHeadRoute>
              </ProtectedRoute>
            } />

            <Route path="/users" element={
              <ProtectedRoute>
                <AdminRoute>
                  <Users />
                </AdminRoute>
              </ProtectedRoute>
            } />

            <Route path="/audit-logs" element={
              <ProtectedRoute>
                <AdminRoute>
                  <AuditLogs />
                </AdminRoute>
              </ProtectedRoute>
            } />

            <Route path="/settings" element={
              <ProtectedRoute>
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              </ProtectedRoute>
            } />

            {/* Fallback routing redirection */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
