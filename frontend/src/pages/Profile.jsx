import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Profile = () => {
  const { user, setUser, authFetch } = useAuth();

  // Profile Details Form States
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submittingDetails, setSubmittingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSuccess, setDetailsSuccess] = useState('');

  // Change Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Prefill details when user context loads
  useEffect(() => {
    if (user) {
      setFirstName(user.first_name || '');
      setLastName(user.last_name || '');
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
          first_name: firstName,
          last_name: lastName
        })
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setUser(result.data); // Update context user profile state
        setDetailsSuccess('Personal details updated successfully');
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

  if (!user) {
    return <div className="page-container"><h2>Loading profile...</h2></div>;
  }

  return (
    <div className="page-container">
      <h1 style={{ marginBottom: '1.5rem' }}>My Account Profile</h1>

      <div className="section-grid">
        {/* Left Column: Account details & Editing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Profile Overview Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              Account Overview
            </h3>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.95rem' }}>
              <li><span style={{ color: 'var(--text-muted)' }}>Registered Email:</span> <strong>{user.email}</strong></li>
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Access Role:</span>{' '}
                <span className="role-badge" style={{ verticalAlign: 'middle', margin: '0' }}>{user.role}</span>
              </li>
              {user.department && (
                <li><span style={{ color: 'var(--text-muted)' }}>Department:</span> <strong>{user.department}</strong></li>
              )}
              <li>
                <span style={{ color: 'var(--text-muted)' }}>Joined:</span>{' '}
                <strong>{new Date(user.created_at).toLocaleDateString()}</strong>
              </li>
            </ul>
          </div>

          {/* Edit Details Form Card */}
          <div className="card">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              Edit Personal Details
            </h3>

            {detailsError && <div className="alert alert-danger">{detailsError}</div>}
            {detailsSuccess && (
              <div className="alert" style={{ backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                {detailsSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateDetails}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
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

              <button type="submit" className="btn btn-primary" disabled={submittingDetails}>
                {submittingDetails ? 'Saving...' : 'Save Profile Details'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Change Password */}
        <div className="card">
          <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
            Change Password Security
          </h3>

          {passwordError && <div className="alert alert-danger">{passwordError}</div>}
          {passwordSuccess && (
            <div className="alert" style={{ backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}>
              {passwordSuccess}
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

            <div className="form-group">
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
              {submittingPassword ? 'Updating password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Profile;
