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
  const [fcr, setFcr] = useState(null);
  const [fcrLoading, setFcrLoading] = useState(true);
  const [fcrVisitDate, setFcrVisitDate] = useState('');
  const [fcrStartTime, setFcrStartTime] = useState('');
  const [fcrEndTime, setFcrEndTime] = useState('');
  const [fcrDiagnosis, setFcrDiagnosis] = useState('');
  const [fcrActionTaken, setFcrActionTaken] = useState('');
  const [fcrPartsReplaced, setFcrPartsReplaced] = useState('');
  const [fcrActivityCode, setFcrActivityCode] = useState('ACT-01');
  const [fcrSuggestions, setFcrSuggestions] = useState('');
  const [fcrFeedback, setFcrFeedback] = useState('');
  const [fcrRating, setFcrRating] = useState(5);
  const [submittingFcrAction, setSubmittingFcrAction] = useState(false);

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

  const fetchFcrData = async () => {
    try {
      const res = await authFetch(`/complaints/${id}/fcr`);
      const result = await res.json();
      if (res.ok && result.success) {
        setFcr(result.data);
        if (result.data) {
          setFcrVisitDate(result.data.visit_date ? result.data.visit_date.substring(0, 10) : '');
          setFcrStartTime(result.data.visit_start_time ? result.data.visit_start_time.substring(0, 5) : '');
          setFcrEndTime(result.data.visit_end_time ? result.data.visit_end_time.substring(0, 5) : '');
          setFcrDiagnosis(result.data.diagnosis || '');
          setFcrActionTaken(result.data.action_taken || '');
          setFcrPartsReplaced(result.data.parts_replaced || '');
          setFcrActivityCode(result.data.activity_code || 'ACT-01');
          setFcrSuggestions(result.data.suggestions || '');
        } else {
          const today = new Date().toISOString().substring(0, 10);
          setFcrVisitDate(today);
          setFcrStartTime('09:00');
          setFcrEndTime('10:00');
          setFcrDiagnosis('');
          setFcrActionTaken('');
          setFcrPartsReplaced('');
          setFcrActivityCode('ACT-01');
          setFcrSuggestions('');
        }
      }
    } catch (err) {
      console.error('Failed to load FCR data:', err);
    } finally {
      setFcrLoading(false);
    }
  };

  const handleSaveFcrDraft = async (e) => {
    if (e) e.preventDefault();
    setActionError('');
    setSubmittingFcrAction(true);

    try {
      const method = fcr ? 'PUT' : 'POST';
      const payload = {
        visit_date: fcrVisitDate,
        visit_start_time: fcrStartTime,
        visit_end_time: fcrEndTime,
        diagnosis: fcrDiagnosis,
        action_taken: fcrActionTaken,
        parts_replaced: fcrPartsReplaced,
        activity_code: fcrActivityCode,
        suggestions: fcrSuggestions
      };

      const res = await authFetch(`/complaints/${id}/fcr`, {
        method,
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchFcrData();
        return true;
      } else {
        setActionError(result.message || 'Failed to save FCR draft.');
        return false;
      }
    } catch (err) {
      setActionError('Network error saving FCR draft.');
      return false;
    } finally {
      setSubmittingFcrAction(false);
    }
  };

  const handleSubmitFcrAction = async (e) => {
    e.preventDefault();
    setActionError('');

    if (!fcrVisitDate || !fcrStartTime || !fcrEndTime || !fcrDiagnosis.trim() || !fcrActionTaken.trim() || !fcrActivityCode.trim()) {
      setActionError('Please fill in all mandatory fields before submitting FCR.');
      return;
    }

    setSubmittingFcrAction(true);

    try {
      // First save current values as draft to ensure backend has latest fields
      const saveSuccess = await handleSaveFcrDraft();
      if (!saveSuccess) return;

      // Call submit
      const res = await authFetch(`/complaints/${id}/fcr/submit`, {
        method: 'POST'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await Promise.all([
          fetchFcrData(),
          fetchComplaintDetails() // Refresh complaint status (should transition to Resolved)
        ]);
      } else {
        setActionError(result.message || 'Failed to submit FCR.');
      }
    } catch (err) {
      setActionError('Network error submitting FCR.');
    } finally {
      setSubmittingFcrAction(false);
    }
  };

  const handleConfirmFcrAction = async (e) => {
    e.preventDefault();
    setActionError('');

    if (fcrRating < 1 || fcrRating > 5) {
      setActionError('Rating must be between 1 and 5 stars.');
      return;
    }

    setSubmittingFcrAction(true);

    try {
      const res = await authFetch(`/complaints/${id}/fcr/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          customer_feedback: fcrFeedback,
          customer_rating: parseInt(fcrRating)
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await Promise.all([
          fetchFcrData(),
          fetchComplaintDetails() // Refresh complaint status (should transition to Closed)
        ]);
      } else {
        setActionError(result.message || 'Failed to confirm FCR.');
      }
    } catch (err) {
      setActionError('Network error confirming FCR.');
    } finally {
      setSubmittingFcrAction(false);
    }
  };

  const handleDownloadPdf = async () => {
    setActionError('');
    try {
      const res = await authFetch(`/complaints/${id}/fcr/pdf`);
      if (!res.ok) {
        throw new Error('Failed to generate FCR PDF');
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `fcr_ticket_${complaint.ticket_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setActionError(err.message || 'Error occurred downloading FCR PDF.');
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchComplaintDetails();
      await fetchLookups();
      await fetchAttachments();
      await fetchFcrData();
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

  const handleDeleteAttachment = async (attachId) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) return;
    setActionError('');
    try {
      const res = await authFetch(`/attachments/${attachId}`, {
        method: 'DELETE'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchAttachments();
        await fetchComplaintDetails(); // Refresh audit comments feed
      } else {
        setActionError(result.message || 'Failed to delete attachment.');
      }
    } catch (err) {
      setActionError('Network error deleting attachment.');
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

          {/* FCR Card */}
          {!fcrLoading && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0' }}>Digital Field Call Report (FCR)</h3>
                {fcr && (fcr.status === 'Submitted' || fcr.status === 'Finalized') && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={handleDownloadPdf}
                  >
                    Download PDF
                  </button>
                )}
              </div>

              {/* CASE 1: AGENT creating/editing draft */}
              {user.role === 'AGENT' && complaint.assigned_to_id === user.id && (!fcr || fcr.status === 'Draft') && (
                <form onSubmit={handleSubmitFcrAction}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Visit Date</label>
                      <input
                        type="date"
                        className="form-input"
                        value={fcrVisitDate}
                        onChange={(e) => setFcrVisitDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Start Time</label>
                      <input
                        type="time"
                        className="form-input"
                        value={fcrStartTime}
                        onChange={(e) => setFcrStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>End Time</label>
                      <input
                        type="time"
                        className="form-input"
                        value={fcrEndTime}
                        onChange={(e) => setFcrEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Diagnosis & Findings</label>
                    <textarea
                      className="form-input"
                      rows="2"
                      value={fcrDiagnosis}
                      onChange={(e) => setFcrDiagnosis(e.target.value)}
                      placeholder="Detail the cause/origin of the problem..."
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Action Taken</label>
                    <textarea
                      className="form-input"
                      rows="2"
                      value={fcrActionTaken}
                      onChange={(e) => setFcrActionTaken(e.target.value)}
                      placeholder="Detail the steps performed to resolve..."
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Activity Code</label>
                      <select
                        className="form-input"
                        value={fcrActivityCode}
                        onChange={(e) => setFcrActivityCode(e.target.value)}
                        required
                      >
                        <option value="ACT-01">ACT-01: Diagnostics & Analysis</option>
                        <option value="ACT-02">ACT-02: Repairs & Restorations</option>
                        <option value="ACT-03">ACT-03: Part Replacement</option>
                        <option value="ACT-04">ACT-04: Preventive Maintenance</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Parts Replaced (Optional)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={fcrPartsReplaced}
                        onChange={(e) => setFcrPartsReplaced(e.target.value)}
                        placeholder="e.g. SSD, RAM, Battery"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Suggestions / Recommendations (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={fcrSuggestions}
                      onChange={(e) => setFcrSuggestions(e.target.value)}
                      placeholder="Suggestions for preventing future occurrences..."
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveFcrDraft}
                      disabled={submittingFcrAction}
                    >
                      Save Draft
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submittingFcrAction}
                    >
                      Submit FCR
                    </button>
                  </div>
                </form>
              )}

              {/* CASE 2: Customer confirming / signing off */}
              {user.role === 'CUSTOMER' && complaint.created_by_id === user.id && fcr && fcr.status === 'Submitted' && (
                <form onSubmit={handleConfirmFcrAction}>
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                    <div style={{ marginBottom: '0.5rem' }}><strong>Visit Date:</strong> {new Date(fcr.visit_date).toLocaleDateString()} ({fcr.visit_start_time} - {fcr.visit_end_time})</div>
                    <div style={{ marginBottom: '0.5rem' }}><strong>Diagnosis:</strong> {fcr.diagnosis}</div>
                    <div style={{ marginBottom: '0.5rem' }}><strong>Action Taken:</strong> {fcr.action_taken}</div>
                    {fcr.parts_replaced && <div style={{ marginBottom: '0.5rem' }}><strong>Parts Replaced:</strong> {fcr.parts_replaced}</div>}
                    <div style={{ marginBottom: '0.5rem' }}><strong>Activity Code:</strong> {fcr.activity_code}</div>
                    {fcr.suggestions && <div><strong>Engineer Suggestions:</strong> {fcr.suggestions}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Satisfaction</label>
                      <select
                        className="form-input"
                        value={fcrRating}
                        onChange={(e) => setFcrRating(e.target.value)}
                        required
                      >
                        <option value="5">5 ★ (Excellent)</option>
                        <option value="4">4 ★ (Good)</option>
                        <option value="3">3 ★ (Average)</option>
                        <option value="2">2 ★ (Poor)</option>
                        <option value="1">1 ★ (Very Poor)</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: '0' }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Feedback / Sign-off Comments</label>
                      <input
                        type="text"
                        className="form-input"
                        value={fcrFeedback}
                        onChange={(e) => setFcrFeedback(e.target.value)}
                        placeholder="Leave feedback or sign-off message..."
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submittingFcrAction}
                    >
                      Confirm Resolution & Close Ticket
                    </button>
                  </div>
                </form>
              )}

              {/* CASE 3: Read-only submitted or finalized view for Agent/Admin/Customer */}
              {fcr && (fcr.status === 'Finalized' || (fcr.status === 'Submitted' && user.role !== 'CUSTOMER')) && (
                <div style={{ fontSize: '0.9rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Service Timing</div>
                      <div style={{ fontWeight: 'bold' }}>Date: {new Date(fcr.visit_date).toLocaleDateString()}</div>
                      <div>Time: {fcr.visit_start_time} - {fcr.visit_end_time}</div>
                    </div>
                    <div>
                      <div style={{ marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Service Code & Replaced Parts</div>
                      <div style={{ fontWeight: 'bold' }}>Activity Code: {fcr.activity_code}</div>
                      <div>Parts Replaced: {fcr.parts_replaced || 'None'}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Diagnosis</div>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--primary-color)' }}>
                      {fcr.diagnosis}
                    </div>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Action Taken</div>
                    <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '4px', borderLeft: '3px solid var(--primary-color)' }}>
                      {fcr.action_taken}
                    </div>
                  </div>

                  {fcr.suggestions && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Engineer Recommendations</div>
                      <div>{fcr.suggestions}</div>
                    </div>
                  )}

                  {fcr.status === 'Finalized' ? (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem', background: '#f0fdf4', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#16a34a', marginBottom: '0.25rem' }}>
                        <span>Customer Confirmation Sign-off</span>
                        <span>Rating: {'★'.repeat(fcr.customer_rating)}</span>
                      </div>
                      <div>Comments: "{fcr.customer_feedback || 'No comments left'}"</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                        Confirmed on {new Date(fcr.customer_confirmed_at).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Awaiting customer confirmation and sign-off.
                    </div>
                  )}
                </div>
              )}

              {/* CASE 4: Customer viewing before FCR is submitted (draft status) */}
              {user.role === 'CUSTOMER' && (!fcr || fcr.status === 'Draft') && (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: '0' }}>
                  The engineer has not submitted the service call report for this complaint yet.
                </p>
              )}

              {/* CASE 5: Staff view where FCR draft is not yet created */}
              {user.role !== 'CUSTOMER' && (user.role !== 'AGENT' || complaint.assigned_to_id !== user.id) && !fcr && (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: '0' }}>
                  No service call report has been registered for this complaint.
                </p>
              )}

              {/* CASE 6: Assigned Agent when FCR is submitted */}
              {user.role === 'AGENT' && complaint.assigned_to_id === user.id && fcr && fcr.status === 'Submitted' && (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: '0', borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
                  You have submitted this FCR. It is now read-only pending customer sign-off.
                </p>
              )}
            </div>
          )}

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
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                        onClick={() => handleDownloadAttachment(att.id, att.file_name)}
                      >
                        Download
                      </button>
                      {(user.role === 'ADMIN' || (att.uploaded_by_id === user.id && complaint.status !== 'Closed')) && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap', backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                          onClick={() => handleDeleteAttachment(att.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
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
