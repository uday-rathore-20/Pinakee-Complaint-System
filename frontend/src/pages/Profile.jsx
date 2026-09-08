import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Profile = () => {
  const { user, setUser, authFetch } = useAuth();

  // Profile Details Form States
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [submittingDetails, setSubmittingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSuccess, setDetailsSuccess] = useState('');

  // Extended Profile Data
  const [customerData, setCustomerData] = useState(null);
  const [engineerData, setEngineerData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Change Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Service Location Sub-Modal State for Customer
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locState, setLocState] = useState('');
  const [locPincode, setLocPincode] = useState('');
  const [locContactPerson, setLocContactPerson] = useState('');
  const [locContactNumber, setLocContactNumber] = useState('');
  const [locSubmitting, setLocSubmitting] = useState(false);
  const [locError, setLocError] = useState('');

  const fetchRoleProfile = async () => {
    if (!user) return;
    setLoadingProfile(true);
    try {
      if (user.role === 'CUSTOMER') {
        const res = await authFetch(`/customers/${user.id}`);
        const result = await res.json();
        if (result.success) {
          setCustomerData(result.data);
        }
      } else if (user.role === 'ENGINEER' || user.role === 'AGENT') {
        const res = await authFetch(`/engineers/${user.id}`);
        const result = await res.json();
        if (result.success) {
          setEngineerData(result.data);
        }
      }
    } catch (err) {
      console.error('Failed to load role profile:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
      setPhone(user.phone_number || '');
      fetchRoleProfile();
    }
  }, [user]);

  const handleUpdateDetails = async (e) => {
    e.preventDefault();
    setDetailsError('');
    setDetailsSuccess('');
    setSubmittingDetails(true);

    if (!firstName.trim() || !lastName.trim()) {
      setDetailsError('First name and last name are required');
      setSubmittingDetails(false);
      return;
    }

    try {
      const res = await authFetch('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: phone.trim()
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setUser(result.data);
        setDetailsSuccess('Personal details updated successfully');
        fetchRoleProfile();
      } else {
        setDetailsError(result.message || 'Failed to update profile details.');
      }
    } catch (err) {
      setDetailsError('Connection error updating profile details.');
    } finally {
      setSubmittingDetails(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setSubmittingPassword(true);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required');
      setSubmittingPassword(false);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      setSubmittingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      setSubmittingPassword(false);
      return;
    }

    try {
      const res = await authFetch('/users/profile/password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setPasswordSuccess('Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(result.message || 'Failed to change password.');
      }
    } catch (err) {
      setPasswordError('Connection error changing password.');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    setLocError('');
    setLocSubmitting(true);

    if (!locName.trim() || !locAddress.trim() || !locCity.trim() || !locState.trim() || !locPincode.trim()) {
      setLocError('Location name, address, city, state, and pincode are required.');
      setLocSubmitting(false);
      return;
    }

    try {
      const res = await authFetch(`/customers/${user.id}/locations`, {
        method: 'POST',
        body: JSON.stringify({
          location_name: locName.trim(),
          address: locAddress.trim(),
          city: locCity.trim(),
          state: locState.trim(),
          pincode: locPincode.trim(),
          contact_person: locContactPerson.trim() || null,
          contact_number: locContactNumber.trim() || null
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setShowLocationModal(false);
        setLocName('');
        setLocAddress('');
        setLocCity('');
        setLocState('');
        setLocPincode('');
        setLocContactPerson('');
        setLocContactNumber('');
        fetchRoleProfile();
      } else {
        setLocError(result.message || 'Failed to add service location.');
      }
    } catch (err) {
      setLocError('Server error.');
    } finally {
      setLocSubmitting(false);
    }
  };

  const handleToggleLocation = async (locId) => {
    try {
      const res = await authFetch(`/customers/locations/${locId}/status`, { method: 'PATCH' });
      if (res.ok) {
        fetchRoleProfile();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!user) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ fontWeight: '600' }}>Loading user profile...</p>
        </div>
      </div>
    );
  }

  const getInitials = (first = '', last = '') => {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>My Profile & Account</h1>
          <p>Manage your account credentials, contact information, and operational details</p>
        </div>
      </div>

      <div className="section-grid">
        {/* Left Column: Account Details & Editing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Profile Overview Card */}
          <div className="card">
            <div className="card-header">
              <h3>Account Overview</h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--primary-color)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '700',
                  fontSize: '1.1rem'
                }}
              >
                {getInitials(user.first_name, user.last_name)}
              </div>
              <div>
                <div style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)' }}>
                  {user.first_name} {user.last_name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {user.email}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Assigned Access Role:</span>
                <span className="badge badge-assigned">{user.role}</span>
              </div>
              {customerData && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Customer ID:</span>
                  <span className="badge badge-info" style={{ fontWeight: '700' }}>{customerData.customer.customer_code}</span>
                </div>
              )}
              {engineerData && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Engineer ID:</span>
                  <span className="badge badge-info" style={{ fontWeight: '700' }}>{engineerData.engineer.engineer_code}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Account Created:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Security Status:</span>
                <span className="badge badge-resolved">Active & Verified</span>
              </div>
            </div>
          </div>

          {/* Edit Details Form Card */}
          <div className="card">
            <div className="card-header">
              <h3>Personal & Contact Details</h3>
            </div>

            {detailsError && (
              <div className="alert alert-danger">
                <div>{detailsError}</div>
              </div>
            )}
            {detailsSuccess && (
              <div className="alert alert-success">
                <div>{detailsSuccess}</div>
              </div>
            )}

            <form onSubmit={handleUpdateDetails}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Contact Phone Number</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={submittingDetails}>
                {submittingDetails ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>

          {/* CUSTOMER SELF-SERVICE LOCATIONS */}
          {user.role === 'CUSTOMER' && customerData && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>My Service Locations</h3>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => setShowLocationModal(true)}
                >
                  + Add Location
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(customerData.service_locations || []).map((loc) => (
                  <div
                    key={loc.id}
                    style={{
                      padding: '0.75rem',
                      background: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                        📍 {loc.location_name} <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{loc.location_code}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {loc.address}, {loc.city}, {loc.state} - {loc.pincode}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${loc.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                        {loc.is_active ? 'Active' : 'Disabled'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => handleToggleLocation(loc.id)}
                      >
                        {loc.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ENGINEER CAPABILITIES OVERVIEW */}
          {(user.role === 'ENGINEER' || user.role === 'AGENT') && engineerData && (
            <div className="card">
              <div className="card-header">
                <h3>Technical Skills & Expertise</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Skills</span>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {(engineerData.skills || []).map((sk) => (
                      <span key={sk.id} className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                        {sk.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Device Expertise</span>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {(engineerData.expertise || []).map((ex) => (
                      <span key={ex.id} className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                        {ex.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Change Password */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <h3>Change Password</h3>
          </div>

          {passwordError && (
            <div className="alert alert-danger">
              <div>{passwordError}</div>
            </div>
          )}
          {passwordSuccess && (
            <div className="alert alert-success">
              <div>{passwordSuccess}</div>
            </div>
          )}

          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input
                type="password"
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                type="password"
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={submittingPassword}>
              {submittingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* CUSTOMER ADD LOCATION SUB-MODAL */}
      {showLocationModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3>Add Service Location</h3>
              <button className="modal-close" onClick={() => setShowLocationModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleAddLocation}>
              {locError && <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{locError}</div>}

              <div className="form-group">
                <label className="form-label">Location Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Branch Office / Plant 2"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Address *</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Street / Facility address"
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">City *</label>
                  <input type="text" className="form-input" value={locCity} onChange={(e) => setLocCity(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">State *</label>
                  <input type="text" className="form-input" value={locState} onChange={(e) => setLocState(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Pincode *</label>
                  <input type="text" className="form-input" value={locPincode} onChange={(e) => setLocPincode(e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Contact Person</label>
                  <input type="text" className="form-input" placeholder="Name" value={locContactPerson} onChange={(e) => setLocContactPerson(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Number</label>
                  <input type="tel" className="form-input" placeholder="Mobile" value={locContactNumber} onChange={(e) => setLocContactNumber(e.target.value)} />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowLocationModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={locSubmitting}>
                  {locSubmitting ? 'Saving...' : 'Add Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
