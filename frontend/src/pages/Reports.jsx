import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Reports = () => {
  const { user, authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState('performance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Reporting states
  const [statusStats, setStatusStats] = useState([]);
  const [priorityStats, setPriorityStats] = useState([]);
  const [departmentStats, setDepartmentStats] = useState([]);
  const [trends, setTrends] = useState([]);
  const [slaMetrics, setSlaMetrics] = useState(null);
  const [csatMetrics, setCsatMetrics] = useState(null);

  // CSV download states
  const [exportError, setExportError] = useState('');

  const fetchReportsData = async () => {
    setLoading(true);
    setError('');
    try {
      const endpoints = [
        authFetch('/reports/tickets-by-status'),
        authFetch('/reports/tickets-by-priority'),
        authFetch('/reports/tickets-by-department'),
        authFetch('/reports/ticket-trends'),
        authFetch('/reports/sla-compliance'),
        authFetch('/reports/csat-metrics')
      ];

      const [statusRes, priorityRes, deptRes, trendsRes, slaRes, csatRes] = await Promise.all(endpoints);

      const statusData = await statusRes.json();
      const priorityData = await priorityRes.json();
      const deptData = await deptRes.json();
      const trendsData = await trendsRes.json();
      const slaData = await slaRes.json();
      const csatData = await csatRes.json();

      if (statusData.success) setStatusStats(statusData.data);
      if (priorityData.success) setPriorityStats(priorityData.data);
      if (deptData.success) setDepartmentStats(deptData.data);
      if (trendsData.success) setTrends(trendsData.data);
      if (slaData.success) setSlaMetrics(slaData.data);
      if (csatData.success) setCsatMetrics(csatData.data);

    } catch (err) {
      console.error(err);
      setError('Failed to retrieve reports aggregates. Check server status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  const handleExportComplaintsCSV = async () => {
    setExportError('');
    try {
      const res = await authFetch('/complaints/export');
      if (!res.ok) throw new Error('Complaints export forbidden or failed.');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `complaints_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setExportError(err.message || 'Failed to download complaints log.');
    }
  };

  const handleExportUsersCSV = async () => {
    setExportError('');
    try {
      const res = await authFetch('/users/export');
      if (!res.ok) throw new Error('Users export forbidden or failed.');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `users_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setExportError(err.message || 'Failed to download users log.');
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2>Loading Reports & Analytics Dashboard...</h2>
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

  // Draw trend graph variables
  const maxTrendVal = trends.length > 0 ? Math.max(...trends.map(t => t.count), 1) : 1;
  const graphWidth = 500;
  const graphHeight = 150;
  const points = trends.map((t, i) => {
    const x = trends.length > 1 ? (i / (trends.length - 1)) * graphWidth : 0;
    const y = graphHeight - 20 - (t.count / maxTrendVal) * (graphHeight - 40);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Reporting & Analytics Hub</h1>
          <p>
            System-wide SLA compliance rates, customer CSAT satisfaction metrics, and volume trend telemetry
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchReportsData}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Refresh Data
        </button>
      </div>

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '1.75rem', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('performance')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.65rem 1rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            color: activeTab === 'performance' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'performance' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Performance & SLAs
        </button>
        <button
          onClick={() => setActiveTab('breakdown')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.65rem 1rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600',
            color: activeTab === 'breakdown' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'breakdown' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Volume & Breakdowns
        </button>
        {user && user.role === 'ADMIN' && (
          <button
            onClick={() => setActiveTab('exports')}
            style={{
              background: 'none',
              border: 'none',
              padding: '0.65rem 1rem',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              color: activeTab === 'exports' ? 'var(--primary-color)' : 'var(--text-muted)',
              borderBottom: activeTab === 'exports' ? '3px solid var(--primary-color)' : '3px solid transparent',
              marginBottom: '-2px'
            }}
          >
            CSV Export Center
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Stats Ribbon */}
          <div className="dashboard-grid">
            <div className="card stat-card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div className="label">SLA Compliance Rate</div>
              <div className="value" style={{ color: '#3b82f6' }}>
                {slaMetrics?.compliance_rate !== undefined ? `${slaMetrics.compliance_rate}%` : '100%'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Target: &gt; 90%
              </div>
            </div>
            <div className="card stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="label">SLA Breaches</div>
              <div className="value" style={{ color: '#ef4444' }}>
                {slaMetrics?.breached_count || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Out of {slaMetrics?.total_complaints || 0} complaints
              </div>
            </div>
            <div className="card stat-card" style={{ borderLeft: '4px solid #b91c1c' }}>
              <div className="label">Active Escalations</div>
              <div className="value" style={{ color: '#b91c1c' }}>
                {slaMetrics?.escalated_count || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Reassigned to managers
              </div>
            </div>
            <div className="card stat-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="label">Avg Assignment Time</div>
              <div className="value" style={{ color: '#10b981' }}>
                {slaMetrics?.avg_assignment_hours ? `${slaMetrics.avg_assignment_hours.toFixed(1)}h` : '0.0h'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Time elapsed before routing
              </div>
            </div>
            <div className="card stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="label">Avg Resolution Speed</div>
              <div className="value" style={{ color: '#f59e0b' }}>
                {slaMetrics?.avg_resolution_hours ? `${slaMetrics.avg_resolution_hours.toFixed(1)}h` : '0.0h'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Hours from creation to resolution
              </div>
            </div>
            <div className="card stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div className="label">Customer CSAT Score</div>
              <div className="value" style={{ color: '#8b5cf6' }}>
                {csatMetrics?.avg_rating ? `${csatMetrics.avg_rating.toFixed(2)} ★` : '—'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Feedback Rate: {csatMetrics?.feedback_rate !== undefined ? `${csatMetrics.feedback_rate}%` : '0%'}
              </div>
            </div>
          </div>

          {/* Registration Trends Graph */}
          <div className="card">
            <h2 style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Ticket Volume Trends (Last 30 Days)
            </h2>
            {trends.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No trend telemetry logs found.</p>
            ) : (
              <div>
                <div style={{ position: 'relative', width: '100%', height: '170px' }}>
                  <svg viewBox={`0 0 ${graphWidth} ${graphHeight}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    {/* SVG Grid lines */}
                    <line x1="0" y1="20" x2={graphWidth} y2="20" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="0" y1="65" x2={graphWidth} y2="65" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="0" y1="110" x2={graphWidth} y2="110" stroke="#f1f5f9" strokeWidth="1" />
                    <line x1="0" y1={graphHeight - 20} x2={graphWidth} y2={graphHeight - 20} stroke="#cbd5e1" strokeWidth="1.5" />

                    {/* Polyline path */}
                    <polyline
                      fill="none"
                      stroke="var(--primary-color)"
                      strokeWidth="2.5"
                      points={points}
                    />

                    {/* Interactive nodes */}
                    {trends.map((t, i) => {
                      const x = trends.length > 1 ? (i / (trends.length - 1)) * graphWidth : 0;
                      const y = graphHeight - 20 - (t.count / maxTrendVal) * (graphHeight - 40);
                      return (
                        <g key={i}>
                          <circle
                            cx={x}
                            cy={y}
                            r="4.5"
                            fill="#fff"
                            stroke="var(--primary-color)"
                            strokeWidth="2"
                          />
                          {t.count > 0 && (
                            <text
                              x={x}
                              y={y - 8}
                              fontSize="9"
                              fontWeight="bold"
                              fill="var(--text-color)"
                              textAnchor="middle"
                            >
                              {t.count}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', padding: '0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>{new Date(trends[0]?.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span>Timeline</span>
                  <span>{new Date(trends[trends.length - 1]?.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'breakdown' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

          {/* Priority Breakdowns */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              Breakdown by Priority
            </h3>
            {priorityStats.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No statistics recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {priorityStats.map((item, index) => {
                  const maxVal = Math.max(...priorityStats.map(p => p.count), 1);
                  const percentage = ((item.count / maxVal) * 100).toFixed(0);
                  const priorityClass = item.priority.toLowerCase();

                  return (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: '600' }} className={`badge badge-${priorityClass}`}>{item.priority}</span>
                        <strong style={{ color: 'var(--text-muted)' }}>{item.count} tickets</strong>
                      </div>
                      <div style={{ background: '#f1f5f9', height: '1.5rem', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        <div
                          style={{
                            background: priorityClass === 'critical' ? '#ef4444' : priorityClass === 'high' ? '#f59e0b' : '#3b82f6',
                            height: '100%',
                            width: `${percentage}%`,
                            transition: 'width 0.4s ease-in-out'
                          }}
                        />
                        <span style={{ position: 'absolute', right: '0.5rem', top: '0.2rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status Breakdowns */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              Breakdown by Status
            </h3>
            {statusStats.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No statistics recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {statusStats.map((item, index) => {
                  const maxVal = Math.max(...statusStats.map(s => s.count), 1);
                  const percentage = ((item.count / maxVal) * 100).toFixed(0);
                  const statusClass = item.status.toLowerCase().replace(/ /g, '-');

                  return (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: '600' }} className={`badge badge-${statusClass}`}>{item.status}</span>
                        <strong style={{ color: 'var(--text-muted)' }}>{item.count} tickets</strong>
                      </div>
                      <div style={{ background: '#f1f5f9', height: '1.5rem', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                        <div
                          style={{
                            background: 'var(--primary-light)',
                            height: '100%',
                            width: `${percentage}%`,
                            transition: 'width 0.4s ease-in-out'
                          }}
                        />
                        <span style={{ position: 'absolute', right: '0.5rem', top: '0.2rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customer Satisfaction Rating Distribution */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
              Satisfaction Ratings Distribution
            </h3>
            {!csatMetrics || csatMetrics.feedback_count === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No feedback ratings collected yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[5, 4, 3, 2, 1].map((ratingVal) => {
                  const ratingCount = csatMetrics.distribution[ratingVal] || 0;
                  const maxCount = Math.max(...Object.values(csatMetrics.distribution), 1);
                  const percentage = ((ratingCount / maxCount) * 100).toFixed(0);

                  return (
                    <div key={ratingVal} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
                      <span style={{ minWidth: '48px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
                        {ratingVal} ★
                      </span>
                      <div style={{ background: '#f1f5f9', height: '1.25rem', borderRadius: '4px', overflow: 'hidden', position: 'relative', flexGrow: 1 }}>
                        <div
                          style={{
                            background: '#8b5cf6',
                            height: '100%',
                            width: `${percentage}%`,
                            transition: 'width 0.4s ease-in-out'
                          }}
                        />
                      </div>
                      <span style={{ minWidth: '40px', textAlign: 'right', fontWeight: '600', color: 'var(--text-muted)' }}>
                        {ratingCount}
                      </span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Total Responses: <strong>{csatMetrics.feedback_count}</strong></span>
                  <span>Average Score: <strong>{csatMetrics.avg_rating.toFixed(2)} / 5.0</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Department Workloads (Global metrics view for Admins) */}
          {user && user.role === 'ADMIN' && (
            <div className="card" style={{ gridColumn: 'span 2' }}>
              <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem' }}>
                Workload Distribution by Department
              </h3>
              {departmentStats.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No department records mapped.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
                  {departmentStats.map((item, index) => {
                    const maxVal = Math.max(...departmentStats.map(d => d.count), 1);
                    const percentage = ((item.count / maxVal) * 100).toFixed(0);

                    return (
                      <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <strong>{item.department || 'General'}</strong>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.count} tickets</span>
                            {item.escalated_count > 0 && (
                              <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 'bold' }}>🚨 {item.escalated_count} escalated</span>
                            )}
                          </div>
                        </div>
                        <div style={{ background: '#e2e8f0', height: '0.85rem', borderRadius: '3px', overflow: 'hidden', marginTop: '0.25rem' }}>
                          <div
                            style={{
                              background: '#6366f1',
                              height: '100%',
                              width: `${percentage}%`
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'exports' && user && user.role === 'ADMIN' && (
        <div className="card">
          <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            System Data Export Center
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Download up-to-date raw data files of complaints ledger databases and system users in CSV formats for audits and external reports.
          </p>

          {exportError && <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>{exportError}</div>}

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '260px', padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Complaints Database Logs</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Contains ticket numbers, creators, descriptions, assignment records, priority, categories, and creation dates.
              </p>
              <button className="btn btn-primary" onClick={handleExportComplaintsCSV} style={{ width: '100%' }}>
                📥 Download Complaints CSV
              </button>
            </div>

            <div style={{ flex: '1', minWidth: '260px', padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '8px', background: '#f8fafc' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>System User Accounts List</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Contains user details (first/last names), registration emails, active account statuses, roles, and creation timestamps.
              </p>
              <button className="btn btn-primary" onClick={handleExportUsersCSV} style={{ width: '100%' }}>
                📥 Download Users List CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
