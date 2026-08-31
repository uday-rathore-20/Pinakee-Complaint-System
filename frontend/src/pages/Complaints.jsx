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

      const categoriesResult = await catRes.json();
      const prioritiesResult = await priRes.json();
      const statusesResult = await statusRes.json();

      if (categoriesResult.success) setCategories(categoriesResult.data);
      if (prioritiesResult.success) setPriorities(prioritiesResult.data);
      if (statusesResult.success) setStatuses(statusesResult.data);

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

    if (!formTitle || !formDesc || !formCat || !formPri) {
      setFormError('All fields are required.');
      setFormSubmitting(false);
      return;
    }

    try {
      const res = await authFetch('/complaints', {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle,
          description: formDesc,
          category_id: parseInt(formCat),
          priority_id: parseInt(formPri)
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        // Reset form and close modal
        setFormTitle('');
        setFormDesc('');
        setFormCat('');
        setFormPri('');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Complaint Tickets Ledger</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {user && user.role === 'ADMIN' && (
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              Export CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            File New Complaint
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Queue selector tabs for ENGINEER */}
      {user && (user.role === 'ENGINEER' || user.role === 'AGENT') && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <button
            className={`btn ${activeQueue === 'my' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.4rem 1.2rem', fontSize: '0.875rem' }}
            onClick={() => setActiveQueue('my')}
          >
            My Assigned Tickets
          </button>
          <button
            className={`btn ${activeQueue === 'unassigned' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.4rem 1.2rem', fontSize: '0.875rem' }}
            onClick={() => setActiveQueue('unassigned')}
          >
            Unassigned Tickets
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexGrow: '1', minWidth: '280px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexGrow: '1' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Search Keywords</span>
              <input
                type="text"
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket title or description..."
              />
            </div>
            <button type="submit" className="btn btn-secondary" style={{ padding: '0.45rem 1rem' }}>
              Search
            </button>
          </form>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Status State</span>
              <select
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All Statuses</option>
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Priority Severity</span>
              <select
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">All Priorities</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Category Group</span>
              <select
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>SLA Escalation</span>
              <select
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={filterOverdue}
                onChange={(e) => setFilterOverdue(e.target.value)}
              >
                <option value="">All Tickets</option>
                <option value="true">Overdue / Breached</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '160px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>Escalation State</span>
              <select
                className="form-input"
                style={{ padding: '0.4rem 0.8rem' }}
                value={filterEscalated}
                onChange={(e) => setFilterEscalated(e.target.value)}
              >
                <option value="">All Tickets</option>
                <option value="true">Escalated</option>
                <option value="false">Non-Escalated</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Complaints Table */}
      <div className="card" style={{ padding: '0' }}>
        {complaints.length === 0 ? (
          <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No complaints found matching the criteria.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Title</th>
                  <th>Creator</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>SLA Status</th>
                  <th>Date Filed</th>
                  {((activeQueue === 'unassigned' && user && (user.role === 'ENGINEER' || user.role === 'AGENT')) || (user && user.role === 'CUSTOMER')) && <th>Action</th>}
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
                        <Link to={`/complaints/${ticket.id}`} style={{ color: 'var(--primary-light)', fontWeight: 'bold', textDecoration: 'none' }}>
                          {ticket.ticket_number}
                        </Link>
                      </td>
                      <td>
                        <strong>{ticket.title}</strong>
                        {ticket.is_escalated && (
                          <span
                            className="badge badge-danger"
                            style={{
                              marginLeft: '0.5rem',
                              fontSize: '0.65rem',
                              background: '#ef4444',
                              color: '#fff',
                              padding: '0.15rem 0.35rem',
                              borderRadius: '4px',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title={`Escalation Level: ${ticket.escalation_level}`}
                          >
                            🚨 Escalated (Lv.{ticket.escalation_level})
                          </span>
                        )}
                      </td>
                      <td>{ticket.creator_first_name} {ticket.creator_last_name}</td>
                      <td>{ticket.category}</td>
                      <td>
                        <span className={`badge badge-${priorityKey}`}>{ticket.priority}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${statusKey}`}>{ticket.status}</span>
                      </td>
                      <td>
                        {ticket.due_date ? (
                          ticket.status === 'Resolved' || ticket.status === 'Closed' ? (
                            <span style={{ color: 'var(--success-color)', fontSize: '0.85rem', fontWeight: '500' }}>Satisfied</span>
                          ) : new Date(ticket.due_date) < new Date() ? (
                            <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>OVERDUE</span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                              {Math.ceil((new Date(ticket.due_date) - new Date()) / (1000 * 60 * 60))}h left
                            </span>
                          )
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None</span>
                        )}
                      </td>
                      <td>{dateStr}</td>
                      {user && user.role === 'CUSTOMER' && (
                        <td>
                          {ticket.status === 'Pending' && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                              onClick={() => setShowDeleteModal(ticket.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      )}
                      {activeQueue === 'unassigned' && user && (user.role === 'ENGINEER' || user.role === 'AGENT') && (
                        <td>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={() => handleClaimTicket(ticket.id)}
                          >
                            Claim
                          </button>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', marginTop: '0' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Showing {complaints.length > 0 ? offset + 1 : 0} - {Math.min(offset + complaints.length, total)} of {total} tickets
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              disabled={offset === 0}
              onClick={() => handlePageChange('prev')}
            >
              &larr; Previous
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              disabled={offset + limit >= total}
              onClick={() => handlePageChange('next')}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* File New Complaint Modal Overlay */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>File a New Complaint</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowModal(false)}
              >
                &times;
              </button>
            </div>

            {formError && <div className="alert alert-danger">{formError}</div>}

            <form onSubmit={handleCreateComplaint}>
              <div className="form-group">
                <label className="form-label">Subject Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Summarize the complaint issue"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Detailed Description</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '120px', resize: 'vertical' }}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Describe the complaint with detail..."
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Category Group</label>
                  <select
                    className="form-input"
                    value={formCat}
                    onChange={(e) => setFormCat(e.target.value)}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Priority Severity</label>
                  <select
                    className="form-input"
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
                  {formSubmitting ? 'Submitting...' : 'Submit Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Delete Complaint</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowDeleteModal(null)}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <p style={{ color: 'var(--text-color)', marginBottom: '0.75rem' }}>
                Are you sure you want to delete this complaint?
              </p>
              <p style={{ color: 'var(--danger-color, #ef4444)', fontSize: '0.85rem', fontWeight: 'bold' }}>
                This action cannot be undone.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(null)}
                disabled={deletingComplaint}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleDeleteComplaint(showDeleteModal)}
                disabled={deletingComplaint}
              >
                {deletingComplaint ? 'Deleting...' : 'Delete Complaint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Complaints;
