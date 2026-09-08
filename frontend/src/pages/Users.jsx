import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Users = () => {
  const { authFetch } = useAuth();
  
  // Data States
  const [users, setUsers] = useState([]);
  
  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  // Fixed active application roles list
  const roles = [
    { id: 1, name: 'ADMIN' },
    { id: 3, name: 'ENGINEER' },
    { id: 4, name: 'CUSTOMER' }
  ];

  const fetchUsersList = async () => {
    try {
      const res = await authFetch('/users');
      const result = await res.json();
      if (result.success) {
        setUsers(result.data);
      } else {
        setError(result.message || 'Failed to fetch users.');
      }
    } catch (err) {
      setError('Connection to server failed.');
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchUsersList();
      setLoading(false);
    };
    init();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setRoleId('');
    setFormError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (userRecord) => {
    setEditingUser(userRecord);
    setFirstName(userRecord.first_name);
    setLastName(userRecord.last_name);
    setEmail(userRecord.email);
    setPassword('');

    const matchedRole = roles.find(r => r.name === userRecord.role);
    setRoleId(matchedRole ? matchedRole.id.toString() : '');

    setFormError('');
    setShowModal(true);
  };

  const handleToggleStatus = async (userRecord) => {
    setError('');
    const targetStatus = !userRecord.is_active;

    try {
      const res = await authFetch(`/users/${userRecord.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: targetStatus })
      });
      const result = await res.json();
      
      if (res.ok && result.success) {
        // Reload list
        await fetchUsersList();
      } else {
        setError(result.message || 'Failed to update user status.');
      }
    } catch (err) {
      setError('Connection failure toggle status.');
    }
  };

  const handleSubmitUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    if (editingUser) {
      if (!firstName || !lastName || !email || !roleId) {
        setFormError('First Name, Last Name, Email, and Role are required.');
        setFormSubmitting(false);
        return;
      }
    } else {
      if (!firstName || !lastName || !email || !password || !roleId) {
        setFormError('All fields (including temporary password) are required.');
        setFormSubmitting(false);
        return;
      }
    }

    try {
      const url = editingUser ? `/users/${editingUser.id}` : '/users';
      const method = editingUser ? 'PUT' : 'POST';
      const bodyPayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        role_id: parseInt(roleId)
      };

      if (password) {
        bodyPayload.password = password;
      }

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(bodyPayload)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setFirstName('');
        setLastName('');
        setEmail('');
        setPassword('');
        setRoleId('');
        setEditingUser(null);
        setShowModal(false);
        await fetchUsersList();
      } else {
        setFormError(result.message || (editingUser ? 'User update failed.' : 'User creation failed.'));
      }
    } catch (err) {
      setFormError('Server is currently unreachable.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleExportUsersCSV = async () => {
    setError('');
    try {
      const res = await authFetch('/users/export');
      if (!res.ok) {
        throw new Error('Failed to export Users CSV');
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `users_export_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message || 'Error occurred exporting users logs.');
    }
  };

  const getInitials = (first = '', last = '') => {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || 'U';
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>User Administration</h1>
          <p>Manage system users, access roles (Admin, Engineer, Customer), and account activation</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={handleExportUsersCSV}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export Users CSV
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

      {/* Users Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email Address</th>
                <th>Access Role</th>
                <th>Account Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '50%',
                          background: 'var(--brand-navy-light)',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.78rem',
                          flexShrink: 0
                        }}
                      >
                        {getInitials(u.first_name, u.last_name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                          {u.first_name} {u.last_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontFamily: 'JetBrains Mono, monospace' }}>
                          ID #{u.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.88rem', color: 'var(--text-color)' }}>{u.email}</span>
                  </td>
                  <td>
                    <span className="badge badge-assigned" style={{ fontSize: '0.72rem' }}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-resolved' : 'badge-closed'}`}>
                      {u.is_active ? '● Active' : '○ Deactivated'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleOpenEditModal(u)}
                      >
                        Edit
                      </button>
                      <button
                        className={`btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-primary'}`}
                        style={{
                          borderColor: u.is_active ? 'var(--danger-border)' : 'transparent',
                          color: u.is_active ? 'var(--danger-text)' : '#fff',
                          backgroundColor: u.is_active ? 'var(--danger-bg)' : 'var(--primary-color)'
                        }}
                        onClick={() => handleToggleStatus(u)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User Account' : 'Create User Account'}</h2>
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

            <form onSubmit={handleSubmitUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Rahul"
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
                    placeholder="e.g. Sharma"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. user@pinakee.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {editingUser ? 'New Password (Leave blank to keep unchanged)' : 'Temporary Password'}
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? "••••••••" : "Minimum 6 characters"}
                  required={!editingUser}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Role</label>
                <select
                  className="form-select"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  required
                >
                  <option value="">Select Role</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? (editingUser ? 'Saving...' : 'Creating...') : (editingUser ? 'Save Changes' : 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
