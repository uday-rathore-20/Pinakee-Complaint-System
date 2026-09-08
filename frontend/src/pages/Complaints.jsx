import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Complaints = () => {
  const { user, authFetch } = useAuth();

  // Data States
  const [complaints, setComplaints] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [statuses, setStatuses] = useState([]);

  // Active queue for ENGINEER (defaults to 'my')
  const [activeQueue, setActiveQueue] = useState('my');

  // Filter & Search States
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterOverdue, setFilterOverdue] = useState('');
  const [filterEscalated, setFilterEscalated] = useState('');
  const [search, setSearch] = useState('');

  // Pagination States
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 10;

  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deletingComplaint, setDeletingComplaint] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCat, setFormCat] = useState('');
  const [formPri, setFormPri] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [serviceLocations, setServiceLocations] = useState([]);

  const [loading, setLoading] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  // Fetch lookups and complaints
  const fetchData = async () => {
    try {
      const catRes = await authFetch('/categories');
      const priRes = await authFetch('/priorities');
      const statusRes = await authFetch('/statuses');
      const locRes = await authFetch('/my-service-locations');

      const categoriesResult = await catRes.json();
      const prioritiesResult = await priRes.json();
      const statusesResult = await statusRes.json();
      const locsResult = await locRes.json();

      if (categoriesResult.success) setCategories(categoriesResult.data);
      if (prioritiesResult.success) setPriorities(prioritiesResult.data);
      if (statusesResult.success) setStatuses(statusesResult.data);
      if (locsResult.success) setServiceLocations(locsResult.data);

      await fetchComplaints();
    } catch (err) {
      setError('Failed to fetch lookup collections.');
    } finally {
      setLoading(false);
    }
  };

  const fetchComplaints = async (currentOffset = offset) => {
    try {
      const params = [];
      if (filterStatus) params.push(`status=${filterStatus}`);
      if (filterPriority) params.push(`priority=${filterPriority}`);
      if (filterCategory) params.push(`category=${filterCategory}`);
      if (filterOverdue) params.push(`overdue=${filterOverdue}`);
      if (filterEscalated) params.push(`escalated=${filterEscalated}`);
      if (search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
      params.push(`limit=${limit}`);
      params.push(`offset=${currentOffset}`);

      if (user.role === 'ENGINEER' || user.role === 'AGENT') {
        params.push(`queue=${activeQueue}`);
      }

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const res = await authFetch(`/complaints${queryString}`);
      const result = await res.json();
      if (result.success) {
        setComplaints(result.data);
        setTotal(result.pagination.total);
      }
    } catch (err) {
      setError('Failed to reload complaints list.');
    }
  };

  const handleClaimTicket = async (ticketId) => {
    setError('');
    try {
      const res = await authFetch(`/complaints/${ticketId}/claim`, {
        method: 'PATCH'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        // Switch tab to "My Tickets" and reload
        setActiveQueue('my');
        setOffset(0);
        await fetchComplaints(0);
      } else {
        setError(result.message || 'Failed to claim ticket.');
      }
    } catch (err) {
      setError('Connection failure claiming ticket.');
    }
  };

  const handleDeleteComplaint = async (ticketId) => {
    setDeletingComplaint(true);
    setError('');
    try {
      const res = await authFetch(`/complaints/${ticketId}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setShowDeleteModal(null);
        await fetchComplaints();
      } else {
        setError(result.message || 'Failed to delete complaint.');
        setShowDeleteModal(null);
      }
    } catch (err) {
      setError('Connection failure deleting complaint.');
      setShowDeleteModal(null);
    } finally {
      setDeletingComplaint(false);
    }
  };

  const handleExportCSV = async () => {
    setError('');
    try {
      const res = await authFetch('/complaints/export');
      if (!res.ok) {
        throw new Error('Failed to export CSV logs');
      }
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
      setError(err.message || 'Error occurred exporting complaints logs.');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setOffset(0);
    fetchComplaints(0);
  };

  const handlePageChange = (direction) => {
    let nextOffset = offset;
    if (direction === 'next') {
      nextOffset = offset + limit;
    } else if (direction === 'prev') {
      nextOffset = Math.max(0, offset - limit);
    }
    setOffset(nextOffset);
    fetchComplaints(nextOffset);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reload complaints and reset offset whenever a filter changes
  useEffect(() => {
    setOffset(0);
    fetchComplaints(0);
  }, [filterStatus, filterPriority, filterCategory, filterOverdue, filterEscalated, activeQueue]);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    if (!formTitle.trim() || !formDesc.trim() || !formPri) {
      setFormError('Title, description, and priority are required.');
      setFormSubmitting(false);
      return;
    }

    try {
      const res = await authFetch('/complaints', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim(),
          category_id: formCat ? parseInt(formCat, 10) : null,
          priority_id: parseInt(formPri, 10),
          service_location_id: formLocation ? parseInt(formLocation, 10) : null
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        // Reset form and close modal
        setFormTitle('');
        setFormDesc('');
        setFormCat('');
        setFormPri('');
        setFormLocation('');
        setShowModal(false);
        // Refresh list
        fetchComplaints();
      } else {
        setFormError(result.message || 'Submission failed');
      }
    } catch (err) {
      setFormError('Failed to connect to the server');
    } finally {
      setFormSubmitting(false);
    }
  };

  if (loading) {
    return <div className="page-container"><h2>Loading complaints...</h2></div>;
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>
            {user?.role === 'CUSTOMER' ? 'My Support Complaints' : 'Complaint Tickets Ledger'}
          </h1>
          <p>
            {user?.role === 'CUSTOMER' ? 'Track and manage your submitted service requests' : 'Central operations ledger for tracking and resolving client service requests'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {user && user.role === 'ADMIN' && (
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Export CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            File New Complaint
          </button>
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

      {/* Queue selector tabs for ENGINEER */}
      {user && (user.role === 'ENGINEER' || user.role === 'AGENT') && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <button
            className={`btn ${activeQueue === 'my' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
            onClick={() => setActiveQueue('my')}
          >
            My Active Tickets
          </button>
          <button
            className={`btn ${activeQueue === 'claim_required' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
            onClick={() => setActiveQueue('claim_required')}
          >
            Claim Required
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexGrow: '1', minWidth: '280px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexGrow: '1' }}>
              <span className="form-label" style={{ margin: 0 }}>Search Keywords</span>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '2.2rem' }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, ticket #, or description..."
                />
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
            </div>
            <button type="submit" className="btn btn-secondary" style={{ padding: '0.6rem 1rem' }}>
              Search
            </button>
          </form>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '150px' }}>
              <span className="form-label" style={{ margin: 0 }}>Status</span>
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '140px' }}>
              <span className="form-label" style={{ margin: 0 }}>Priority</span>
              <select
                className="form-select"
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">All Priorities</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '150px' }}>
              <span className="form-label" style={{ margin: 0 }}>Category</span>
              <select
                className="form-select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '140px' }}>
              <span className="form-label" style={{ margin: 0 }}>SLA Status</span>
              <select
                className="form-select"
                value={filterOverdue}
                onChange={(e) => setFilterOverdue(e.target.value)}
              >
                <option value="">All Deadlines</option>
                <option value="true">Overdue / Breached</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '140px' }}>
              <span className="form-label" style={{ margin: 0 }}>Escalation</span>
              <select
                className="form-select"
                value={filterEscalated}
                onChange={(e) => setFilterEscalated(e.target.value)}
              >
                <option value="">All Escalations</option>
                <option value="true">Escalated Only</option>
                <option value="false">Standard</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Complaints Table Container */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        {complaints.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <p style={{ fontWeight: '600', color: 'var(--text-main)' }}>No complaints found</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Try adjusting your search keywords or filter criteria.</p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Subject Title</th>
                  <th>Creator</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA Deadline</th>
                  <th>Date Filed</th>
                  {((activeQueue === 'unassigned' && user && (user.role === 'ENGINEER' || user.role === 'AGENT')) || (user && user.role === 'CUSTOMER')) && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {complaints.map(ticket => {
                  const dateStr = new Date(ticket.created_at).toLocaleDateString();
                  const statusKey = ticket.status.toLowerCase().replace(/ /g, '-');
                  const priorityKey = ticket.priority.toLowerCase();

                  return (
                    <tr key={ticket.id}>
                      <td>
                        <Link
                          to={`/complaints/${ticket.id}`}
                          style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: '700',
                            color: 'var(--primary-color)',
                            textDecoration: 'none',
                            backgroundColor: 'var(--bg-subtle)',
                            padding: '0.2rem 0.45rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '0.82rem'
                          }}
                        >
                          {ticket.ticket_number}
                        </Link>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Link to={`/complaints/${ticket.id}`} style={{ fontWeight: '600', color: 'var(--text-main)', textDecoration: 'none' }}>
                            {ticket.title}
                          </Link>
                          {ticket.is_escalated && (
                            <span
                              className="badge badge-critical"
                              style={{
                                fontSize: '0.65rem',
                                padding: '0.1rem 0.35rem'
                              }}
                              title={`Escalation Tier: ${ticket.escalation_level}`}
                            >
                              🚨 Tier {ticket.escalation_level}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: '500' }}>
                          {ticket.creator_first_name} {ticket.creator_last_name}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.85rem', color: ticket.category ? 'var(--text-color)' : 'var(--text-muted)' }}>
                          {ticket.category || '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${priorityKey}`}>{ticket.priority}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${statusKey}`}>{ticket.status}</span>
                      </td>
                      <td>
                        {ticket.due_date ? (
                          ticket.status === 'Resolved' || ticket.status === 'Closed' ? (
                            <span style={{ color: 'var(--success)', fontSize: '0.82rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              ✓ Satisfied
                            </span>
                          ) : new Date(ticket.due_date) < new Date() ? (
                            <span className="badge badge-critical" style={{ fontSize: '0.72rem' }}>OVERDUE</span>
                          ) : (
                            <span className="badge badge-pending" style={{ fontSize: '0.72rem' }}>
                              ⏱ {Math.ceil((new Date(ticket.due_date) - new Date()) / (1000 * 60 * 60))}h left
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-light)', fontSize: '0.82rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{dateStr}</td>
                      {user && user.role === 'CUSTOMER' && (
                        <td style={{ textAlign: 'right' }}>
                          {ticket.status === 'Pending' && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => setShowDeleteModal(ticket.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      )}
                      {user && (user.role === 'ENGINEER' || user.role === 'AGENT') && (
                        <td style={{ textAlign: 'right' }}>
                          {ticket.status === 'Assigned' && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleClaimTicket(ticket.id)}
                            >
                              Accept Assignment
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-subtle)' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '500' }}>
            Showing {complaints.length > 0 ? offset + 1 : 0} &ndash; {Math.min(offset + complaints.length, total)} of {total} tickets
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-sm btn-secondary"
              disabled={offset === 0}
              onClick={() => handlePageChange('prev')}
            >
              &larr; Previous
            </button>
            <button
              className="btn btn-sm btn-secondary"
              disabled={offset + limit >= total}
              onClick={() => handlePageChange('next')}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* File New Complaint Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>File a New Complaint</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowModal(false)}
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                <div>{formError}</div>
              </div>
            )}

            <form onSubmit={handleCreateComplaint}>
              <div className="form-group">
                <label className="form-label">Subject / Issue Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Summarize the core problem (e.g. Network downtime in East wing)"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Detailed Description</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Please provide full details of the issue, affected devices, and impact..."
                  required
                />
              </div>

              {serviceLocations && serviceLocations.length > 0 && (
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Service Location (Optional)</label>
                  <select
                    className="form-select"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                  >
                    <option value="">Default Account Address / Select Service Location</option>
                    {serviceLocations.map(loc => (
                      <option key={loc.id} value={loc.id}>
                        {loc.location_name} — {loc.address}, {loc.city} ({loc.location_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Category (Optional)</label>
                  <select
                    className="form-select"
                    value={formCat}
                    onChange={(e) => setFormCat(e.target.value)}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Priority Severity</label>
                  <select
                    className="form-select"
                    value={formPri}
                    onChange={(e) => setFormPri(e.target.value)}
                    required
                  >
                    <option value="">Select Priority</option>
                    {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? 'Submitting Ticket...' : 'Submit Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Cancel Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2>Cancel Complaint</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowDeleteModal(null)}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '0.5rem 0 1.25rem' }}>
              <p style={{ color: 'var(--text-color)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                Are you sure you want to cancel this pending complaint?
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                The complaint will be marked as Cancelled and preserved in your complaint history.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(null)}
                disabled={deletingComplaint}
              >
                Keep Complaint
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDeleteComplaint(showDeleteModal)}
                disabled={deletingComplaint}
              >
                {deletingComplaint ? 'Cancelling...' : 'Cancel Complaint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Complaints;
