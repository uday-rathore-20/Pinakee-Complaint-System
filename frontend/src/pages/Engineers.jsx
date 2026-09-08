import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Engineers = () => {
  const { authFetch } = useAuth();

  // List states
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [error, setError] = useState('');

  // Lookup metadata for skills and expertise
  const [availableSkills, setAvailableSkills] = useState([]);
  const [availableExpertise, setAvailableExpertise] = useState([]);

  // Form Modal States
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [editingEngineer, setEditingEngineer] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [designation, setDesignation] = useState('Field Service Engineer');
  const [department, setDepartment] = useState('IT Support');
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [engineerStatus, setEngineerStatus] = useState('ACTIVE');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('Male');
  const [baseLocation, setBaseLocation] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedExpertise, setSelectedExpertise] = useState([]);
  const [isActive, setIsActive] = useState(true);

  // Detail View State
  const [viewEngineer, setViewEngineer] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Step definitions
  const engineerSteps = [
    { id: 'personal', num: 1, label: 'Personal' },
    { id: 'contact', num: 2, label: 'Contact' },
    { id: 'employment', num: 3, label: 'Employment' },
    { id: 'skills', num: 4, label: 'Skills & Expertise' },
    { id: 'location', num: 5, label: 'Work Location' },
    { id: 'login', num: 6, label: 'Login Account' }
  ];

  const currentStepIndex = engineerSteps.findIndex(s => s.id === activeTab);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === engineerSteps.length - 1;

  // Lock background scrolling when modal is open
  useEffect(() => {
    if (showModal || viewEngineer) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal, viewEngineer]);

  const fetchMeta = async () => {
    try {
      const res = await authFetch('/engineers/meta/skills-expertise');
      const result = await res.json();
      if (result.success) {
        setAvailableSkills(result.data.skills || []);
        setAvailableExpertise(result.data.expertise || []);
      }
    } catch (err) {
      console.error('Failed to load skills metadata:', err);
    }
  };

  const fetchEngineersList = async () => {
    try {
      let url = '/engineers';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (deptFilter) params.append('department', deptFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await authFetch(url);
      const result = await res.json();
      if (result.success) {
        setEngineers(result.data);
      } else {
        setError(result.message || 'Failed to fetch engineers.');
      }
    } catch (err) {
      setError('Connection to server failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    fetchEngineersList();
  }, [search, statusFilter, deptFilter]);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setMobile('');
    setAlternateMobile('');
    setPersonalEmail('');
    setEmergencyContact('');
    setPassword('');
    setConfirmPassword('');
    setEmployeeId('');
    setDesignation('Field Service Engineer');
    setDepartment('IT Support');
    setJoiningDate('');
    setEmploymentType('FULL_TIME');
    setEngineerStatus('ACTIVE');
    setDateOfBirth('');
    setGender('Male');
    setBaseLocation('');
    setCity('');
    setState('');
    setPincode('');
    setSelectedSkills([]);
    setSelectedExpertise([]);
    setIsActive(true);
    setFormError('');
    setActiveTab('personal');
  };

  const handleOpenCreateModal = () => {
    setEditingEngineer(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = async (eng) => {
    setEditingEngineer(eng);
    resetForm();
    try {
      const res = await authFetch(`/engineers/${eng.id}`);
      const result = await res.json();
      if (result.success) {
        const e = result.data.engineer;
        setFirstName(e.first_name || '');
        setLastName(e.last_name || '');
        setEmail(e.email || '');
        setMobile(e.official_mobile || e.phone_number || '');
        setAlternateMobile(e.alternate_mobile || '');
        setPersonalEmail(e.personal_email || '');
        setEmergencyContact(e.emergency_contact || '');
        setEmployeeId(e.employee_id || '');
        setDesignation(e.designation || 'Field Service Engineer');
        setDepartment(e.department || 'IT Support');
        setJoiningDate(e.joining_date ? e.joining_date.substring(0, 10) : '');
        setEmploymentType(e.employment_type || 'FULL_TIME');
        setEngineerStatus(e.engineer_status || 'ACTIVE');
        setDateOfBirth(e.date_of_birth ? e.date_of_birth.substring(0, 10) : '');
        setGender(e.gender || 'Male');
        setBaseLocation(e.base_location || '');
        setCity(e.city || '');
        setState(e.state || '');
        setPincode(e.pincode || '');
        setSelectedSkills((result.data.skills || []).map(s => s.id));
        setSelectedExpertise((result.data.expertise || []).map(ex => ex.id));
        setIsActive(e.is_active !== false);
        setShowModal(true);
      }
    } catch (err) {
      setError('Failed to load engineer details for edit.');
    }
  };

  const handleToggleSkill = (skillId) => {
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
    );
  };

  const handleToggleExpertise = (expId) => {
    setSelectedExpertise(prev =>
      prev.includes(expId) ? prev.filter(id => id !== expId) : [...prev, expId]
    );
  };

  const handleToggleStatus = async (eng) => {
    try {
      const res = await authFetch(`/engineers/${eng.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !eng.is_active })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchEngineersList();
        if (viewEngineer && viewEngineer.engineer.id === eng.id) {
          handleOpenDetailView(eng);
        }
      } else {
        setError(result.message || 'Failed to update status.');
      }
    } catch (err) {
      setError('Connection failure updating status.');
    }
  };

  const handleNextStep = (e) => {
    if (e) e.preventDefault();
    setFormError('');
    if (activeTab === 'personal') {
      if (!firstName.trim() || !lastName.trim()) {
        setFormError('Please enter both First Name and Last Name.');
        return;
      }
    } else if (activeTab === 'contact') {
      if (!email.trim() || !mobile.trim()) {
        setFormError('Official Email and Official Mobile Number are required.');
        return;
      }
    } else if (activeTab === 'employment') {
      if (!employeeId.trim()) {
        setFormError('Employee ID is required.');
        return;
      }
      if (!designation.trim()) {
        setFormError('Designation is required.');
        return;
      }
    } else if (activeTab === 'location') {
      if (!city.trim() || !state.trim()) {
        setFormError('Base City and Base State are required.');
        return;
      }
    }
    if (currentStepIndex < engineerSteps.length - 1) {
      setActiveTab(engineerSteps[currentStepIndex + 1].id);
    }
  };

  const handlePrevStep = () => {
    setFormError('');
    if (currentStepIndex > 0) {
      setActiveTab(engineerSteps[currentStepIndex - 1].id);
    }
  };

  const handleSubmitEngineer = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Engineer first and last name are required.');
      setFormSubmitting(false);
      return;
    }
    if (!email.trim()) {
      setFormError('Official email address is required.');
      setFormSubmitting(false);
      return;
    }
    if (!mobile.trim()) {
      setFormError('Official mobile number is required.');
      setFormSubmitting(false);
      return;
    }
    if (!editingEngineer) {
      if (!password || password.length < 6) {
        setFormError('Password must be at least 6 characters.');
        setFormSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Password and Confirm Password do not match.');
        setFormSubmitting(false);
        return;
      }
    }

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      mobile: mobile.trim(),
      alternate_mobile: alternateMobile.trim() || null,
      personal_email: personalEmail.trim() || null,
      emergency_contact: emergencyContact.trim() || null,
      employee_id: employeeId.trim() || null,
      designation: designation.trim() || 'Field Service Engineer',
      department: department.trim() || 'IT Support',
      joining_date: joiningDate || null,
      employment_type: employmentType,
      engineer_status: engineerStatus,
      date_of_birth: dateOfBirth || null,
      gender,
      base_location: baseLocation.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      pincode: pincode.trim() || null,
      skills: selectedSkills,
      expertise: selectedExpertise,
      is_active: isActive
    };

    if (!editingEngineer) {
      payload.password = password;
      payload.confirm_password = confirmPassword;
    }

    try {
      const url = editingEngineer ? `/engineers/${editingEngineer.id}` : '/engineers';
      const method = editingEngineer ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setShowModal(false);
        resetForm();
        await fetchEngineersList();
        if (editingEngineer && viewEngineer && viewEngineer.engineer.id === editingEngineer.id) {
          handleOpenDetailView(editingEngineer);
        }
      } else {
        setFormError(result.message || 'Failed to save engineer account.');
      }
    } catch (err) {
      setFormError('Server is currently unreachable.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleOpenDetailView = async (eng) => {
    setDetailLoading(true);
    setViewEngineer(null);
    try {
      const res = await authFetch(`/engineers/${eng.id}`);
      const result = await res.json();
      if (result.success) {
        setViewEngineer(result.data);
      } else {
        setError(result.message || 'Failed to load details.');
      }
    } catch (err) {
      setError('Connection failure loading engineer details.');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Field Engineers</h1>
          <p>Manage technical workforce, service expertise, certifications, and operational base stations</p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Add Engineer
        </button>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'center' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Search Engineers</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, code, designation, skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Department</label>
            <select className="form-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All Departments</option>
              <option value="IT Support">IT Support</option>
              <option value="Operations">Operations</option>
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Account Status</label>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Engineers Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading engineers directory...</div>
        ) : engineers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No engineers found matching the criteria.</div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Engineer ID</th>
                  <th>Engineer Name</th>
                  <th>Official Contact</th>
                  <th>Designation & Dept</th>
                  <th>Technical Skills</th>
                  <th>Active Workload</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {engineers.map((eng) => (
                  <tr key={eng.id}>
                    <td>
                      <span className="badge badge-info" style={{ fontWeight: '700', fontSize: '0.75rem' }}>
                        {eng.engineer_code || `ENG-${String(eng.id).padStart(4, '0')}`}
                      </span>
                      {eng.employee_id && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          ID: {eng.employee_id}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {eng.first_name} {eng.last_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {eng.base_location || 'Field Operations'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem' }}>{eng.official_email || eng.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {eng.official_mobile || eng.phone_number || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500', fontSize: '0.82rem' }}>{eng.designation || 'Field Engineer'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{eng.department || 'IT Support'}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '220px' }}>
                        {(eng.skills || []).slice(0, 3).map((sk) => (
                          <span key={sk.id} className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                            {sk.name}
                          </span>
                        ))}
                        {(eng.skills || []).length > 3 && (
                          <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                            +{eng.skills.length - 3} more
                          </span>
                        )}
                        {(eng.skills || []).length === 0 && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${eng.active_tickets_count > 0 ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '0.75rem' }}>
                        {eng.active_tickets_count || 0} active tickets
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${eng.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                        {eng.engineer_status || (eng.is_active ? 'Active' : 'Disabled')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleOpenDetailView(eng)}
                          title="View engineer profile"
                        >
                          View
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleOpenEditModal(eng)}
                          title="Edit engineer details"
                        >
                          Edit
                        </button>
                        <button
                          className={`btn btn-sm ${eng.is_active ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleToggleStatus(eng)}
                          title={eng.is_active ? 'Disable engineer account' : 'Activate engineer account'}
                        >
                          {eng.is_active ? 'Disable' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT ENGINEER MODAL */}
      {showModal && (
        <div className="enterprise-modal-overlay">
          <div className="enterprise-modal-container">
            {/* Modal Header */}
            <div className="enterprise-modal-header">
              <div>
                <h3 className="enterprise-modal-title">
                  {editingEngineer ? `Edit Engineer — ${editingEngineer.first_name} ${editingEngineer.last_name}` : 'Add New Engineer'}
                </h3>
                <p className="enterprise-modal-subtitle">
                  {editingEngineer ? 'Update engineer employment details, skills, and operational status.' : 'Create a field engineer account and configure their service profile.'}
                </p>
              </div>
              <button
                type="button"
                className="enterprise-modal-close"
                onClick={() => setShowModal(false)}
                title="Close modal"
              >
                &times;
              </button>
            </div>

            {/* Stepper Navigation */}
            <div className="enterprise-stepper-bar">
              {engineerSteps.map((step) => {
                const isActive = activeTab === step.id;
                const isCompleted = currentStepIndex > step.num - 1;
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`enterprise-step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => {
                      setFormError('');
                      setActiveTab(step.id);
                    }}
                  >
                    <span className="enterprise-step-badge">
                      {isCompleted ? '✓' : step.num}
                    </span>
                    {step.label}
                  </button>
                );
              })}
            </div>

            {/* Form & Scrollable Content */}
            <form onSubmit={handleSubmitEngineer} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="enterprise-modal-body">
                {formError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <div>{formError}</div>
                  </div>
                )}

                {/* STEP 1: PERSONAL */}
                {activeTab === 'personal' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Personal Information</div>
                      <p className="enterprise-section-subtitle">Basic identity and personal details of the field engineer.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">First Name *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Ramesh"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Last Name *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Patel"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Date of Birth <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="date"
                          className="form-input"
                          value={dateOfBirth}
                          onChange={(e) => setDateOfBirth(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Gender <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <select
                          className="form-select"
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: CONTACT */}
                {activeTab === 'contact' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Contact Information</div>
                      <p className="enterprise-section-subtitle">Official communication channels and emergency contacts.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Official Email Address *</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="engineer@pinakee.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          Primary email for login and dispatch notifications.
                        </small>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Official Mobile Number *</label>
                        <input
                          type="tel"
                          className="form-input"
                          placeholder="+91 91234 56789"
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          required
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          Visible to customer upon active ticket assignment.
                        </small>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Alternate Mobile <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="tel"
                          className="form-input"
                          placeholder="+91 90000 00000"
                          value={alternateMobile}
                          onChange={(e) => setAlternateMobile(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Personal Email <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional • Protected)</span></label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="personal@gmail.com"
                          value={personalEmail}
                          onChange={(e) => setPersonalEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Emergency Contact <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional • Protected)</span></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Sunita Mehta (Spouse) — +91 98111 99999"
                        value={emergencyContact}
                        onChange={(e) => setEmergencyContact(e.target.value)}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                        Private record for administrative purposes. Never exposed to customers.
                      </small>
                    </div>
                  </div>
                )}

                {/* STEP 3: EMPLOYMENT */}
                {activeTab === 'employment' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Employment Information</div>
                      <p className="enterprise-section-subtitle">Official designation, employee ID, and service terms.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Employee ID *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. EMP-101"
                          value={employeeId}
                          onChange={(e) => setEmployeeId(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Designation *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Senior Network Specialist"
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Department</label>
                        <select
                          className="form-select"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                        >
                          <option value="IT Support">IT Support</option>
                          <option value="Operations">Operations</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Employment Type *</label>
                        <select
                          className="form-select"
                          value={employmentType}
                          onChange={(e) => setEmploymentType(e.target.value)}
                        >
                          <option value="FULL_TIME">Full Time</option>
                          <option value="CONTRACT">Contract</option>
                          <option value="TEMPORARY">Temporary</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Joining Date <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="date"
                          className="form-input"
                          value={joiningDate}
                          onChange={(e) => setJoiningDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Operational Status *</label>
                      <select
                        className="form-select"
                        value={engineerStatus}
                        onChange={(e) => setEngineerStatus(e.target.value)}
                      >
                        <option value="ACTIVE">ACTIVE (Eligible for complaint assignment)</option>
                        <option value="ON_LEAVE">ON_LEAVE (Temporarily unavailable)</option>
                        <option value="DISABLED">DISABLED (Account deactivated)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* STEP 4: SKILLS & EXPERTISE */}
                {activeTab === 'skills' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Technical Skills & Expertise</div>
                      <p className="enterprise-section-subtitle">Select specialized technical capabilities and supported device categories.</p>
                    </div>

                    <div style={{ marginBottom: '1.75rem' }}>
                      <label className="form-label" style={{ marginBottom: '0.6rem' }}>
                        Technical Skills <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Select all that apply)</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.65rem' }}>
                        {availableSkills.map((sk) => {
                          const isSelected = selectedSkills.includes(sk.id);
                          return (
                            <div
                              key={sk.id}
                              className={`enterprise-chip-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleToggleSkill(sk.id)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                              />
                              <span>{sk.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="form-label" style={{ marginBottom: '0.6rem' }}>
                        Device & Service Expertise <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Select all that apply)</span>
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.65rem' }}>
                        {availableExpertise.map((ex) => {
                          const isSelected = selectedExpertise.includes(ex.id);
                          return (
                            <div
                              key={ex.id}
                              className={`enterprise-chip-card ${isSelected ? 'cyan-selected' : ''}`}
                              onClick={() => handleToggleExpertise(ex.id)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{ accentColor: 'var(--brand-cyan)', cursor: 'pointer' }}
                              />
                              <span>{ex.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 5: WORK LOCATION */}
                {activeTab === 'location' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Base Service Location</div>
                      <p className="enterprise-section-subtitle">Operational dispatch hub and service territory.</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Base Operations Station / Hub <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. PINakee Field Operations HQ, Zone 2"
                        value={baseLocation}
                        onChange={(e) => setBaseLocation(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Base City *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Bhopal"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Base State *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Madhya Pradesh"
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Base Pincode <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 462003"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 6: LOGIN ACCOUNT */}
                {activeTab === 'login' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Login & Credentials</div>
                      <p className="enterprise-section-subtitle">Account security and access credentials.</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Login Identifier / Email</label>
                      <input
                        type="text"
                        className="form-input"
                        value={email || 'Defined in Step 2: Contact'}
                        disabled
                        style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                        System access role: <strong>ENGINEER</strong>
                      </small>
                    </div>

                    {!editingEngineer ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Initial Password *</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              className="form-input"
                              placeholder="Minimum 6 characters"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              style={{ paddingRight: '4rem' }}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              style={{
                                position: 'absolute',
                                right: '0.6rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--primary-color)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                padding: '0.25rem'
                              }}
                            >
                              {showPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Confirm Password *</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              className="form-input"
                              placeholder="Re-type password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              style={{ paddingRight: '4rem' }}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              style={{
                                position: 'absolute',
                                right: '0.6rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--primary-color)',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                padding: '0.25rem'
                              }}
                            >
                              {showConfirmPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="alert alert-info" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                        Password updates for existing engineers are managed via the secure User Administration reset flow.
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Account Activation Status</label>
                      <select
                        className="form-select"
                        value={isActive ? 'true' : 'false'}
                        onChange={(e) => setIsActive(e.target.value === 'true')}
                      >
                        <option value="true">ACTIVE (Allowed to login and claim tickets)</option>
                        <option value="false">DISABLED (Login blocked)</option>
                      </select>
                    </div>

                    <div className="enterprise-info-card" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary-color)', flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                      </svg>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Password is securely hashed and never stored as plain text.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Sticky Footer Action Bar */}
              <div className="enterprise-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {!isFirstStep && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handlePrevStep}
                    >
                      Back
                    </button>
                  )}

                  {!isLastStep ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleNextStep}
                    >
                      Next Step &rarr;
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={formSubmitting}
                    >
                      {formSubmitting
                        ? 'Saving Engineer...'
                        : (editingEngineer ? 'Update Engineer Profile' : 'Create Engineer Account')}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED ENGINEER VIEW MODAL */}
      {viewEngineer && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-container" style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                    {viewEngineer.engineer.engineer_code || `ENG-${String(viewEngineer.engineer.id).padStart(4, '0')}`}
                  </span>
                  <h3 style={{ margin: 0 }}>{viewEngineer.engineer.first_name} {viewEngineer.engineer.last_name}</h3>
                  <span className={`badge ${viewEngineer.engineer.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                    {viewEngineer.engineer.engineer_status || (viewEngineer.engineer.is_active ? 'Active' : 'Disabled')}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {viewEngineer.engineer.designation} • {viewEngineer.engineer.department} • Employee ID: {viewEngineer.engineer.employee_id || 'N/A'}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewEngineer(null)}>&times;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '0.5rem' }}>
              <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
                <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                  Official Communications
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Official Email:</span> <a href={`mailto:${viewEngineer.engineer.official_email || viewEngineer.engineer.email}`} style={{ color: 'var(--primary-color)' }}>{viewEngineer.engineer.official_email || viewEngineer.engineer.email}</a></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Official Mobile:</span> <a href={`tel:${viewEngineer.engineer.official_mobile || viewEngineer.engineer.phone_number}`} style={{ color: 'var(--primary-color)', fontWeight: '600' }}>{viewEngineer.engineer.official_mobile || viewEngineer.engineer.phone_number}</a></div>
                  {viewEngineer.engineer.alternate_mobile && <div><span style={{ color: 'var(--text-muted)' }}>Alt Mobile:</span> {viewEngineer.engineer.alternate_mobile}</div>}
                  {viewEngineer.engineer.personal_email && <div><span style={{ color: 'var(--text-muted)' }}>Personal Email (Protected):</span> {viewEngineer.engineer.personal_email}</div>}
                  {viewEngineer.engineer.emergency_contact && <div><span style={{ color: 'var(--text-muted)' }}>Emergency Contact:</span> {viewEngineer.engineer.emergency_contact}</div>}
                </div>
              </div>

              <div className="card" style={{ borderLeft: '4px solid var(--brand-cyan)' }}>
                <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                  Base Operations Location
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: '600' }}>{viewEngineer.engineer.base_location || 'Field Operations Hub'}</div>
                  <div>{[viewEngineer.engineer.city, viewEngineer.engineer.state].filter(Boolean).join(', ')}{viewEngineer.engineer.pincode ? ` - ${viewEngineer.engineer.pincode}` : ''}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Employment: {viewEngineer.engineer.employment_type || 'FULL_TIME'}</div>
                  {viewEngineer.engineer.joining_date && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Joined: {new Date(viewEngineer.engineer.joining_date).toLocaleDateString()}</div>}
                </div>
              </div>

              <div className="card" style={{ gridColumn: 'span 2' }}>
                <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                  Technical Capabilities & Device Expertise
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Skills</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {viewEngineer.skills?.length > 0 ? (
                        viewEngineer.skills.map((sk) => (
                          <span key={sk.id} className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                            {sk.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No skills recorded.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Device Expertise</span>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {viewEngineer.expertise?.length > 0 ? (
                        viewEngineer.expertise.map((ex) => (
                          <span key={ex.id} className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                            {ex.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No expertise types recorded.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Engineers;
