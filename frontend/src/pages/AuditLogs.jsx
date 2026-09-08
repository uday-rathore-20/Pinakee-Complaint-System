import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const AuditLogs = () => {
  const { authFetch } = useAuth();

  // States
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter States
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination States
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalCount, setTotalCount] = useState(0);

  // Collapsible metadata viewer state
  const [expandedLogId, setExpandedLogId] = useState(null);

  // Action types for filter dropdown
  const actionTypes = [
    { value: '', label: 'All Actions' },
    { value: 'AUTH_SUCCESS', label: 'Auth Success' },
    { value: 'AUTH_FAILED', label: 'Auth Failed' },
    { value: 'AUTH_FAILED_LOCKED', label: 'Account Locked Out' },
    { value: 'PASSWORD_RECOVERED', label: 'Password Recovered' },
    { value: 'USER_CREATED', label: 'User Created' },
    { value: 'USER_UPDATED', label: 'User Updated' },
    { value: 'USER_STATUS_TOGGLED', label: 'User Status Toggled' },
    { value: 'COMPLAINT_CREATED', label: 'Complaint Created' },
    { value: 'COMPLAINT_UPDATED', label: 'Complaint Updated' },
    { value: 'COMPLAINT_CLAIMED', label: 'Complaint Claimed' },
    { value: 'COMPLAINT_RESOLVED', label: 'Complaint Resolved' },
    { value: 'COMPLAINT_CLOSED', label: 'Complaint Closed' },
    { value: 'COMPLAINTS_EXPORTED_CSV', label: 'Complaints Exported' },
    { value: 'USERS_EXPORTED_CSV', label: 'Users Exported' },
    { value: 'ATTACHMENT_UPLOADED', label: 'Attachment Uploaded' },
    { value: 'ATTACHMENT_DELETED', label: 'Attachment Deleted' },
    { value: 'SLA_BREACH_DETECTED', label: 'SLA Breach Detected' },
    { value: 'RATE_LIMIT_BLOCKED', label: 'Rate Limit Blocked' }
  ];

  // Fetch audit logs
  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const offset = (page - 1) * limit;
      let queryParams = `?limit=${limit}&offset=${offset}`;

      if (selectedUser) queryParams += `&user_id=${selectedUser}`;
      if (selectedAction) queryParams += `&action_type=${selectedAction}`;
      if (startDate) queryParams += `&start_date=${startDate}`;
      if (endDate) queryParams += `&end_date=${endDate}`;

      const res = await authFetch(`/audit-logs${queryParams}`);
      const result = await res.json();

      if (res.ok && result.success) {
        setLogs(result.data.logs);
        setTotalCount(result.data.pagination.total);
      } else {
        setError(result.message || 'Failed to retrieve audit logs.');
      }
    } catch (err) {
      setError('Connection to server failed.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch users lookup
  const fetchUsersLookup = async () => {
    try {
      const res = await authFetch('/users');
      const result = await res.json();
      if (res.ok && result.success) {
        setUsers(result.data);
      }
    } catch (err) {
      console.error('Failed to load users list:', err);
    }
  };

  // Load initial data and refresh when page or filters change
  useEffect(() => {
    fetchUsersLookup();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, selectedUser, selectedAction, startDate, endDate]);

  const handleResetFilters = () => {
    setSelectedUser('');
    setSelectedAction('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleToggleExpand = (id) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Format local date string helper
  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Administrative Audit Trails</h1>
          <p>
            Immutable ledger of system-wide authentication events, security modifications, and administrative operations.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>{error}</div>
        </div>
      )}

      {/* Filter Bar Panel */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Performer</label>
            <select
              className="form-select"
              value={selectedUser}
              onChange={(e) => { setSelectedUser(e.target.value); setPage(1); }}
            >
              <option value="">All Performers</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.email})</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Action Event</label>
            <select
              className="form-select"
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
            >
              {actionTypes.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            />
          </div>

          <div>
            <button
              onClick={handleResetFilters}
              className="btn btn-secondary"
              style={{ width: '100%', whiteSpace: 'nowrap' }}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
            <p style={{ fontWeight: '600' }}>Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
            <p style={{ fontWeight: '600', color: 'var(--text-main)' }}>No audit records match the selected filters.</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp (IST)</th>
                  <th>Actor / User</th>
                  <th>Action Event</th>
                  <th>Description</th>
                  <th>IP Address</th>
                  <th style={{ textAlign: 'center' }}>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasMetadata = log.metadata_json && Object.keys(log.metadata_json).length > 0;
                  const isFailure = log.action_type.includes('FAILED') || log.action_type.includes('BLOCKED');

                  return (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                          {formatDate(log.created_at)}
                        </td>
                        <td>
                          {log.user_email ? (
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)' }}>{log.user_email}</div>
                              <span className="badge badge-low" style={{ fontSize: '0.65rem' }}>
                                {log.user_role}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-light)', fontSize: '0.82rem' }}>System / Anonymous</span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              fontFamily: 'JetBrains Mono, monospace',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              padding: '0.2rem 0.45rem',
                              borderRadius: '4px',
                              background: isFailure ? 'var(--danger-bg)' : 'var(--success-bg)',
                              color: isFailure ? 'var(--danger-text)' : 'var(--success-text)',
                              border: isFailure ? '1px solid var(--danger-border)' : '1px solid var(--success-border)',
                              display: 'inline-block'
                            }}
                          >
                            {log.action_type}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}>
                          {log.description}
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {log.ip_address || '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            disabled={!hasMetadata}
                            onClick={() => handleToggleExpand(log.id)}
                            className="btn btn-sm btn-secondary"
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: hasMetadata ? 'pointer' : 'not-allowed',
                              opacity: hasMetadata ? 1 : 0.4
                            }}
                          >
                            {isExpanded ? 'Hide' : 'View JSON'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasMetadata && (
                        <tr style={{ background: 'var(--bg-subtle)' }}>
                          <td colSpan="6" style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ padding: '0.85rem', background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Audit Metadata Payload
                                </span>
                              </div>
                              <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-subtle)', padding: '0.75rem', borderRadius: '4px' }}>
                                {JSON.stringify(log.metadata_json, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Pagination Footer */}
        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle)' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '500' }}>
              Showing {((page - 1) * limit) + 1} &ndash; {Math.min(page * limit, totalCount)} of {totalCount} log entries
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-secondary"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
              >
                &larr; Previous
              </button>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', padding: '0 0.25rem' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-sm btn-secondary"
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
