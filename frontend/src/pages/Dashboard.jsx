import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { user, authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsRes, activityRes] = await Promise.all([
          authFetch('/dashboard/stats'),
          authFetch('/dashboard/activity')
        ]);
        
        const statsResult = await statsRes.json();
        const activityResult = await activityRes.json();

        if (statsResult.success) setStats(statsResult.data);
        if (activityResult.success) setActivity(activityResult.data);
      } catch (err) {
        setError('Failed to load dashboard metrics. Check server connectivity.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
          <p style={{ fontWeight: '600' }}>Loading dashboard metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  const summary = stats?.summary || {};
  const byPriority = stats?.by_priority || {};
  const byCategory = stats?.by_category || {};

  return (
    <div className="page-container">
      {/* Top Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>
            {user?.role === 'CUSTOMER' ? 'Customer Support Overview' :
             user?.role === 'ENGINEER' ? 'Field Engineering Workspace' :
             'Operations Dashboard'}
          </h1>
          <p>Real-time telemetry and service request metrics</p>
        </div>

        <div>
          {user?.role === 'CUSTOMER' ? (
            <Link to="/complaints" className="btn btn-primary">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              File New Complaint
            </Link>
          ) : (
            <Link to="/complaints" className="btn btn-secondary">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              View Ticket Queue
            </Link>
          )}
        </div>
      </div>

      {/* Unassigned Queue Banner for Admin */}
      {user && (user.role === 'ADMIN' || user.role === 'DEPT_HEAD') && stats?.unassigned_department_tickets > 0 && (
        <div className="alert alert-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', padding: '0.9rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, color: 'var(--brand-cyan)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <strong>Unassigned Queue Notice:</strong> There are <strong>{stats.unassigned_department_tickets}</strong> unassigned complaints waiting for engineer assignment.
            </div>
          </div>
          <Link to="/complaints" className="btn btn-sm btn-secondary" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Assign Tickets &rarr;
          </Link>
        </div>
      )}

      {/* Claim Required Banner for Engineers */}
      {user && (user.role === 'ENGINEER' || user.role === 'AGENT') && stats?.claim_required_tickets > 0 && (
        <div className="alert alert-warning" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', padding: '0.9rem 1.25rem', backgroundColor: '#eff6ff', borderColor: 'var(--brand-cyan)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, color: 'var(--brand-cyan)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <strong>Action Required:</strong> You have <strong>{stats.claim_required_tickets}</strong> assigned complaint(s) waiting to be claimed.
            </div>
          </div>
          <Link to="/complaints" className="btn btn-sm btn-primary" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Claim Assigned Tickets &rarr;
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="dashboard-grid">
        <div className="stat-card border-total">
          <div className="label">
            <span>Total Logged</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" color="var(--text-muted)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div className="value">{summary.total || 0}</div>
          <div className="subtext">All time complaints</div>
        </div>

        <div className="stat-card border-pending">
          <div className="label">
            <span>Pending Review</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" color="var(--warning)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div className="value">{summary.pending || 0}</div>
          <div className="subtext">Awaiting initial action</div>
        </div>

        <div className="stat-card border-in-progress">
          <div className="label">
            <span>In Progress</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" color="var(--primary-color)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div className="value">{summary.in_progress || 0}</div>
          <div className="subtext">Currently being handled</div>
        </div>

        <div className="stat-card border-resolved">
          <div className="label">
            <span>Resolved</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" color="var(--success)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div className="value">{summary.resolved || 0}</div>
          <div className="subtext">Completed resolutions</div>
        </div>

        <div className="stat-card border-closed">
          <div className="label">
            <span>Closed</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" color="#475569">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div className="value">{summary.closed || 0}</div>
          <div className="subtext">Archived & confirmed</div>
        </div>
      </div>

      {/* Main Section Grid */}
      <div className="section-grid">
        {/* Left Column: Recent Activity Feed */}
        <div className="card">
          <div className="card-header">
            <h3>Recent Activity Feed</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
              Live System Telemetry
            </span>
          </div>

          {activity.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              No recent activity recorded.
            </div>
          ) : (
            <ul className="activity-list">
              {activity.map((item, index) => {
                const formattedTime = new Date(item.timestamp).toLocaleString();
                const userName = `${item.first_name || 'System'} ${item.last_name || ''}`;
                
                return (
                  <li key={index} className="activity-item">
                    {item.activity_type === 'status_change' ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{userName}</span>
                          <span className="badge badge-low" style={{ fontSize: '0.68rem' }}>{item.role}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>updated ticket</span>
                          <Link
                            to={`/complaints/${item.complaint_id}`}
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              color: 'var(--primary-color)',
                              textDecoration: 'none',
                              backgroundColor: 'var(--bg-subtle)',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            {item.ticket_number}
                          </Link>
                        </div>
                        <div style={{ marginTop: '0.25rem', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                          Status changed: <strong style={{ color: 'var(--primary-color)' }}>{item.description}</strong>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>{userName}</span>
                          <span className="badge badge-low" style={{ fontSize: '0.68rem' }}>{item.role}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>commented on</span>
                          <Link
                            to={`/complaints/${item.complaint_id}`}
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              color: 'var(--primary-color)',
                              textDecoration: 'none',
                              backgroundColor: 'var(--bg-subtle)',
                              padding: '0.1rem 0.35rem',
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            {item.ticket_number}
                          </Link>
                          {item.is_internal && (
                            <span className="badge badge-critical" style={{ fontSize: '0.65rem' }}>
                              Internal Note
                            </span>
                          )}
                        </div>
                        <div style={{
                          marginTop: '0.35rem',
                          background: item.is_internal ? 'var(--danger-bg)' : 'var(--bg-subtle)',
                          padding: '0.55rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          borderLeft: item.is_internal ? '3px solid var(--danger)' : '3px solid var(--border-color)',
                          fontSize: '0.84rem',
                          color: 'var(--text-main)'
                        }}>
                          "{item.description}"
                        </div>
                      </div>
                    )}
                    <div className="activity-time">
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      {formattedTime}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right Column: Velocity & Breakdown Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Average Resolution Time Card */}
          <div className="card" style={{ background: 'linear-gradient(135deg, var(--brand-navy) 0%, var(--brand-navy-light) 100%)', color: '#fff', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--brand-cyan)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Service Velocity (MTTR)
              </span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--brand-cyan)' }} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.03em', lineHeight: 1.1, color: '#fff' }}>
              {stats?.average_resolution_hours ? stats.average_resolution_hours.toFixed(1) : '0.0'}
              <span style={{ fontSize: '1rem', fontWeight: '500', color: '#94a3b8', marginLeft: '0.35rem' }}>hours</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.78rem', marginTop: '0.5rem' }}>
              Average duration elapsed from creation to ticket resolution.
            </p>
          </div>

          {/* Priority Breakdown Card */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Severity Distribution</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {Object.entries(byPriority).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No data available</div>
              ) : (
                Object.entries(byPriority).map(([pri, val]) => {
                  const badgeClass = pri.toLowerCase() === 'critical' ? 'badge-critical' :
                                     pri.toLowerCase() === 'high' ? 'badge-high' :
                                     pri.toLowerCase() === 'medium' ? 'badge-medium' : 'badge-low';
                  return (
                    <div key={pri} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className={`badge ${badgeClass}`}>{pri}</span>
                      <span style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>{val}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Category Breakdown Card */}
          <div className="card">
            <div className="card-header" style={{ marginBottom: '1rem', paddingBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem' }}>Tickets by Category</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {Object.entries(byCategory).length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No category data available</div>
              ) : (
                Object.entries(byCategory).map(([cat, val]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-color)', fontWeight: '500' }}>
                      {cat.replace(/_/g, ' ')}
                    </span>
                    <span style={{
                      fontWeight: '700',
                      padding: '0.15rem 0.5rem',
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-color)',
                      fontSize: '0.78rem'
                    }}>
                      {val}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
