import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import DigitalFcrReport from '../components/DigitalFcrReport';
import ErrorBoundary from '../components/ErrorBoundary';

const formatPausedDuration = (duration) => {
  if (!duration) return '0s';
  if (typeof duration === 'string') {
    return duration;
  }
  if (typeof duration === 'object') {
    const parts = [];
    if (duration.years) parts.push(`${duration.years}y`);
    if (duration.months) parts.push(`${duration.months}m`);
    if (duration.days) parts.push(`${duration.days}d`);
    if (duration.hours) parts.push(`${duration.hours}h`);
    if (duration.minutes) parts.push(`${duration.minutes}m`);
    if (duration.seconds) parts.push(`${duration.seconds}s`);
    return parts.length > 0 ? parts.join(' ') : '0s';
  }
  return String(duration);
};

const ComplaintDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authFetch } = useAuth();
  const socket = useSocket();

  // Socket.IO real-time comments room integration
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('join_complaint_room', { complaintId: parseInt(id, 10) });

    const handleNewComment = (newComment) => {
      setComments(prev => {
        if (prev.some(c => c.id === newComment.id)) return prev;
        return [...prev, newComment];
      });
    };

    socket.on('comment:created', handleNewComment);

    return () => {
      socket.off('comment:created', handleNewComment);
      socket.emit('leave_complaint_room', { complaintId: parseInt(id, 10) });
    };
  }, [socket, id]);

  // Data States
  const [complaint, setComplaint] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [engineerInfo, setEngineerInfo] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Lookup collections for controls
  const [statuses, setStatuses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [agents, setAgents] = useState([]);

  // Form States
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [transitionRemarks, setTransitionRemarks] = useState('');
  const [updatingCategory, setUpdatingCategory] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingAssign, setUpdatingAssign] = useState(false);
  const [claimingTicket, setClaimingTicket] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingComplaint, setDeletingComplaint] = useState(false);

  // Milestone 1 Workflow Modal States
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdReasonInput, setHoldReasonInput] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReasonInput, setReopenReasonInput] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmRating, setConfirmRating] = useState(5);
  const [confirmFeedback, setConfirmFeedback] = useState('');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [submittingWorkflowAction, setSubmittingWorkflowAction] = useState(false);

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

  // CSAT Feedback Loop States
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [csatRating, setCsatRating] = useState(5);
  const [csatComments, setCsatComments] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  // Milestone 3: Field Travel, Reassignment & Evidence States
  const [evidenceStage, setEvidenceStage] = useState('GENERAL');
  const [fcrDetails, setFcrDetails] = useState(null);
  const [reassignmentRequests, setReassignmentRequests] = useState([]);
  const [showReassignRequestModal, setShowReassignRequestModal] = useState(false);
  const [reassignReasonInput, setReassignReasonInput] = useState('');
  const [showReassignApproveModal, setShowReassignApproveModal] = useState(false);
  const [reassignTargetEngineer, setReassignTargetEngineer] = useState('');
  const [reassignDecisionReason, setReassignDecisionReason] = useState('');
  const [showReassignRejectModal, setShowReassignRejectModal] = useState(false);
  const [reassignRejectReason, setReassignRejectReason] = useState('');
  const [submittingReassignAction, setSubmittingReassignAction] = useState(false);
  const [travelingAction, setTravelingAction] = useState(false);

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopyStatus(fieldName);
    setTimeout(() => setCopyStatus(''), 2000);
  };

  const fetchComplaintDetails = async () => {
    try {
      const res = await authFetch(`/complaints/${id}`);
      const result = await res.json();

      if (res.ok && result.success) {
        setComplaint(result.data.complaint);
        setCustomerInfo(result.data.customer || null);
        setEngineerInfo(result.data.engineer || null);
        setComments(result.data.comments);
        setHistory(result.data.status_history);

        setSelectedStatus(result.data.complaint.status_id);
        setSelectedCategory(result.data.complaint.category_id || '');
        setSelectedDept(result.data.complaint.department_id || '');
        setSelectedAgent(result.data.complaint.assigned_to_id || '');
      } else {
        setError(result.message || 'Failed to load complaint details.');
      }

      // Also fetch FCR & Reassignment Requests
      try {
        const fcrRes = await authFetch(`/complaints/${id}/fcr`);
        const fcrJson = await fcrRes.json();
        if (fcrJson.success) {
          setFcrDetails(fcrJson.data?.fcr || null);
          setReassignmentRequests(fcrJson.data?.reassignmentRequests || []);
        }
      } catch (fcrErr) {
        console.error('Error fetching FCR details in page:', fcrErr);
      }

    } catch (err) {
      setError('Connection to server failed.');
    }
  };

  // Milestone 3 Handlers: Field Travel
  const handleStartTravel = async () => {
    try {
      setTravelingAction(true);
      setActionError('');
      const res = await authFetch(`/complaints/${id}/travel/start`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to record travel start');
      }
      await fetchComplaintDetails();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTravelingAction(false);
    }
  };

  const handleReachedSite = async () => {
    try {
      setTravelingAction(true);
      setActionError('');
      const res = await authFetch(`/complaints/${id}/travel/reached`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to record site arrival');
      }
      await fetchComplaintDetails();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTravelingAction(false);
    }
  };

  // Milestone 3 Handlers: Reassignment Request Workflow
  const handleRequestReassignment = async (e) => {
    if (e) e.preventDefault();
    if (!reassignReasonInput.trim()) {
      setActionError('Please specify the mandatory reason for requesting reassignment');
      return;
    }
    try {
      setSubmittingReassignAction(true);
      setActionError('');
      const res = await authFetch(`/complaints/${id}/reassignment/request`, {
        method: 'POST',
        body: JSON.stringify({ reason: reassignReasonInput.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit reassignment request');
      }
      setShowReassignRequestModal(false);
      setReassignReasonInput('');
      await fetchComplaintDetails();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmittingReassignAction(false);
    }
  };

  const handleApproveReassignment = async (e) => {
    if (e) e.preventDefault();
    if (!reassignTargetEngineer) {
      setActionError('Please select a new engineer to assign');
      return;
    }
    try {
      setSubmittingReassignAction(true);
      setActionError('');
      const res = await authFetch(`/complaints/${id}/reassignment/approve`, {
        method: 'POST',
        body: JSON.stringify({
          new_engineer_id: parseInt(reassignTargetEngineer, 10),
          decision_reason: reassignDecisionReason.trim() || 'Approved by administrator'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to approve reassignment');
      }
      setShowReassignApproveModal(false);
      setReassignDecisionReason('');
      setReassignTargetEngineer('');
      await fetchComplaintDetails();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmittingReassignAction(false);
    }
  };

  const handleRejectReassignment = async (e) => {
    if (e) e.preventDefault();
    if (!reassignRejectReason.trim()) {
      setActionError('Please provide a mandatory decision reason for rejecting the request');
      return;
    }
    try {
      setSubmittingReassignAction(true);
      setActionError('');
      const res = await authFetch(`/complaints/${id}/reassignment/reject`, {
        method: 'POST',
        body: JSON.stringify({
          decision_reason: reassignRejectReason.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reject reassignment');
      }
      setShowReassignRejectModal(false);
      setReassignRejectReason('');
      await fetchComplaintDetails();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmittingReassignAction(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const statusRes = await authFetch('/statuses');
      const statusesResult = await statusRes.json();
      if (statusesResult.success) setStatuses(statusesResult.data);

      const catRes = await authFetch('/categories');
      const categoriesResult = await catRes.json();
      if (categoriesResult.success) setCategories(categoriesResult.data);

      // Staff roles can load engineers for assignment list
      if (user.role === 'ADMIN' || user.role === 'DEPT_HEAD') {
        const usersRes = await authFetch('/users?is_active=true');
        const usersResult = await usersRes.json();
        if (usersResult.success) {
          // Filter to select only engineers (ENGINEER or legacy AGENT)
          const engineers = usersResult.data.filter(u => u.role === 'ENGINEER' || u.role === 'AGENT');
          setAgents(engineers);
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

  const fetchFeedbackDetails = async () => {
    try {
      setFeedbackLoading(true);
      const res = await authFetch(`/complaints/${id}/feedback`);
      const result = await res.json();
      if (res.ok && result.success) {
        setFeedback(result.data);
      }
    } catch (err) {
      console.error('Failed to load feedback details:', err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setFeedbackError('');
    setSubmittingFeedback(true);

    try {
      const res = await authFetch(`/complaints/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating: csatRating,
          comments: csatComments
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchFeedbackDetails();
      } else {
        setFeedbackError(result.message || 'Failed to submit feedback.');
      }
    } catch (err) {
      setFeedbackError('Network error submitting feedback.');
    } finally {
      setSubmittingFeedback(false);
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

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    setActionError('');
    setUpdatingCategory(true);

    try {
      const res = await authFetch(`/complaints/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          category_id: selectedCategory ? parseInt(selectedCategory, 10) : null
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to update category.');
      }
    } catch (err) {
      setActionError('Connection failure updating category.');
    } finally {
      setUpdatingCategory(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchComplaintDetails();
      await fetchLookups();
      await fetchAttachments();
      await fetchFcrData();
      await fetchFeedbackDetails();
      setLoading(false);
    };
    init();
  }, [id]);

  useEffect(() => {
    if (complaint && statuses.length) {
      const allowed = [];
      const current = complaint.status;
      if (current !== 'Closed') {
        if (user.role === 'CUSTOMER') {
          if (current === 'Resolved') {
            allowed.push(...statuses.filter(s => s.name === 'Closed'));
          }
        } else if (user.role === 'ENGINEER' || user.role === 'AGENT') {
          if (complaint.assigned_to_id === user.id) {
            if (current === 'Assigned') {
              allowed.push(...statuses.filter(s => s.name === 'In Progress'));
            }
            if (['In Progress', 'Assigned'].includes(current)) {
              allowed.push(...statuses.filter(s => ['On Hold', 'Waiting on Customer'].includes(s.name)));
            }
            if (['On Hold', 'Waiting on Customer'].includes(current)) {
              allowed.push(...statuses.filter(s => s.name === 'In Progress'));
            }
          }
        } else if (user.role === 'ADMIN' || (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id)) {
          if (current === 'Assigned') {
            allowed.push(...statuses.filter(s => s.name === 'In Progress'));
          } else if (current === 'Resolved') {
            allowed.push(...statuses.filter(s => s.name === 'Closed'));
          }
          if (['In Progress', 'Assigned'].includes(current)) {
            allowed.push(...statuses.filter(s => ['On Hold', 'Waiting on Customer'].includes(s.name)));
          }
          if (['On Hold', 'Waiting on Customer'].includes(current)) {
            allowed.push(...statuses.filter(s => ['In Progress', 'Assigned'].includes(s.name)));
          }
        }
      }
      if (allowed.length > 0) {
        setSelectedStatus(allowed[0].id);
      }
    }
  }, [complaint, statuses, user]);

  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setActionError('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (user.role !== 'CUSTOMER') {
      formData.append('evidence_stage', evidenceStage);
    }

    try {
      const res = await authFetch(`/complaints/${id}/attachments`, {
        method: 'POST',
        body: formData
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setSelectedFile(null);
        setEvidenceStage('GENERAL');
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

      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        const result = await res.json();
        if (result.success && result.downloadUrl) {
          const link = document.createElement('a');
          link.href = result.downloadUrl;
          link.setAttribute('target', '_blank');
          document.body.appendChild(link);
          link.click();
          link.parentNode.removeChild(link);
        } else {
          throw new Error(result.message || 'Failed to obtain download URL');
        }
      } else {
        // Fallback for legacy streams
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
      }
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

  const handleAcceptComplaint = async () => {
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const res = await authFetch(`/complaints/${id}/claim`, {
        method: 'PATCH'
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to accept complaint.');
      }
    } catch (err) {
      setActionError('Network error accepting complaint.');
    } finally {
      setSubmittingWorkflowAction(false);
    }
  };

  const handleStartWork = async () => {
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const inProgStatus = statuses.find(s => s.name === 'In Progress');
      if (!inProgStatus) throw new Error('In Progress status not found');
      const res = await authFetch(`/complaints/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status_id: inProgStatus.id,
          remarks: 'Engineer started active work'
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to start work.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error starting work.');
    } finally {
      setSubmittingWorkflowAction(false);
    }
  };

  const handlePutOnHold = async (e) => {
    e.preventDefault();
    if (!holdReasonInput.trim()) {
      setActionError('A valid hold reason is required.');
      return;
    }
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const holdStatus = statuses.find(s => s.name === 'On Hold');
      if (!holdStatus) throw new Error('On Hold status not found');
      const res = await authFetch(`/complaints/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status_id: holdStatus.id,
          hold_reason: holdReasonInput.trim(),
          remarks: holdReasonInput.trim()
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setShowHoldModal(false);
        setHoldReasonInput('');
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to put ticket on hold.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error putting ticket on hold.');
    } finally {
      setSubmittingWorkflowAction(false);
    }
  };

  const handleResumeWork = async () => {
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const inProgStatus = statuses.find(s => s.name === 'In Progress');
      if (!inProgStatus) throw new Error('In Progress status not found');
      const res = await authFetch(`/complaints/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status_id: inProgStatus.id,
          remarks: 'Work resumed by engineer'
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to resume work.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error resuming work.');
    } finally {
      setSubmittingWorkflowAction(false);
    }
  };

  const handleReopenComplaint = async (e) => {
    e.preventDefault();
    if (!reopenReasonInput.trim()) {
      setActionError('Please specify why the problem still exists.');
      return;
    }
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const res = await authFetch(`/complaints/${id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reopenReasonInput.trim()
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setShowReopenModal(false);
        setReopenReasonInput('');
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to reopen complaint.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error reopening complaint.');
    } finally {
      setSubmittingWorkflowAction(false);
    }
  };

  const handleConfirmResolution = async (e) => {
    if (e) e.preventDefault();
    const ratingInt = parseInt(confirmRating, 10);
    if (isNaN(ratingInt) || ratingInt < 1 || ratingInt > 5) {
      setActionError('Please provide a valid rating between 1 and 5 stars.');
      return;
    }
    setActionError('');
    setSubmittingConfirm(true);
    try {
      const res = await authFetch(`/complaints/${id}/fcr/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          customer_rating: ratingInt,
          customer_feedback: confirmFeedback.trim()
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setShowConfirmModal(false);
        setConfirmFeedback('');
        setConfirmRating(5);
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to confirm resolution.');
      }
    } catch (err) {
      setActionError(err.message || 'Network error confirming resolution.');
    } finally {
      setSubmittingConfirm(false);
    }
  };

  const handleCancelComplaint = async (e) => {
    if (e) e.preventDefault();
    setActionError('');
    setSubmittingWorkflowAction(true);
    try {
      const res = await authFetch(`/complaints/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          reason: cancelReasonInput.trim() || 'Cancelled by user'
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setShowCancelModal(false);
        setCancelReasonInput('');
        await fetchComplaintDetails();
      } else {
        setActionError(result.message || 'Failed to cancel complaint.');
      }
    } catch (err) {
      setActionError('Network error cancelling complaint.');
    } finally {
      setSubmittingWorkflowAction(false);
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
  const priorityKey = complaint.priority ? complaint.priority.toLowerCase() : 'medium';
  const statusKey = complaint.status ? complaint.status.toLowerCase().replace(/ /g, '-') : 'pending';
  const isStaff = user.role !== 'CUSTOMER';
  const isAdminOrHead = user.role === 'ADMIN' || (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id);

  const allowedOptions = [];
  if (complaint && statuses.length) {
    const current = complaint.status;
    if (current !== 'Closed' && current !== 'Cancelled') {
      if (user.role === 'CUSTOMER') {
        if (current === 'Pending') {
          allowedOptions.push(...statuses.filter(s => s.name === 'Cancelled'));
        } else if (current === 'Resolved') {
          allowedOptions.push(...statuses.filter(s => s.name === 'Closed'));
        }
      } else if (user.role === 'ENGINEER' || user.role === 'AGENT') {
        if (complaint.assigned_to_id === user.id) {
          if (current === 'Assigned') {
            allowedOptions.push(...statuses.filter(s => s.name === 'Accepted'));
          } else if (current === 'Accepted') {
            allowedOptions.push(...statuses.filter(s => ['In Progress', 'On Hold'].includes(s.name)));
          } else if (current === 'In Progress') {
            allowedOptions.push(...statuses.filter(s => s.name === 'On Hold'));
          } else if (current === 'On Hold') {
            allowedOptions.push(...statuses.filter(s => s.name === 'In Progress'));
          }
        }
      } else if (user.role === 'ADMIN' || (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id)) {
        if (current === 'Pending') {
          allowedOptions.push(...statuses.filter(s => ['Assigned', 'Cancelled'].includes(s.name)));
        } else if (current === 'Admin Review') {
          allowedOptions.push(...statuses.filter(s => s.name === 'Assigned'));
        } else if (current === 'Assigned') {
          allowedOptions.push(...statuses.filter(s => s.name === 'Accepted'));
        } else if (current === 'Accepted') {
          allowedOptions.push(...statuses.filter(s => ['In Progress', 'On Hold'].includes(s.name)));
        } else if (current === 'In Progress') {
          allowedOptions.push(...statuses.filter(s => s.name === 'On Hold'));
        } else if (current === 'On Hold') {
          allowedOptions.push(...statuses.filter(s => s.name === 'In Progress'));
        } else if (current === 'Resolved') {
          allowedOptions.push(...statuses.filter(s => s.name === 'Closed'));
        }
      }
    }
  }

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
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={`badge badge-${priorityKey}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{complaint.priority}</span>
          <span className={`badge badge-${statusKey}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>{complaint.status}</span>
          {user.role === 'CUSTOMER' && complaint.created_by_id === user.id && complaint.status === 'Pending' && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setShowCancelModal(true)}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              Cancel Complaint
            </button>
          )}
        </div>
      </div>

      {/* Admin Review Banner */}
      {complaint.status === 'Admin Review' && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '1.5rem',
            background: '#faf5ff',
            border: '1px solid #d8b4fe',
            color: '#6b21a8',
            padding: '1.15rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem'
          }}
        >
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
          <div style={{ flexGrow: 1 }}>
            <h4 style={{ margin: 0, fontWeight: 'bold', color: '#581c87', fontSize: '1rem' }}>
              Customer Reopened Ticket — Administrative Review Required
            </h4>
            <div style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: '#6b21a8' }}>
              <strong>Customer Rejection Reason:</strong> "{complaint.reopen_reason || 'Problem still exists'}"
            </div>
            {complaint.assignee_first_name && (
              <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: '#7e22ce' }}>
                Previous Assigned Engineer: <strong>{complaint.assignee_first_name} {complaint.assignee_last_name}</strong>
              </div>
            )}
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: '#9333ea' }}>
              Please review the service report & timeline, then reassign an engineer to proceed with resolution.
            </p>
          </div>
        </div>
      )}

      {complaint.is_escalated && (
        <div
          className="alert alert-danger"
          style={{
            marginBottom: '1.5rem',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>🚨</span>
          <div>
            <h4 style={{ margin: 0, fontWeight: 'bold' }}>SLA Escalation Triggered (Level {complaint.escalation_level})</h4>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              This ticket exceeded its resolution timeline limit and was auto-escalated on <strong>{new Date(complaint.escalated_at).toLocaleString()}</strong>.
              {complaint.assignee_first_name && (
                <span> It has been reassigned to manager: <strong>{complaint.assignee_first_name} {complaint.assignee_last_name}</strong>.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {complaint.paused_at && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '1.5rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>⏸️</span>
          <div>
            <h4 style={{ margin: 0, fontWeight: 'bold' }}>SLA Timer Paused ({complaint.status})</h4>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>
              Resolution countdown is suspended since <strong>{new Date(complaint.paused_at).toLocaleString()}</strong>.
              {complaint.total_paused_duration && (
                <span> Total paused duration accumulated: <strong>{formatPausedDuration(complaint.total_paused_duration)}</strong>.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Milestone 4: Resolution SLA Confirmation & Auto-Close Notice Banner */}
      {complaint.status === 'Resolved' && (
        <div
          className="alert alert-info"
          style={{
            marginBottom: '1.5rem',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            padding: '1.15rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem'
          }}
        >
          <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⏱️</span>
          <div style={{ flexGrow: 1 }}>
            <h4 style={{ margin: 0, fontWeight: 'bold', color: '#14532d', fontSize: '1rem' }}>
              Service Completed — Awaiting Customer Confirmation
            </h4>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.875rem' }}>
              The field engineer has completed on-site service and submitted the Service Call Report.
              {fcrDetails?.work_close_time && (
                <span> Resolved on: <strong>{new Date(fcrDetails.work_close_time).toLocaleString()}</strong>.</span>
              )}
            </p>
            {fcrDetails?.work_close_time && (() => {
              const resolvedTime = new Date(fcrDetails.work_close_time).getTime();
              const now = Date.now();
              const elapsedMs = Math.max(0, now - resolvedTime);
              const elapsedHrs = Math.floor(elapsedMs / (1000 * 60 * 60));
              const remainingHrs = Math.max(0, 72 - elapsedHrs);
              return (
                <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: '#15803d' }}>
                  <span>Elapsed: <strong>{elapsedHrs} hrs</strong> | Auto-closes in approximately: <strong>{remainingHrs} hrs</strong> (72h policy).</span>
                  {(fcrDetails.reminder_24h_sent_at || fcrDetails.reminder_48h_sent_at) && (
                    <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
                      {fcrDetails.reminder_24h_sent_at && <span className="badge" style={{ background: '#bbf7d0', color: '#166534' }}>✓ 24h Reminder Sent</span>}
                      {fcrDetails.reminder_48h_sent_at && <span className="badge" style={{ background: '#fed7aa', color: '#9a3412' }}>✓ 48h Reminder Sent</span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Customer Resolution Action Controls */}
            {user.role === 'CUSTOMER' && complaint.created_by_id === user.id && (
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '0.9rem',
                  borderTop: '1px solid #bbf7d0'
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#14532d', marginBottom: '0.35rem' }}>
                  Customer Action Required
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#166534' }}>
                  Please review the completed service and choose an action to confirm resolution or reopen if the issue persists.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={submittingConfirm || submittingWorkflowAction}
                    style={{
                      background: '#16a34a',
                      borderColor: '#16a34a',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      padding: '0.5rem 1rem',
                      fontWeight: '600'
                    }}
                  >
                    ✓ Confirm Resolution
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setShowReopenModal(true)}
                    disabled={submittingConfirm || submittingWorkflowAction}
                    style={{
                      background: '#dc2626',
                      borderColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      padding: '0.5rem 1rem',
                      fontWeight: '600'
                    }}
                  >
                    ⚠ Reopen Complaint
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Milestone 4: Closed Ticket Resolution Source Banner */}
      {complaint.status === 'Closed' && (
        <div
          className="alert alert-secondary"
          style={{
            marginBottom: '1.5rem',
            background: fcrDetails?.auto_closed_at ? '#f8fafc' : '#f0fdf4',
            border: fcrDetails?.auto_closed_at ? '1px solid #cbd5e1' : '1px solid #bbf7d0',
            color: fcrDetails?.auto_closed_at ? '#475569' : '#166534',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>{fcrDetails?.auto_closed_at ? '🤖' : '✅'}</span>
          <div>
            <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '0.95rem' }}>
              {fcrDetails?.auto_closed_at ? 'Ticket Closed via System Auto-Closure' : 'Ticket Closed via Customer Confirmation'}
            </h4>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem' }}>
              {fcrDetails?.auto_closed_at ? (
                <span>Closed automatically after 72 hours of customer inactivity following service resolution on <strong>{new Date(fcrDetails.auto_closed_at).toLocaleString()}</strong>.</span>
              ) : (
                <span>Confirmed and closed by customer on <strong>{fcrDetails?.customer_confirmed_at ? new Date(fcrDetails.customer_confirmed_at).toLocaleString() : 'sign-off'}</strong>{fcrDetails?.customer_rating ? ` (Rating: ${fcrDetails.customer_rating}/5)` : ''}.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Reassignment Request Notice Banner */}
      {(() => {
        const pendingReassign = reassignmentRequests.find(r => r.status === 'PENDING');
        if (!pendingReassign) return null;
        return (
          <div
            className="alert alert-warning"
            style={{
              marginBottom: '1.5rem',
              background: '#eff6ff',
              border: '1px solid #93c5fd',
              color: '#1e40af',
              padding: '1.15rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.85rem'
            }}
          >
            <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>🔄</span>
            <div style={{ flexGrow: 1 }}>
              <h4 style={{ margin: 0, fontWeight: 'bold', color: '#1e3a8a', fontSize: '1rem' }}>
                Reassignment Requested by Field Engineer
              </h4>
              <div style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: '#1e40af' }}>
                <strong>Engineer:</strong> {pendingReassign.engineer_first_name} {pendingReassign.engineer_last_name}
              </div>
              <div style={{ marginTop: '0.2rem', fontSize: '0.9rem', color: '#1e40af' }}>
                <strong>Reason:</strong> "{pendingReassign.reason}"
              </div>
              <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: '#3b82f6' }}>
                Requested on {new Date(pendingReassign.requested_at).toLocaleString()}
              </div>
              {(user.role === 'ADMIN' || user.role === 'DEPT_HEAD') && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setReassignTargetEngineer('');
                      setReassignDecisionReason('');
                      setShowReassignApproveModal(true);
                    }}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                  >
                    Approve & Reassign
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      setReassignRejectReason('');
                      setShowReassignRejectModal(true);
                    }}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', background: '#ef4444', borderColor: '#ef4444' }}
                  >
                    Reject Request
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {actionError && <div className="alert alert-danger">{actionError}</div>}

      <div className="section-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {/* Main Details card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              Issue Description
            </h3>
            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text-color)', fontSize: '0.975rem' }}>
              {complaint.description}
            </p>
          </div>

          {/* Digital FCR / Service Report */}
          {['In Progress', 'On Hold', 'Resolved', 'Closed'].includes(complaint.status) ? (
            <ErrorBoundary
              fallback={({ error: _error, reset }) => (
                <div className="card" role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
                  <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>
                    Service Report Unavailable
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
                    This section encountered an error and could not be displayed.
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={reset}
                  >
                    Try Again
                  </button>
                </div>
              )}
            >
              <DigitalFcrReport
                complaintId={id}
                complaintStatus={complaint.status}
                onRefresh={fetchComplaintDetails}
                onDownloadPdf={handleDownloadPdf}
              />
            </ErrorBoundary>
          ) : (
            <div className="card" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '1.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>🔒</div>
              <h4 style={{ margin: '0 0 0.4rem 0', color: '#334155', fontSize: '1rem', fontWeight: '600' }}>
                Digital Field Call Report Locked
              </h4>
              <p style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.85rem' }}>
                The service report will unlock once the engineer starts work at the customer site.
              </p>
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                Current status: <strong>{complaint.status}</strong>
              </div>
            </div>
          )}

          {/* Attachments Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              File Attachments & Evidence ({attachments.length})
            </h3>

            {/* Evidence Photo Checklist for High and Critical priority complaints */}
            {['High', 'Critical'].includes(complaint.priority) && (() => {
              const isImg = (m) => ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(m);
              const hasBefore = attachments.some(a => a.evidence_stage === 'BEFORE' && isImg(a.mime_type));
              const hasDuring = attachments.some(a => a.evidence_stage === 'DURING' && isImg(a.mime_type));
              const hasAfter = attachments.some(a => a.evidence_stage === 'AFTER' && isImg(a.mime_type));

              return (
                <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                      Mandatory Photo Evidence Checklist ({complaint.priority} Priority):
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Verified image files required for FCR resolution</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: hasBefore ? '#16a34a' : '#ea580c', fontWeight: '700' }}>
                      {hasBefore ? '✓ BEFORE Photo' : '○ BEFORE Photo Missing'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: hasDuring ? '#16a34a' : '#ea580c', fontWeight: '700' }}>
                      {hasDuring ? '✓ DURING Photo' : '○ DURING Photo Missing'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: hasAfter ? '#16a34a' : '#ea580c', fontWeight: '700' }}>
                      {hasAfter ? '✓ AFTER Photo' : '○ AFTER Photo Missing'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {attachments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>No attachments uploaded yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {attachments.map(att => (
                  <li key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                    <div style={{ wordBreak: 'break-all', paddingRight: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--secondary-color)' }}>{att.file_name}</strong>
                        {att.evidence_stage && att.evidence_stage !== 'GENERAL' && (
                          <span
                            className="badge badge-info"
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.45rem',
                              background: '#0284c7',
                              color: '#fff',
                              borderRadius: '4px'
                            }}
                          >
                            {att.evidence_stage} EVIDENCE
                          </span>
                        )}
                      </div>
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
                      {(user.role === 'ADMIN' || (att.uploaded_by_id === user.id && complaint.status !== 'Closed' && !(user.role === 'CUSTOMER' && att.evidence_stage && att.evidence_stage !== 'GENERAL'))) && (
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
                <div style={{ display: 'grid', gridTemplateColumns: user.role !== 'CUSTOMER' ? '1fr 180px auto' : '1fr auto', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    type="file"
                    id="file-upload-input"
                    className="form-input"
                    style={{ padding: '0.4rem 0.8rem' }}
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    required
                  />

                  {user.role !== 'CUSTOMER' && (
                    <select
                      className="form-input"
                      value={evidenceStage}
                      onChange={(e) => setEvidenceStage(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '0.4rem 0.5rem' }}
                    >
                      <option value="GENERAL">General File</option>
                      <option value="BEFORE">Before Work Photo</option>
                      <option value="DURING">During Work Photo</option>
                      <option value="AFTER">After Work Photo</option>
                    </select>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile} style={{ whiteSpace: 'nowrap' }}>
                    {uploading ? 'Uploading...' : 'Upload File'}
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Supported formats: image (JPEG, PNG, WebP), PDF, text, document (Max 5MB). High/Critical priority resolution requires Before, During, and After image photos.
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
          {/* Metadata Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
              Ticket Details
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Category:</span>{' '}
                <strong>{complaint.category || <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>Uncategorized</span>}</strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Filed By:</span>{' '}
                <strong>{complaint.creator_first_name} {complaint.creator_last_name}</strong>
              </li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Assigned Engineer:</span>{' '}
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
              {complaint.due_date && (
                <li>
                  <span style={{ color: 'var(--text-muted)' }}>SLA Deadline:</span>{' '}
                  <strong>{new Date(complaint.due_date).toLocaleString()}</strong>
                  <div style={{ marginTop: '0.25rem' }}>
                    {complaint.status === 'Resolved' || complaint.status === 'Closed' ? (
                       <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>SATISFIED</span>
                    ) : complaint.paused_at ? (
                       <span className="badge badge-warning" style={{ fontSize: '0.75rem', backgroundColor: '#fef3c7', color: '#d97706' }}>PAUSED</span>
                    ) : new Date(complaint.due_date) < new Date() ? (
                       <span className="badge badge-danger" style={{ fontSize: '0.75rem' }}>OVERDUE</span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                        Due in {Math.ceil((new Date(complaint.due_date) - new Date()) / (1000 * 60 * 60))} hours
                      </span>
                    )}
                  </div>
                </li>
              )}
              {complaint.paused_at && (
                <li>
                  <span style={{ color: 'var(--text-muted)' }}>Paused At:</span>{' '}
                  <strong>{new Date(complaint.paused_at).toLocaleString()}</strong>
                </li>
              )}
              {complaint.total_paused_duration && (
                <li>
                  <span style={{ color: 'var(--text-muted)' }}>Total Paused Time:</span>{' '}
                  <strong>{formatPausedDuration(complaint.total_paused_duration)}</strong>
                </li>
              )}
            </ul>
          </div>

          {/* Customer / Service Location Card */}
          {customerInfo && (
            <div className="card" style={{ borderLeft: '4px solid var(--brand-cyan)' }}>
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Customer / Service Location</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</span>
                  <strong style={{ fontSize: '0.95rem' }}>{customerInfo.name || 'Valued Customer'}</strong>
                </div>
                {customerInfo.phone && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</span>
                    <a href={`tel:${customerInfo.phone}`} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: '600' }}>
                      {customerInfo.phone}
                    </a>
                  </div>
                )}
                {customerInfo.email && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</span>
                    <a href={`mailto:${customerInfo.email}`} style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>
                      {customerInfo.email}
                    </a>
                  </div>
                )}
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Location</span>
                  <div style={{ background: '#f8fafc', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginTop: '0.25rem', lineHeight: '1.4' }}>
                    {customerInfo.location_name && (
                      <div style={{ fontWeight: '600', color: 'var(--primary-color)', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                        📍 {customerInfo.location_name}
                      </div>
                    )}
                    <div>{customerInfo.address || 'Service address on record'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {[customerInfo.city, customerInfo.state].filter(Boolean).join(', ')}{customerInfo.pincode ? ` - ${customerInfo.pincode}` : ''}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {customerInfo.phone && (
                    <a href={`tel:${customerInfo.phone}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                      📞 Call Customer
                    </a>
                  )}
                  {customerInfo.phone && (
                    <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} onClick={() => handleCopy(customerInfo.phone, 'cust_phone')}>
                      {copyStatus === 'cust_phone' ? 'Copied Phone!' : '📋 Copy Phone'}
                    </button>
                  )}
                  {customerInfo.address && (
                    <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} onClick={() => handleCopy(`${customerInfo.address || ''}, ${customerInfo.city || ''}, ${customerInfo.state || ''} ${customerInfo.pincode || ''}`.trim(), 'cust_addr')}>
                      {copyStatus === 'cust_addr' ? 'Copied Address!' : '📍 Copy Address'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Assigned Engineer Card */}
          <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
              Assigned Engineer
            </h3>
            {engineerInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Engineer Name</span>
                  <strong style={{ fontSize: '0.95rem' }}>{engineerInfo.name}</strong>
                </div>
                {engineerInfo.phone && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Phone</span>
                    <a href={`tel:${engineerInfo.phone}`} style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: '600' }}>
                      {engineerInfo.phone}
                    </a>
                  </div>
                )}
                {engineerInfo.email && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</span>
                    <a href={`mailto:${engineerInfo.email}`} style={{ color: 'var(--primary-color)', textDecoration: 'none' }}>
                      {engineerInfo.email}
                    </a>
                  </div>
                )}
                {user.role === 'ADMIN' && engineerInfo.address && (
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Operations Base / Address</span>
                    <div style={{ background: '#f8fafc', padding: '0.5rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', marginTop: '0.25rem', lineHeight: '1.4' }}>
                      <div>{engineerInfo.address}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {[engineerInfo.city, engineerInfo.state].filter(Boolean).join(', ')}{engineerInfo.pincode ? ` - ${engineerInfo.pincode}` : ''}
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</span>
                  <span className="badge badge-info" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                    {engineerInfo.status || complaint.status}
                  </span>
                </div>

                {/* Engineer action buttons */}
                {engineerInfo.phone && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <a href={`tel:${engineerInfo.phone}`} className="btn btn-sm btn-primary" style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                      📞 Call Engineer
                    </a>
                    <button type="button" className="btn btn-sm btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} onClick={() => handleCopy(engineerInfo.phone, 'eng_phone')}>
                      {copyStatus === 'eng_phone' ? 'Copied Phone!' : '📋 Copy Phone'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic', padding: '0.25rem 0' }}>
                {user.role === 'ADMIN'
                  ? 'Not Assigned'
                  : 'Not yet assigned — An engineer will be assigned shortly.'}
              </div>
            )}
          </div>

          {/* Customer Satisfaction Feedback (CSAT) Widget */}
          {complaint.status === 'Closed' && (
            <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Customer Satisfaction Feedback
              </h3>
              {feedbackLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading feedback details...</p>
              ) : feedback ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem', color: '#f59e0b' }}>
                      {(() => { const r = Math.max(0, Math.min(5, Math.floor(Number(feedback.rating) || 0))); return '★'.repeat(r) + '☆'.repeat(5 - r); })()}
                    </span>
                    <strong style={{ fontSize: '0.9rem' }}>({feedback.rating} / 5)</strong>
                  </div>
                  {feedback.comments ? (
                    <p style={{ fontSize: '0.875rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', margin: 0, fontStyle: 'italic' }}>
                      "{feedback.comments}"
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No comments left.</p>
                  )}
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Submitted on {new Date(feedback.created_at).toLocaleString()}
                  </div>
                </div>
              ) : user.role === 'CUSTOMER' && complaint.created_by_id === user.id ? (
                <form onSubmit={handleSubmitFeedback}>
                  {feedbackError && <div className="alert alert-danger" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{feedbackError}</div>}
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>Your Rating</label>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setCsatRating(star)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '1.5rem',
                            color: star <= csatRating ? '#f59e0b' : '#cbd5e1',
                            outline: 'none'
                          }}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>Comments (Optional)</label>
                    <textarea
                      className="form-input"
                      rows="2"
                      value={csatComments}
                      onChange={(e) => setCsatComments(e.target.value)}
                      placeholder="Share your experience..."
                      style={{ fontSize: '0.85rem' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block" disabled={submittingFeedback} style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                    {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </form>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, fontStyle: 'italic' }}>
                  No feedback has been submitted for this complaint yet.
                </p>
              )}
            </div>
          )}

          {/* Milestone 1: Engineer Workflow Action Widget */}
          {user && (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id && (
            <div className="card" style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem', color: 'var(--primary-dark)' }}>
                Field Engineer Actions
              </h3>

              {/* State 1: Assigned -> Accept Complaint */}
              {complaint.status === 'Assigned' && (
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    This complaint has been assigned to you. Accept the assignment to acknowledge and proceed to customer site.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={handleAcceptComplaint}
                    disabled={submittingWorkflowAction}
                  >
                    {submittingWorkflowAction ? 'Accepting...' : 'Accept Complaint'}
                  </button>
                </div>
              )}

              {/* State 2: Accepted -> Start Work or Put On Hold */}
              {/* State 2: Accepted -> Field Travel Sequence & Start Work */}
              {complaint.status === 'Accepted' && (
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    You have accepted this ticket. Complete the travel steps to record on-site attendance before starting diagnostic/repair work.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {!fcrDetails?.travel_start_time && (
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={handleStartTravel}
                        disabled={travelingAction || submittingWorkflowAction}
                        style={{ background: '#2563eb', borderColor: '#2563eb' }}
                      >
                        {travelingAction ? 'Starting Travel...' : '🚗 Start Travel'}
                      </button>
                    )}

                    {fcrDetails?.travel_start_time && !fcrDetails?.reached_site_time && (
                      <>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', color: '#1e40af' }}>
                          🚗 Travel started: <strong>{new Date(fcrDetails.travel_start_time).toLocaleTimeString()}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          onClick={handleReachedSite}
                          disabled={travelingAction || submittingWorkflowAction}
                          style={{ background: '#059669', borderColor: '#059669' }}
                        >
                          {travelingAction ? 'Recording Arrival...' : '📍 Reached Site'}
                        </button>
                      </>
                    )}

                    {fcrDetails?.reached_site_time && (
                      <>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.5rem', borderRadius: '6px', fontSize: '0.8rem', color: '#166534' }}>
                          📍 Reached site: <strong>{new Date(fcrDetails.reached_site_time).toLocaleTimeString()}</strong>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-block"
                          onClick={handleStartWork}
                          disabled={submittingWorkflowAction}
                        >
                          {submittingWorkflowAction ? 'Starting Work...' : '⚙️ Start Work'}
                        </button>
                      </>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn-warning btn-block"
                        onClick={() => setShowHoldModal(true)}
                        disabled={submittingWorkflowAction}
                        style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                      >
                        Put On Hold
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-block"
                        onClick={() => {
                          setReassignReasonInput('');
                          setShowReassignRequestModal(true);
                        }}
                        disabled={submittingWorkflowAction}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                      >
                        🔄 Reassign
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* State 3: In Progress -> Put On Hold / Reassign */}
              {complaint.status === 'In Progress' && (
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    Work is actively in progress. Complete diagnosis & repair steps and submit the Field Call Report below.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-warning btn-block"
                      onClick={() => setShowHoldModal(true)}
                      disabled={submittingWorkflowAction}
                      style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff', fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                    >
                      Put On Hold
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      onClick={() => {
                        setReassignReasonInput('');
                        setShowReassignRequestModal(true);
                      }}
                      disabled={submittingWorkflowAction}
                      style={{ fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                    >
                      🔄 Reassign
                    </button>
                  </div>
                </div>
              )}

              {/* State 4: On Hold -> Resume Work */}
              {complaint.status === 'On Hold' && (
                <div>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '0.65rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#92400e' }}>
                    <strong>Hold Reason:</strong> {complaint.hold_reason || 'Ticket is on hold pending resources/parts.'}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={handleResumeWork}
                    disabled={submittingWorkflowAction}
                  >
                    {submittingWorkflowAction ? 'Resuming...' : 'Resume Work'}
                  </button>
                </div>
              )}

              {/* State 5: Resolved */}
              {complaint.status === 'Resolved' && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>
                  Field work completed and FCR submitted. Awaiting customer review and sign-off.
                </p>
              )}

              {/* State 6: Closed */}
              {complaint.status === 'Closed' && (
                <p style={{ fontSize: '0.85rem', color: '#16a34a', margin: 0, fontWeight: 'bold' }}>
                  ✓ This ticket has been verified and closed.
                </p>
              )}
            </div>
          )}

          {/* Classification Category Widget (Engineer / Admin) */}
          {user && (user.role === 'ADMIN' || user.role === 'ENGINEER' || user.role === 'AGENT') && (
            <div className="card">
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Complaint Category
              </h3>
              <form onSubmit={handleUpdateCategory}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Select Category</label>
                  <select
                    className="form-input"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-secondary btn-block" disabled={updatingCategory}>
                  {updatingCategory ? 'Saving Category...' : 'Save Category'}
                </button>
              </form>
            </div>
          )}

          {/* Status update widget (Admin / Permitted role) */}
          {allowedOptions.length > 0 && user.role === 'ADMIN' && (
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
                    {allowedOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
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
          )}

          {/* Assign Engineer widget (Admin only) */}
          {user.role === 'ADMIN' && (
            <div className="card">
              <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                {complaint.status === 'Admin Review' ? 'Reassign Field Engineer' : 'Assign Field Engineer'}
              </h3>
              <form onSubmit={handleAssignRouting}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Select Field Engineer</label>
                  <select
                    className="form-input"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.first_name} {a.last_name} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>

                <button type="submit" className="btn btn-primary btn-block" disabled={updatingAssign}>
                  {updatingAssign ? 'Saving Assignment...' : 'Confirm Assignment'}
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

      {/* Put On Hold Modal */}
      {showHoldModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Put Ticket On Hold</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowHoldModal(false); setHoldReasonInput(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handlePutOnHold}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  Please enter the specific reason why this ticket is being placed on hold (e.g., waiting for replacement spare parts, awaiting site access).
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mandatory Hold Reason *</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={holdReasonInput}
                    onChange={(e) => setHoldReasonInput(e.target.value)}
                    placeholder="Enter detailed reason for hold..."
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowHoldModal(false); setHoldReasonInput(''); }}
                  disabled={submittingWorkflowAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-warning"
                  disabled={submittingWorkflowAction || !holdReasonInput.trim()}
                  style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}
                >
                  {submittingWorkflowAction ? 'Saving...' : 'Confirm On Hold'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Complaint Modal */}
      {showReopenModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reopen-modal-title">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 id="reopen-modal-title">Reopen Complaint</h2>
              <button
                type="button"
                aria-label="Close dialog"
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowReopenModal(false); setReopenReasonInput(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleReopenComplaint}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  Please specify why the service resolution was unsatisfactory or why the issue remains unresolved. This will route the ticket to Admin Review for reassignment.
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="reopen-reason-input" className="form-label">Mandatory Rejection / Reopen Reason *</label>
                  <textarea
                    id="reopen-reason-input"
                    className="form-input"
                    rows="3"
                    value={reopenReasonInput}
                    onChange={(e) => setReopenReasonInput(e.target.value)}
                    placeholder="Describe why the issue is not resolved..."
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowReopenModal(false); setReopenReasonInput(''); }}
                  disabled={submittingWorkflowAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingWorkflowAction || !reopenReasonInput.trim()}
                  style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                >
                  {submittingWorkflowAction ? 'Reopening...' : 'Reopen Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Resolution Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-resolution-title">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 id="confirm-resolution-title">Confirm Resolution</h2>
              <button
                type="button"
                aria-label="Close dialog"
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowConfirmModal(false); setConfirmFeedback(''); setConfirmRating(5); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleConfirmResolution}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  The service has been completed by the engineer. Confirming resolution verifies the service visit and closes this ticket.
                </p>

                {/* Rating Selection 1-5 Stars */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label id="confirm-rating-label" className="form-label" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                    Service Rating (1 to 5 Stars) *
                  </label>
                  <div
                    role="radiogroup"
                    aria-labelledby="confirm-rating-label"
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  >
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={confirmRating === star}
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        onClick={() => setConfirmRating(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0.2rem',
                          fontSize: '1.75rem',
                          lineHeight: 1,
                          color: star <= confirmRating ? '#f59e0b' : '#cbd5e1',
                          outline: 'none',
                          transition: 'transform 0.1s ease'
                        }}
                      >
                        ★
                      </button>
                    ))}
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#64748b', marginLeft: '0.5rem' }}>
                      ({confirmRating} / 5)
                    </span>
                  </div>
                </div>

                {/* Optional Feedback Comments */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="confirm-feedback-input" className="form-label" style={{ fontWeight: '600', marginBottom: '0.35rem' }}>
                    Feedback Comments (Optional)
                  </label>
                  <textarea
                    id="confirm-feedback-input"
                    className="form-input"
                    rows="3"
                    value={confirmFeedback}
                    onChange={(e) => setConfirmFeedback(e.target.value)}
                    placeholder="Share feedback on the engineer's service visit..."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowConfirmModal(false); setConfirmFeedback(''); setConfirmRating(5); }}
                  disabled={submittingConfirm}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingConfirm}
                  style={{
                    backgroundColor: '#16a34a',
                    borderColor: '#16a34a',
                    color: '#ffffff',
                    fontWeight: '600'
                  }}
                >
                  {submittingConfirm ? 'Confirming...' : '✓ Confirm & Close Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Complaint Confirmation Modal */}
      {showCancelModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h2>Cancel Complaint</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowCancelModal(false); setCancelReasonInput(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCancelComplaint}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-color)', marginBottom: '0.75rem' }}>
                  Are you sure you want to cancel this complaint?
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Cancellation Reason (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={cancelReasonInput}
                    onChange={(e) => setCancelReasonInput(e.target.value)}
                    placeholder="Why are you cancelling this ticket?"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowCancelModal(false); setCancelReasonInput(''); }}
                  disabled={submittingWorkflowAction}
                >
                  Keep Ticket
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingWorkflowAction}
                  style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                >
                  {submittingWorkflowAction ? 'Cancelling...' : 'Cancel Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Engineer Reassignment Request Modal */}
      {showReassignRequestModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Request Ticket Reassignment</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowReassignRequestModal(false); setReassignReasonInput(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRequestReassignment}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  Submit a formal request to transfer this ticket to another engineer. This request will be queued for administrator review.
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mandatory Reassignment Reason *</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={reassignReasonInput}
                    onChange={(e) => setReassignReasonInput(e.target.value)}
                    placeholder="Describe why reassignment is required (e.g. specialized skill needed, location mismatch)..."
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowReassignRequestModal(false); setReassignReasonInput(''); }}
                  disabled={submittingReassignAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingReassignAction || !reassignReasonInput.trim()}
                >
                  {submittingReassignAction ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reassignment Approve Modal */}
      {showReassignApproveModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Approve & Reassign Ticket</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowReassignApproveModal(false); setReassignDecisionReason(''); setReassignTargetEngineer(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleApproveReassignment}>
              <div style={{ padding: '1rem 0' }}>
                <div className="form-group">
                  <label className="form-label">Assign To Field Engineer *</label>
                  <select
                    className="form-input"
                    value={reassignTargetEngineer}
                    onChange={(e) => setReassignTargetEngineer(e.target.value)}
                    required
                  >
                    <option value="">-- Select New Engineer --</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.first_name} {a.last_name} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Approval Remarks (Optional)</label>
                  <textarea
                    className="form-input"
                    rows="2"
                    value={reassignDecisionReason}
                    onChange={(e) => setReassignDecisionReason(e.target.value)}
                    placeholder="Approval comments or handoff instructions..."
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowReassignApproveModal(false); setReassignDecisionReason(''); setReassignTargetEngineer(''); }}
                  disabled={submittingReassignAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingReassignAction || !reassignTargetEngineer}
                >
                  {submittingReassignAction ? 'Approving...' : 'Approve & Reassign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Reassignment Reject Modal */}
      {showReassignRejectModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Reject Reassignment Request</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => { setShowReassignRejectModal(false); setReassignRejectReason(''); }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRejectReassignment}>
              <div style={{ padding: '1rem 0' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  Provide a mandatory decision explanation explaining why the engineer must retain this service assignment.
                </p>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mandatory Rejection Decision Reason *</label>
                  <textarea
                    className="form-input"
                    rows="3"
                    value={reassignRejectReason}
                    onChange={(e) => setReassignRejectReason(e.target.value)}
                    placeholder="Reason for rejecting reassignment..."
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowReassignRejectModal(false); setReassignRejectReason(''); }}
                  disabled={submittingReassignAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={submittingReassignAction || !reassignRejectReason.trim()}
                  style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
                >
                  {submittingReassignAction ? 'Rejecting...' : 'Reject Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintDetail;
