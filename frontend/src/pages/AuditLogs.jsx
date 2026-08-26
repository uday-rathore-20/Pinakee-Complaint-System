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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Administrative Audit Trails</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Ledger of system-wide security, account modifications, and administrative operations.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>{error}</div>}

      {/* Filter Bar Panel */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: 'var(--card-bg)', borderRadius: '8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filter Performer</label>
            <select
              className="form-input"
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
            <label className="form-label">Filter Action</label>
            <select
              className="form-input"
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

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleResetFilters}
              className="btn btn-outline"
              style={{ width: '100%', whiteSpace: 'nowrap' }}
            >
              Clear Filters
            </button>
          </div>

        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>Loading audit trails...</h3>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <h3>No audit records match selected filters.</h3>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-light)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Timestamp (IST)</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Actor</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Action</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left' }}>IP Address</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasMetadata = log.metadata_json && Object.keys(log.metadata_json).length > 0;

                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          {formatDate(log.created_at)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {log.user_email ? (
                            <div>
                              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{log.user_email}</div>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '0.1rem 0.3rem',
                                  borderRadius: '4px',
                                  background: log.user_role === 'ADMIN' ? '#fee2e2' : '#f1f5f9',
                                  color: log.user_role === 'ADMIN' ? '#991b1b' : '#475569'
                                }}
                              >
                                {log.user_role}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>System / Anonymous</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              padding: '0.2rem 0.4rem',
                              borderRadius: '4px',
                              background: log.action_type.includes('FAILED') || log.action_type.includes('BLOCKED') ? '#fee2e2' : '#dcfce7',
                              color: log.action_type.includes('FAILED') || log.action_type.includes('BLOCKED') ? '#991b1b' : '#166534'
                            }}
                          >
                            {log.action_type}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                          {log.description}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {log.ip_address || '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            disabled={!hasMetadata}
                            onClick={() => handleToggleExpand(log.id)}
                            className="btn btn-outline"
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              borderColor: hasMetadata ? 'var(--primary-light)' : '#cbd5e1',
                              color: hasMetadata ? 'var(--primary-light)' : '#94a3b8',
                              cursor: hasMetadata ? 'pointer' : 'not-allowed'
                            }}
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasMetadata && (
                        <tr style={{ background: '#f8fafc' }}>
                          <td colSpan="6" style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ padding: '0.75rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                              <h5 style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                Metadata Details JSON
                              </h5>
                              <pre style={{ margin: 0, fontSize: '0.8rem', color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
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

        {/* Table Pagination footer */}
        {!loading && totalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-light)' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} entries
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-outline"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                Previous
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline"
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
