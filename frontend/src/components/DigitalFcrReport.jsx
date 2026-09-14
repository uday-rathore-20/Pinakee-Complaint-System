import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function DigitalFcrReport({
  complaintId,
  complaintStatus,
  onRefresh,
  onDownloadPdf
}) {
  const { user, token, authFetch } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // FCR Data
  const [reportData, setReportData] = useState(null);

  // Form State
  const [callType, setCallType] = useState('Breakdown');
  const [problemReported, setProblemReported] = useState('');
  const [diagnosedProblem, setDiagnosedProblem] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [resolution, setResolution] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [engineerRemarks, setEngineerRemarks] = useState('');
  const [clientRemarks, setClientRemarks] = useState('');
  const [activityCode, setActivityCode] = useState('ACT-01');
  const [delayCode, setDelayCode] = useState('');
  const [errorCode, setErrorCode] = useState('');

  // Network State
  const [ipAddress, setIpAddress] = useState('');
  const [subnetMask, setSubnetMask] = useState('');
  const [gateway, setGateway] = useState('');
  const [preferredDns, setPreferredDns] = useState('');
  const [alternateDns, setAlternateDns] = useState('');

  // Visit Timing
  const [visitDate, setVisitDate] = useState('');
  const [visitStartTime, setVisitStartTime] = useState('09:00');
  const [visitEndTime, setVisitEndTime] = useState('10:00');

  // Multi Devices State
  const [devices, setDevices] = useState([]);

  // Multi Parts State
  const [parts, setParts] = useState([]);

  // Customer Sign-off State
  const [customerRating, setCustomerRating] = useState(5);
  const [customerFeedback, setCustomerFeedback] = useState('');

  // Active Tab for UI Organization
  const [activeTab, setActiveTab] = useState('service'); // 'service', 'equipment', 'network', 'parts', 'signoff'

  useEffect(() => {
    fetchFcr();
  }, [complaintId]);

  const fetchFcr = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`/complaints/${complaintId}/fcr`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch Service Report');
      }

      setReportData(data.data);
      const fcr = data.data.fcr || {};
      setCallType(fcr.call_type || 'Breakdown');
      setProblemReported(fcr.problem_reported || data.data.complaint?.description || '');
      setDiagnosedProblem(fcr.diagnosed_problem || fcr.diagnosis || '');
      setActionTaken(fcr.action_taken || '');
      setResolution(fcr.resolution || '');
      setSuggestions(fcr.suggestion_to_client || fcr.suggestions || '');
      setEngineerRemarks(fcr.engineer_remarks || '');
      setClientRemarks(fcr.client_remarks || '');
      setActivityCode(fcr.activity_code || 'ACT-01');
      setDelayCode(fcr.delay_code || '');
      setErrorCode(fcr.error_code || '');

      setIpAddress(fcr.ip_address || '');
      setSubnetMask(fcr.subnet_mask || '');
      setGateway(fcr.gateway || '');
      setPreferredDns(fcr.preferred_dns || '');
      setAlternateDns(fcr.alternate_dns || '');

      setVisitDate(fcr.visit_date ? fcr.visit_date.substring(0, 10) : new Date().toISOString().substring(0, 10));
      setVisitStartTime(fcr.visit_start_time ? fcr.visit_start_time.substring(0, 5) : '09:00');
      setVisitEndTime(fcr.visit_end_time ? fcr.visit_end_time.substring(0, 5) : '10:00');

      setDevices(data.data.devices && data.data.devices.length > 0 ? data.data.devices : [
        { product_name: 'Primary Equipment', model: '', verified_model: '', serial_number: '', verified_serial_number: '', customer_machine_id: '', site_id: '', line_site_side_id: '' }
      ]);

      setParts(data.data.parts || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Device Row Handlers
  const handleAddDevice = () => {
    setDevices([
      ...devices,
      { product_name: '', model: '', verified_model: '', serial_number: '', verified_serial_number: '', connected_device_serial_number: '', customer_machine_id: '', site_id: '', location_branch: '', line_site_side_id: '' }
    ]);
  };

  const handleDeviceChange = (index, field, val) => {
    const updated = [...devices];
    updated[index][field] = val;
    setDevices(updated);
  };

  const handleRemoveDevice = (index) => {
    setDevices(devices.filter((_, i) => i !== index));
  };

  // Part Row Handlers
  const handleAddPart = () => {
    setParts([
      ...parts,
      { part_name: '', old_serial_number: '', new_serial_number: '', quantity: 1, remarks: '' }
    ]);
  };

  const handlePartChange = (index, field, val) => {
    const updated = [...parts];
    updated[index][field] = val;
    setParts(updated);
  };

  const handleRemovePart = (index) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  // Save Draft Handler
  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);
      setError('');
      setSuccessMsg('');

      const payload = {
        call_type: callType,
        problem_reported: problemReported,
        diagnosed_problem: diagnosedProblem,
        action_taken: actionTaken,
        resolution: resolution,
        suggestion_to_client: suggestions,
        engineer_remarks: engineerRemarks,
        client_remarks: clientRemarks,
        activity_code: activityCode,
        delay_code: delayCode,
        error_code: errorCode,
        ip_address: ipAddress,
        subnet_mask: subnetMask,
        gateway: gateway,
        preferred_dns: preferredDns,
        alternate_dns: alternateDns,
        visit_date: visitDate,
        visit_start_time: visitStartTime,
        visit_end_time: visitEndTime,
        devices,
        parts
      };

      const res = await authFetch(`/complaints/${complaintId}/fcr`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save FCR draft');
      }

      setSuccessMsg('Service Report draft saved successfully!');
      fetchFcr();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Submit Final FCR Handler
  const handleSubmitFcr = async (e) => {
    if (e) e.preventDefault();

    // Check if complaint is In Progress
    if (complaintStatus === 'Accepted') {
      setError("Please click 'Start Work' to move ticket to 'In Progress' before submitting resolution.");
      return;
    }

    if (!diagnosedProblem.trim()) {
      setError('Diagnosed Problem is mandatory before submitting final service report.');
      setActiveTab('service');
      return;
    }
    if (!actionTaken.trim()) {
      setError('Action Taken is mandatory before submitting final service report.');
      setActiveTab('service');
      return;
    }
    if (!resolution.trim()) {
      setError('Resolution / Solution is mandatory before submitting final service report.');
      setActiveTab('service');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccessMsg('');

      // First ensure draft updates are persisted
      await authFetch(`/complaints/${complaintId}/fcr`, {
        method: 'POST',
        body: JSON.stringify({
          call_type: callType,
          problem_reported: problemReported,
          diagnosed_problem: diagnosedProblem,
          action_taken: actionTaken,
          resolution: resolution,
          suggestion_to_client: suggestions,
          engineer_remarks: engineerRemarks,
          client_remarks: clientRemarks,
          activity_code: activityCode,
          delay_code: delayCode,
          error_code: errorCode,
          ip_address: ipAddress,
          subnet_mask: subnetMask,
          gateway: gateway,
          preferred_dns: preferredDns,
          alternate_dns: alternateDns,
          visit_date: visitDate,
          visit_start_time: visitStartTime,
          visit_end_time: visitEndTime,
          devices,
          parts
        })
      });

      // Submit FCR and resolve ticket
      const res = await authFetch(`/complaints/${complaintId}/fcr/submit`, {
        method: 'POST',
        body: JSON.stringify({
          diagnosed_problem: diagnosedProblem,
          action_taken: actionTaken,
          resolution: resolution,
          suggestion_to_client: suggestions,
          activity_code: activityCode
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit Service Report');
      }

      setSuccessMsg('Service Report submitted successfully! Ticket is now marked as RESOLVED.');
      fetchFcr();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Customer Sign-off Confirmation
  const handleConfirmSignoff = async (e) => {
    if (e) e.preventDefault();
    try {
      setSubmitting(true);
      setError('');
      const res = await authFetch(`/complaints/${complaintId}/fcr/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          customer_rating: customerRating,
          customer_feedback: customerFeedback
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to confirm sign-off');
      }

      setSuccessMsg('Thank you! Resolution signed off and ticket has been closed.');
      fetchFcr();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <div>Loading Digital Field Call Report...</div>
      </div>
    );
  }

  const fcr = reportData?.fcr || {};
  const customer = reportData?.customer || {};
  const engineer = reportData?.engineer || {};
  const complaint = reportData?.complaint || {};
  const isEngineer =
    (user.role === 'ENGINEER' || user.role === 'AGENT') &&
    (complaint.assigned_to_id === user.id || engineer?.id === user.id);
  const isAdmin = user.role === 'ADMIN';
  const isCustomer = user.role === 'CUSTOMER';
  const isDraft = !fcr.status || fcr.status === 'Draft';
  const isSubmitted = fcr.status === 'Submitted';
  const isFinalized = fcr.status === 'Finalized';
  const canEdit = (isEngineer || isAdmin) && isDraft;

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      {/* Header Banner */}
      <div style={{ background: '#0f172a', color: '#ffffff', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#ffffff' }}>Digital Field Call Report (FCR)</h3>
            {fcr.fcr_number && (
              <span style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.03em' }}>
                {fcr.fcr_number}
              </span>
            )}
            <span style={{
              background: isFinalized ? '#059669' : isSubmitted ? '#0284c7' : '#d97706',
              color: '#ffffff',
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              fontWeight: '600',
              textTransform: 'uppercase'
            }}>
              {fcr.status || 'Draft'}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Official service call report and resolution record for Ticket #{complaint.ticket_number}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(isSubmitted || isFinalized) && onDownloadPdf && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onDownloadPdf}
              style={{ background: '#334155', color: '#ffffff', border: '1px solid #475569', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              📄 Download PDF
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ margin: '1rem 1.5rem', padding: '0.75rem 1rem', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMsg && (
        <div style={{ margin: '1rem 1.5rem', padding: '0.75rem 1rem', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: '6px', fontSize: '0.9rem' }}>
          <strong>Success:</strong> {successMsg}
        </div>
      )}

      {/* Auto-populated Summary Cards (Customer & Engineer) */}
      <div style={{ padding: '1.25rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {/* Customer & Location Card */}
        <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Customer & Service Site</span>
            <span style={{ fontSize: '0.75rem', background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '600' }}>
              {customer.customer_code}
            </span>
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0f172a' }}>{customer.name}</div>
          <div style={{ fontSize: '0.85rem', color: '#475569' }}>{customer.company_name} ({customer.customer_type})</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>
            📍 {customer.address ? `${customer.address}, ${customer.city} ${customer.pincode}` : 'No physical address specified'}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
            📞 {customer.phone || 'No phone'} | ✉️ {customer.email}
          </div>
        </div>

        {/* Assigned Engineer Card */}
        <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Assigned Field Engineer</span>
            <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '600' }}>
              {engineer?.engineer_code || 'UNASSIGNED'}
            </span>
          </div>
          {engineer?.name ? (
            <>
              <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0f172a' }}>{engineer.name}</div>
              <div style={{ fontSize: '0.85rem', color: '#475569' }}>{engineer.designation} {engineer.employee_id ? `(#${engineer.employee_id})` : ''}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.35rem' }}>
                📞 {engineer.official_mobile || 'Official mobile on record'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                ✉️ {engineer.official_email}
              </div>
            </>
          ) : (
            <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.5rem 0' }}>
              No field engineer assigned yet.
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f1f5f9', overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setActiveTab('service')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: activeTab === 'service' ? '#ffffff' : 'transparent',
            borderBottom: activeTab === 'service' ? '2px solid #0284c7' : 'none',
            fontWeight: activeTab === 'service' ? '600' : '500',
            color: activeTab === 'service' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
        >
          🔧 Service Details & Resolution
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('equipment')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: activeTab === 'equipment' ? '#ffffff' : 'transparent',
            borderBottom: activeTab === 'equipment' ? '2px solid #0284c7' : 'none',
            fontWeight: activeTab === 'equipment' ? '600' : '500',
            color: activeTab === 'equipment' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
        >
          💻 Equipment & Devices ({devices.length})
        </button>
        {(!isCustomer || isAdmin) && (
          <button
            type="button"
            onClick={() => setActiveTab('network')}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              background: activeTab === 'network' ? '#ffffff' : 'transparent',
              borderBottom: activeTab === 'network' ? '2px solid #0284c7' : 'none',
              fontWeight: activeTab === 'network' ? '600' : '500',
              color: activeTab === 'network' ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap'
            }}
          >
            🌐 Network Configuration
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('parts')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: activeTab === 'parts' ? '#ffffff' : 'transparent',
            borderBottom: activeTab === 'parts' ? '2px solid #0284c7' : 'none',
            fontWeight: activeTab === 'parts' ? '600' : '500',
            color: activeTab === 'parts' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
        >
          📦 Parts Replaced ({parts.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('signoff')}
          style={{
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: activeTab === 'signoff' ? '#ffffff' : 'transparent',
            borderBottom: activeTab === 'signoff' ? '2px solid #0284c7' : 'none',
            fontWeight: activeTab === 'signoff' ? '600' : '500',
            color: activeTab === 'signoff' ? '#0f172a' : '#64748b',
            cursor: 'pointer',
            fontSize: '0.9rem',
            whiteSpace: 'nowrap'
          }}
        >
          ✍️ Sign-off & Confirmation
        </button>
      </div>

      {/* Main Tab Content */}
      <div style={{ padding: '1.5rem' }}>
        {/* TAB 1: SERVICE DETAILS & RESOLUTION */}
        {activeTab === 'service' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Call Metadata Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Call Type</label>
                <select
                  className="form-input"
                  value={callType}
                  onChange={(e) => setCallType(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="Breakdown">Breakdown</option>
                  <option value="Installation">Installation</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Warranty">Warranty</option>
                  <option value="Chargeable">Chargeable</option>
                  <option value="Courtesy">Courtesy</option>
                  <option value="AMC">AMC</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Activity Code</label>
                <select
                  className="form-input"
                  value={activityCode}
                  onChange={(e) => setActivityCode(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="ACT-01">ACT-01: Diagnostics & Analysis</option>
                  <option value="ACT-02">ACT-02: Repairs & Restorations</option>
                  <option value="ACT-03">ACT-03: Part Replacement</option>
                  <option value="ACT-04">ACT-04: Preventive Maintenance</option>
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Delay Code (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. DLY-PARTS-AWAITING"
                  value={delayCode}
                  onChange={(e) => setDelayCode(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Error Code (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. ERR-4021-HEAT"
                  value={errorCode}
                  onChange={(e) => setErrorCode(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Visit Timing */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Visit Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Visit Start Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={visitStartTime}
                  onChange={(e) => setVisitStartTime(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Visit End Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={visitEndTime}
                  onChange={(e) => setVisitEndTime(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Field Travel & Service Milestones Tracking */}
            <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
              <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#166534', fontWeight: '700' }}>
                Operational Field Travel & Service Milestones
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>1. Call Registered</span>
                  <strong>{reportData?.fcr?.call_start_time ? new Date(reportData.fcr.call_start_time).toLocaleString() : 'Pending'}</strong>
                </div>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>2. Travel Started</span>
                  <strong>{reportData?.fcr?.travel_start_time ? new Date(reportData.fcr.travel_start_time).toLocaleString() : 'Not Started'}</strong>
                </div>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>3. Reached Site</span>
                  <strong>{reportData?.fcr?.reached_site_time ? new Date(reportData.fcr.reached_site_time).toLocaleString() : 'Not Arrived'}</strong>
                </div>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>4. Work Started</span>
                  <strong>{reportData?.fcr?.work_start_time ? new Date(reportData.fcr.work_start_time).toLocaleString() : 'Pending'}</strong>
                </div>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>5. Work Closed</span>
                  <strong>{reportData?.fcr?.work_close_time ? new Date(reportData.fcr.work_close_time).toLocaleString() : 'Pending'}</strong>
                </div>
                <div style={{ background: '#fff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', display: 'block' }}>6. Call Closed</span>
                  <strong>{reportData?.fcr?.call_close_time ? new Date(reportData.fcr.call_close_time).toLocaleString() : 'Pending'}</strong>
                </div>
              </div>
            </div>

            {/* Problem Reported */}
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Problem Reported by Customer</label>
              <textarea
                className="form-input"
                rows="2"
                value={problemReported}
                onChange={(e) => setProblemReported(e.target.value)}
                disabled={!canEdit}
                placeholder="Initial problem symptoms..."
              />
            </div>

            {/* Mandatory Resolution Fields */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  Diagnosed Problem / Root Cause <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '600' }}>Required for Resolution</span>
              </div>
              <textarea
                className="form-input"
                rows="3"
                value={diagnosedProblem}
                onChange={(e) => setDiagnosedProblem(e.target.value)}
                disabled={!canEdit}
                placeholder="Detail the technical origin, component failure, or operational cause identified on site..."
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  Action Taken <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '600' }}>Required for Resolution</span>
              </div>
              <textarea
                className="form-input"
                rows="3"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                disabled={!canEdit}
                placeholder="Detail procedures, calibrations, replacements, tests, and steps executed during the visit..."
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                  Final Resolution / Operating State <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '600' }}>Required for Resolution</span>
              </div>
              <textarea
                className="form-input"
                rows="3"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                disabled={!canEdit}
                placeholder="Summary of final machine/service state, test results, and operational sign-off..."
                required
              />
            </div>

            {/* Suggestions & Remarks */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Suggestions to Client (Optional)</label>
                <textarea
                  className="form-input"
                  rows="2"
                  value={suggestions}
                  onChange={(e) => setSuggestions(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Preventive maintenance guidance, environmental requirements..."
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Engineer Remarks (Internal)</label>
                <textarea
                  className="form-input"
                  rows="2"
                  value={engineerRemarks}
                  onChange={(e) => setEngineerRemarks(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Internal notes, follow-up recommendations..."
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EQUIPMENT & DEVICES */}
        {activeTab === 'equipment' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Serviced Equipment & Devices</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Verify model and serial numbers. Engineer-verified specifications are recorded on final FCR.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddDevice}
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                >
                  ➕ Add Device
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {devices.map((dev, idx) => (
                <div key={idx} style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem' }}>Device #{idx + 1}</span>
                    {canEdit && devices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDevice(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', fontWeight: '600' }}
                      >
                        🗑️ Remove
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Product / Device Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.product_name || ''}
                        onChange={(e) => handleDeviceChange(idx, 'product_name', e.target.value)}
                        disabled={!canEdit}
                        placeholder="e.g. Pinakee Thermal Printer"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Device Category</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.device_category || ''}
                        onChange={(e) => handleDeviceChange(idx, 'device_category', e.target.value)}
                        disabled={!canEdit}
                        placeholder="e.g. Printing Unit"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Customer Provided Model</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.model || ''}
                        onChange={(e) => handleDeviceChange(idx, 'model', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Model name"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: '#0369a1' }}>Engineer Verified Model</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.verified_model || ''}
                        onChange={(e) => handleDeviceChange(idx, 'verified_model', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Verified model (Final)"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Customer Provided Serial #</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.serial_number || ''}
                        onChange={(e) => handleDeviceChange(idx, 'serial_number', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Serial number"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: '#0369a1' }}>Engineer Verified Serial #</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.verified_serial_number || ''}
                        onChange={(e) => handleDeviceChange(idx, 'verified_serial_number', e.target.value)}
                        disabled={!canEdit}
                        placeholder="Verified serial (Final)"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Customer Machine ID</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.customer_machine_id || ''}
                        onChange={(e) => handleDeviceChange(idx, 'customer_machine_id', e.target.value)}
                        disabled={!canEdit}
                        placeholder="e.g. M/C-04"
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Line / Site / Side ID</label>
                      <input
                        type="text"
                        className="form-input"
                        value={dev.line_site_side_id || ''}
                        onChange={(e) => handleDeviceChange(idx, 'line_site_side_id', e.target.value)}
                        disabled={!canEdit}
                        placeholder="e.g. Line 2 - North Side"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: NETWORK CONFIGURATION */}
        {activeTab === 'network' && (!isCustomer || isAdmin) && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Technical Network Parameters</h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                On-site network configuration recorded by field engineer / administrator.
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Given IP Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 192.168.1.150"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Subnet Mask</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 255.255.255.0"
                  value={subnetMask}
                  onChange={(e) => setSubnetMask(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Default Gateway</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 192.168.1.1"
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Preferred DNS</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 8.8.8.8"
                  value={preferredDns}
                  onChange={(e) => setPreferredDns(e.target.value)}
                  disabled={!canEdit}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>Alternate DNS</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 1.1.1.1"
                  value={alternateDns}
                  onChange={(e) => setAlternateDns(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PARTS REPLACED */}
        {activeTab === 'parts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Parts Replaced / Exchanged</h4>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                  Document components replaced during the service call with old and new serial numbers.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddPart}
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                >
                  ➕ Add Part
                </button>
              )}
            </div>

            {parts.length === 0 ? (
              <div style={{ background: '#f8fafc', padding: '2rem', textAlign: 'center', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No parts replaced during this service call.</p>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddPart}
                    style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}
                  >
                    Add First Part
                  </button>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Part Name / Description</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Old Serial #</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>New Serial #</th>
                      <th style={{ padding: '0.6rem 0.75rem', width: '80px' }}>Qty</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Remarks</th>
                      {canEdit && <th style={{ padding: '0.6rem 0.75rem', width: '50px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((pt, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={pt.part_name || ''}
                            onChange={(e) => handlePartChange(idx, 'part_name', e.target.value)}
                            disabled={!canEdit}
                            placeholder="e.g. 500W Power Supply"
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={pt.old_serial_number || ''}
                            onChange={(e) => handlePartChange(idx, 'old_serial_number', e.target.value)}
                            disabled={!canEdit}
                            placeholder="Old S/N"
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={pt.new_serial_number || ''}
                            onChange={(e) => handlePartChange(idx, 'new_serial_number', e.target.value)}
                            disabled={!canEdit}
                            placeholder="New S/N"
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input
                            type="number"
                            className="form-input"
                            min="1"
                            value={pt.quantity || 1}
                            onChange={(e) => handlePartChange(idx, 'quantity', e.target.value)}
                            disabled={!canEdit}
                          />
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={pt.remarks || ''}
                            onChange={(e) => handlePartChange(idx, 'remarks', e.target.value)}
                            disabled={!canEdit}
                            placeholder="Warranty / Return notes"
                          />
                        </td>
                        {canEdit && (
                          <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemovePart(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SIGNOFF & CONFIRMATION */}
        {activeTab === 'signoff' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Sign-off & Service Confirmation</h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Service sign-off and customer feedback status.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Engineer Sign-off Card */}
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#1e293b' }}>Engineer Sign-off</h5>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
                  <strong>Representing Engineer:</strong> {fcr.engineer_sign_name || engineer?.name || 'Assigned Representative'}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
                  <strong>FCR Status:</strong> <span style={{ fontWeight: '600' }}>{fcr.status}</span>
                </div>
                {fcr.work_close_time && (
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    <strong>Submitted At:</strong> {new Date(fcr.work_close_time).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Customer Sign-off Card */}
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#1e293b' }}>Customer Confirmation</h5>
                {isFinalized ? (
                  fcr.auto_closed_at && !fcr.customer_confirmed_at ? (
                    <>
                      <div style={{ fontSize: '0.85rem', color: '#475569', fontWeight: '600', marginBottom: '0.5rem' }}>
                        🤖 Closed via System Auto-Closure (72h SLA Inactivity)
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.35rem' }}>
                        <strong>Auto-Closed At:</strong> {new Date(fcr.auto_closed_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.35rem' }}>
                        <strong>Customer Sign-off:</strong> Not recorded (System Closure)
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.35rem' }}>
                        <strong>Rating:</strong> None — System Closure
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        <strong>Feedback:</strong> None recorded
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: '600', marginBottom: '0.5rem' }}>
                        ✓ Confirmed & Closed by Customer
                      </div>
                      {fcr.customer_confirmed_at && (
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.35rem' }}>
                          <strong>Confirmed At:</strong> {new Date(fcr.customer_confirmed_at).toLocaleString()}
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.35rem' }}>
                        <strong>Sign-off Name:</strong> {fcr.customer_sign_name || 'Customer Sign-off'}
                      </div>
                      {fcr.customer_rating && (
                        <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.35rem' }}>
                          <strong>Rating:</strong> {(() => { const r = Math.max(0, Math.min(5, Math.floor(Number(fcr.customer_rating) || 0))); return '⭐'.repeat(r); })()} ({fcr.customer_rating}/5)
                        </div>
                      )}
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        <strong>Feedback:</strong> "{fcr.customer_feedback || 'None recorded'}"
                      </div>
                    </>
                  )
                ) : isSubmitted ? (
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#0284c7', fontWeight: '600', marginBottom: '0.5rem' }}>
                      ⏳ Awaiting Customer Sign-off
                    </div>
                    {isCustomer && (
                      <form onSubmit={handleConfirmSignoff} style={{ marginTop: '0.75rem' }}>
                        <div style={{ marginBottom: '0.75rem' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Service Rating</label>
                          <select
                            className="form-input"
                            value={customerRating}
                            onChange={(e) => setCustomerRating(Number(e.target.value))}
                          >
                            <option value="5">⭐⭐⭐⭐⭐ 5 - Excellent</option>
                            <option value="4">⭐⭐⭐⭐ 4 - Good</option>
                            <option value="3">⭐⭐⭐ 3 - Average</option>
                            <option value="2">⭐⭐ 2 - Poor</option>
                            <option value="1">⭐ 1 - Very Poor</option>
                          </select>
                        </div>
                        <div style={{ marginBottom: '0.75rem' }}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>Feedback Comments (Optional)</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Feedback on engineer service visit..."
                            value={customerFeedback}
                            onChange={(e) => setCustomerFeedback(e.target.value)}
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          style={{ width: '100%', fontSize: '0.85rem' }}
                          disabled={submitting}
                        >
                          {submitting ? 'Confirming...' : '✓ Confirm Resolution & Sign Off'}
                        </button>
                      </form>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Sign-off will unlock once the engineer submits the final Service Report.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Footer for Engineer */}
      {canEdit && (
        <div style={{ background: '#f8fafc', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveDraft}
            disabled={savingDraft || submitting}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1.25rem' }}
          >
            {savingDraft ? 'Saving Draft...' : '💾 Save Draft'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmitFcr}
            disabled={savingDraft || submitting}
            style={{ fontSize: '0.9rem', padding: '0.5rem 1.25rem', background: '#0284c7' }}
          >
            {submitting ? 'Submitting...' : '🚀 Submit Final FCR & Resolve Ticket'}
          </button>
        </div>
      )}
    </div>
  );
}
