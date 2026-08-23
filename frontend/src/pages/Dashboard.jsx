import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Dashboard = () => {
  const { authFetch } = useAuth();
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
    return <div className="page-container"><h2>Loading dashboard...</h2></div>;
  }

  if (error) {
    return <div className="page-container"><div className="alert alert-danger">{error}</div></div>;
  }

  const summary = stats?.summary || {};
  const byPriority = stats?.by_priority || {};
  const byCategory = stats?.by_category || {};

  return (
    <div className="page-container">
      <h1 style={{ marginBottom: '1.5rem' }}>Dashboard Overview</h1>

      {/* Stats Summary Cards */}
      <div className="dashboard-grid">
        <div className="card stat-card border-total">
          <div className="label">Total Complaints</div>
          <div className="value">{summary.total || 0}</div>
        </div>
        <div className="card stat-card border-pending">
          <div className="label">Pending</div>
          <div className="value">{summary.pending || 0}</div>
        </div>
        <div className="card stat-card border-in-progress">
          <div className="label">In Progress</div>
          <div className="value">{summary.in_progress || 0}</div>
        </div>
        <div className="card stat-card border-resolved">
          <div className="label">Resolved</div>
          <div className="value">{summary.resolved || 0}</div>
        </div>
        <div className="card stat-card border-closed">
          <div className="label">Closed</div>
          <div className="value">{summary.closed || 0}</div>
        </div>
      </div>

      <div className="section-grid">
        {/* Recent Activity Feed */}
        <div className="card">
          <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            Recent Activity Feed
          </h2>
          {activity.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No recent activity to report.</p>
          ) : (
            <ul className="activity-list">
              {activity.map((item, index) => {
                const formattedTime = new Date(item.timestamp).toLocaleString();
                const userName = `${item.first_name || 'System'} ${item.last_name || ''}`;
                
                return (
                  <li key={index} className="activity-item">
                    {item.activity_type === 'status_change' ? (
                      <div>
                        <strong>{userName}</strong> ({item.role}) updated ticket{' '}
                        <code style={{ background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                          {item.ticket_number}
                        </code>
                        : <span style={{ color: 'var(--primary-light)', fontWeight: 'bold' }}>{item.description}</span>
                      </div>
                    ) : (
                      <div>
                        <strong>{userName}</strong> ({item.role}) commented on{' '}
                        <code style={{ background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                          {item.ticket_number}
                        </code>
                        :
                        {item.is_internal && (
                          <span className="badge badge-critical" style={{ marginLeft: '0.5rem', transform: 'scale(0.85)' }}>
                            Internal
                          </span>
                        )}
                        <p style={{ marginTop: '0.25rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #cbd5e1' }}>
                          "{item.description}"
                        </p>
                      </div>
                    )}
                    <div className="activity-time">{formattedTime}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Side Panel: Metrics & Performance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Average Resolution Time */}
          <div className="card" style={{ textAlign: 'center' }}>
            <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              Average Resolution Time
            </h3>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--primary-color)' }}>
              {stats?.average_resolution_hours ? stats.average_resolution_hours.toFixed(1) : '0.0'}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Hours elapsed before resolution
            </p>
          </div>

          {/* Breakdown lists */}
          <div className="card">
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
              Tickets by Priority
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(byPriority).map(([pri, val]) => (
                <li key={pri} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ textTransform: 'capitalize' }}>{pri}</span>
                  <span style={{ fontWeight: 'bold' }}>{val}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Breakdown categories */}
          <div className="card">
            <h3 style={{ marginBottom: '0.75rem', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
              Tickets by Category
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(byCategory).map(([cat, val]) => (
                <li key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ textTransform: 'capitalize' }}>{cat.replace(/_/g, ' ')}</span>
                  <span style={{ fontWeight: 'bold' }}>{val}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
