import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ComplaintDetail = () => {
  const { id } = useParams();
  const { user, authFetch } = useAuth();
  
  // Data States
  const [complaint, setComplaint] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  
  // Lookup collections for controls
  const [statuses, setStatuses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);

  // Form States
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [transitionRemarks, setTransitionRemarks] = useState('');

  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingAssign, setUpdatingAssign] = useState(false);
  
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const fetchComplaintDetails = async () => {
    try {
      const res = await authFetch(`/complaints/${id}`);
      const result = await res.json();
      
      if (res.ok && result.success) {
        setComplaint(result.data.complaint);
        setComments(result.data.comments);
        setHistory(result.data.status_history);
        
        setSelectedStatus(result.data.complaint.status_id);
        setSelectedDept(result.data.complaint.department_id || '');
        setSelectedAgent(result.data.complaint.assigned_to_id || '');
      } else {
        setError(result.message || 'Failed to load complaint details.');
      }
    } catch (err) {
      setError('Connection to server failed.');
    }
  };

  const fetchLookups = async () => {
    try {
      const statusRes = await authFetch('/statuses');
      const statusesResult = await statusRes.json();
      if (statusesResult.success) setStatuses(statusesResult.data);

      // Staff roles can load departments and potential assignees
      if (user.role === 'ADMIN' || user.role === 'DEPT_HEAD') {
        const deptRes = await authFetch('/departments');
        const deptsResult = await deptRes.json();
        if (deptsResult.success) setDepartments(deptsResult.data);

        // Fetch agents and dept heads for assignment list
        const agentsRes = await authFetch('/users?is_active=true');
        const agentsResult = await agentsRes.json();
        if (agentsResult.success) {
          // Filter to select only staff members (ADMIN, DEPT_HEAD, AGENT)
          const staff = agentsResult.data.filter(u => u.role !== 'CUSTOMER');
          setAgents(staff);
        }
      }
    } catch (err) {
      console.error('Failed to load form lookups:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchComplaintDetails();
      await fetchLookups();
      setLoading(false);
    };
    init();
  }, [id]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    setActionError('');
    setSubmittingComment(true);

    if (!commentText.trim()) return;

    try {
      const res = await authFetch(`/complaints/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          comment_text: commentText,
          is_internal: commentInternal
        })
      });
      const result = await res.json();
      
      if (res.ok && result.success) {
        setCommentText('');
        setCommentInternal(false);
        await fetchComplaintDetails(); // Refresh comments list
      } else {
        setActionError(result.message || 'Failed to post comment.');
      }
    } catch (err) {
      setActionError('Network error posting comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    setActionError('');
    setUpdatingStatus(true);

    try {
      const res = await authFetch(`/complaints/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status_id: parseInt(selectedStatus),
          remarks: transitionRemarks
        })
      });
      const result = await res.json();
      
      if (res.ok && result.success) {
        setTransitionRemarks('');
        await fetchComplaintDetails(); // Refresh complaint status & timeline
      } else {
        setActionError(result.message || 'Failed to update status.');
      }
    } catch (err) {
      setActionError('Network error updating status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignRouting = async (e) => {
    e.preventDefault();
    setActionError('');
    setUpdatingAssign(true);

    try {
      const res = await authFetch(`/complaints/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          department_id: selectedDept ? parseInt(selectedDept) : null,
          assigned_to_id: selectedAgent ? parseInt(selectedAgent) : null,
          remarks: 'Routing / Assignment updated via admin console.'
        })
      });
      const result = await res.json();
      
      if (res.ok && result.success) {
        await fetchComplaintDetails(); // Refresh assignment info
      } else {
        setActionError(result.message || 'Assignment failed.');
      }
    } catch (err) {
      setActionError('Network error saving assignment.');
    } finally {
      setUpdatingAssign(false);
    }
  };

  if (loading) {
    return <div className="page-container"><h2>Loading ticket details...</h2></div>;
  }

  if (error || !complaint) {
    return (
      <div className="page-container">
        <Link to="/complaints" style={{ color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 'bold' }}>
          &larr; Back to Complaints list
        </Link>
        <div className="alert alert-danger" style={{ marginTop: '1rem' }}>{error || 'Ticket not found.'}</div>
      </div>
    );
  }

  // Display badges keys
  const priorityKey = complaint.priority.toLowerCase();
  const statusKey = complaint.status.toLowerCase().replace(/ /g, '-');
  const isStaff = user.role !== 'CUSTOMER';
  const isAdminOrHead = user.role === 'ADMIN' || (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id);

  return (
    <div className="page-container">
      <Link to="/complaints" style={{ display: 'inline-block', marginBottom: '1.5rem', color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 'bold' }}>
        &larr; Back to Complaints Ledger
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            Ticket Number: {complaint.ticket_number}
          </span>
          <h1 style={{ marginTop: '0.25rem' }}>{complaint.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <span className={`badge badge-${priorityKey}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{complaint.priority}</span>
          <span className={`badge badge-${statusKey}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{complaint.status}</span>
        </div>
      </div>

      {actionError && <div className="alert alert-danger">{actionError}</div>}

      <div className="section-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Main Details card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              Issue Description
            </h3>
            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-color)', fontSize: '0.975rem' }}>
              {complaint.description}
            </p>
          </div>

          {/* Comments Feed Section */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              Discussion & Comments Feed ({comments.length})
            </h3>
            
            {/* Add Comment form */}
            <form onSubmit={handleAddComment} style={{ marginBottom: '1.5rem' }}>
              <div className="form-group">
                <textarea
                  className="form-input"
                  rows="3"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type a message or response..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {isStaff ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={commentInternal}
                      onChange={(e) => setCommentInternal(e.target.checked)}
                    />
                    <strong>Staff Internal Note</strong> (Hidden from customer)
                  </label>
                ) : <div />}

                <button type="submit" className="btn btn-primary" disabled={submittingComment || !commentText.trim()}>
                  {submittingComment ? 'Posting...' : 'Post Message'}
                </button>
              </div>
            </form>

            <div className="comments-thread">
              {comments.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No comments posted yet.</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className={`comment-bubble ${c.is_internal ? 'internal' : ''}`}>
                    <div className="comment-meta">
                      <span>{c.first_name} {c.last_name} ({c.role})</span>
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ wordBreak: 'break-word' }}>{c.comment_text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Side Panel: Metadata and Status Updates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Metadata Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
              Ticket Details
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Category:</span>{' '}
                <strong>{complaint.category}</strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Filed By:</span>{' '}
                <strong>{complaint.creator_first_name} {complaint.creator_last_name}</strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Department:</span>{' '}
                <strong>{complaint.department || 'Unassigned'}</strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Assigned Agent:</span>{' '}
                <strong>
                  {complaint.assignee_first_name
                    ? `${complaint.assignee_first_name} ${complaint.assignee_last_name}`
                    : 'Unassigned'}
                </strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Date Created:</span>{' '}
                <strong>{new Date(complaint.created_at).toLocaleString()}</strong>
              </li>
            </ul>
          </div>

          {/* Status update widget */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
              Transition Status
            </h3>
            <form onSubmit={handleUpdateStatus}>
              <div className="form-group">
                <select
                  className="form-input"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  required
                >
                  {statuses.map(s => {
                    // Restrict options: customers can only close tickets when resolved
                    if (user.role === 'CUSTOMER' && s.name !== 'Closed') {
                      return null;
                    }
                    return <option key={s.id} value={s.id}>{s.name}</option>;
                  })}
                </select>
              </div>

              <div className="form-group">
                <input
                  type="text"
                  className="form-input"
                  value={transitionRemarks}
                  onChange={(e) => setTransitionRemarks(e.target.value)}
                  placeholder="Update remark log..."
                />
              </div>

              <button type="submit" className="btn btn-secondary btn-block" disabled={updatingStatus}>
                {updatingStatus ? 'Updating...' : 'Update Status'}
              </button>
            </form>
          </div>

          {/* Assignment Routing widget (Admin/Head only) */}
          {isAdminOrHead && (
            <div className="card">
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Routing & Assignment
              </h3>
              <form onSubmit={handleAssignRouting}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Department</label>
                  <select
                    className="form-input"
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                  >
                    <option value="">No Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Assignee Staff</label>
                  <select
                    className="form-input"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.first_name} {a.last_name} ({a.role})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-secondary btn-block" disabled={updatingAssign}>
                  {updatingAssign ? 'Saving Routing...' : 'Save Assignment'}
                </button>
              </form>
            </div>
          )}

          {/* Audit History Timeline list */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
              Audit History Timeline
            </h3>
            <div className="timeline">
              {history.map((h, i) => (
                <div key={i} className="timeline-item">
                  <div style={{ fontWeight: 'bold', color: 'var(--secondary-color)' }}>
                    {h.new_status || 'Created'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    By {h.first_name || 'System'} ({h.role || 'System'})
                  </div>
                  <div style={{ marginTop: '0.1rem', color: 'var(--text-color)' }}>{h.remarks}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    {new Date(h.changed_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplaintDetail;
