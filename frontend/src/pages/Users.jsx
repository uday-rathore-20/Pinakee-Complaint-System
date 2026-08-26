import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Users = () => {
  const { authFetch } = useAuth();
  
  // Data States
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Modal & Form States
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [deptId, setDeptId] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  // Fixed seeded roles list mapping
  const roles = [
    { id: 1, name: 'ADMIN' },
    { id: 2, name: 'DEPT_HEAD' },
    { id: 3, name: 'AGENT' },
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

  const fetchDepartments = async () => {
    try {
      const res = await authFetch('/departments');
      const result = await res.json();
      if (result.success) {
        setDepartments(result.data);
      }
    } catch (err) {
      console.error('Failed to load departments lookup:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchUsersList();
      await fetchDepartments();
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
    setDeptId('');
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

    const matchedDept = departments.find(d => d.name === userRecord.department);
    setDeptId(matchedDept ? matchedDept.id.toString() : '');

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
        role_id: parseInt(roleId),
        department_id: deptId ? parseInt(deptId) : null
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
        setDeptId('');
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

  if (loading) {
    return <div className="page-container"><h2>Loading User Accounts...</h2></div>;
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>User Administration Panel</h1>
        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          Create User Account
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Users table */}
      <div className="card" style={{ padding: '0' }}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td><strong>{u.first_name} {u.last_name}</strong></td>
                  <td>{u.email}</td>
                  <td>
                    <span className="badge badge-assigned" style={{ fontSize: '0.7rem' }}>{u.role}</span>
                  </td>
                  <td>{u.department || '—'}</td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-resolved' : 'badge-closed'}`}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', marginRight: '0.5rem' }}
                      onClick={() => handleOpenEditModal(u)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn ${u.is_active ? 'btn-danger' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                      onClick={() => handleToggleStatus(u)}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
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
              <h2>{editingUser ? 'Edit User Account' : 'Create a New User Account'}</h2>
              <button
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => setShowModal(false)}
              >
                &times;
              </button>
            </div>

            {formError && <div className="alert alert-danger">{formError}</div>}

            <form onSubmit={handleSubmitUser}>
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

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {editingUser ? 'New Password (Optional)' : 'Temporary Password'}
                </label>
                <input
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? "Leave blank to keep current" : "Minimum 6 characters"}
                  required={!editingUser}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Role Access</label>
                  <select
                    className="form-input"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    required
                  >
                    <option value="">Select Role</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ margin: '0' }}>
                  <label className="form-label">Department</label>
                  <select
                    className="form-input"
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                    disabled={roleId === '4'} // Disabled for Customer role
                  >
                    <option value="">No Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
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
