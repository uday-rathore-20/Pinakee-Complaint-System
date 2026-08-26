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
  const [attachments, setAttachments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
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
  const [claimingTicket, setClaimingTicket] = useState(false);
  
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

  const fetchAttachments = async () => {
    try {
      const res = await authFetch(`/complaints/${id}/attachments`);
      const result = await res.json();
      if (res.ok && result.success) {
        setAttachments(result.data);
      }
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchComplaintDetails();
      await fetchLookups();
      await fetchAttachments();
      setLoading(false);
    };
    init();
  }, [id]);

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setActionError('');

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await authFetch(`/complaints/${id}/attachments`, {
        method: 'POST',
        body: formData
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setSelectedFile(null);
        document.getElementById('file-upload-input').value = '';
        await fetchAttachments();
        await fetchComplaintDetails(); // Refresh comments list
      } else {
        setActionError(result.message || 'File upload failed');
      }
    } catch (err) {
      setActionError('Network error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadAttachment = async (attachId, fileName) => {
    setActionError('');
    try {
      const res = await authFetch(`/attachments/${attachId}`);
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.message || 'Failed to download file');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setActionError(err.message || 'Error occurred during file download.');
    }
  };

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

  const handleClaimTicketDetails = async () => {
    setActionError('');
    setClaimingTicket(true);
    try {
      const res = await authFetch(`/complaints/${id}/claim`, {
        method: 'PATCH'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchComplaintDetails(); // Refresh ticket metadata and history
      } else {
        setActionError(result.message || 'Failed to claim ticket.');
      }
    } catch (err) {
      setActionError('Network error claiming ticket.');
    } finally {
      setClaimingTicket(false);
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

          {/* Attachments Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              File Attachments ({attachments.length})
            </h3>

            {attachments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>No attachments uploaded yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {attachments.map(att => (
                  <li key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                    <div style={{ wordBreak: 'break-all', paddingRight: '1rem' }}>
                      <strong style={{ color: 'var(--secondary-color)' }}>{att.file_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {(att.file_size / 1024).toFixed(1)} KB | Uploaded by {att.first_name} {att.last_name} ({att.role})
                      </div>
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                      onClick={() => handleDownloadAttachment(att.id, att.file_name)}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {complaint.status !== 'Closed' && (
              <form onSubmit={handleUploadFile} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div className="form-group" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0' }}>
                  <input
                    type="file"
                    id="file-upload-input"
                    className="form-input"
                    style={{ padding: '0.4rem 0.8rem', flexGrow: '1' }}
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    required
                  />
                  <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile} style={{ whiteSpace: 'nowrap' }}>
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Supported formats: image, PDF, text, document (Max 5MB)
                </div>
              </form>
            )}
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

          {/* Claim Ticket Widget for Agents in the same department */}
          {user && (user.role === 'AGENT' || user.role === 'DEPT_HEAD') && !complaint.assigned_to_id && complaint.department_id === user.department_id && (
            <div className="card" style={{ background: '#f8fafc', border: '1px dashed var(--primary-color)' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '0.95rem', color: 'var(--primary-color)' }}>Ticket is Unassigned</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                This complaint is routed to your department. Claim it to take ownership and start resolving.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={handleClaimTicketDetails}
                disabled={claimingTicket}
              >
                {claimingTicket ? 'Claiming...' : 'Claim Ticket'}
              </button>
            </div>
          )}

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
