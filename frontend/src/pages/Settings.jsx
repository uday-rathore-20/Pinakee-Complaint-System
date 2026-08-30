import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState('departments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Settings states
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [routingMode, setRoutingMode] = useState('MANUAL');
  const [archives, setArchives] = useState([]);

  // Outbox states
  const [outbox, setOutbox] = useState([]);
  const [outboxPage, setOutboxPage] = useState(1);
  const [outboxPages, setOutboxPages] = useState(1);
  const [outboxTotal, setOutboxTotal] = useState(0);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [outboxStatusFilter, setOutboxStatusFilter] = useState('');
  const [outboxSearch, setOutboxSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [retryingEmailId, setRetryingEmailId] = useState(null);

  const fetchOutbox = async (page = 1, status = outboxStatusFilter, search = outboxSearch) => {
    setOutboxLoading(true);
    try {
      const query = `/settings/outbox?page=${page}&limit=10&status=${status}&search=${encodeURIComponent(search)}`;
      const res = await authFetch(query);
      const resData = await res.json();
      if (resData.success) {
        setOutbox(resData.data);
        setOutboxPage(resData.meta.page);
        setOutboxPages(resData.meta.pages);
        setOutboxTotal(resData.meta.total);
      }
    } catch (err) {
      console.error('Failed to fetch outbox mail logs:', err);
    } finally {
      setOutboxLoading(false);
    }
  };

  // Create Form States
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [submittingDept, setSubmittingDept] = useState(false);

  // Ticket routing submit state
  const [updatingRouting, setUpdatingRouting] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [submittingCat, setSubmittingCat] = useState(false);

  // SLA Hours Editing State
  const [editingPriorities, setEditingPriorities] = useState({}); // map: priorityId -> sla_hours string
  const [updatingPriorities, setUpdatingPriorities] = useState({}); // map: priorityId -> boolean (loading)

  // Archiving Triggering state
  const [triggeringArchive, setTriggeringArchive] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const [deptRes, catRes, priRes, routingRes, archivesRes] = await Promise.all([
        authFetch('/settings/departments'),
        authFetch('/settings/categories'),
        authFetch('/settings/priorities'),
        authFetch('/settings/routing'),
        authFetch('/settings/archives')
      ]);

      const deptData = await deptRes.json();
      const catData = await catRes.json();
      const priData = await priRes.json();
      const routingData = await routingRes.json();
      const archivesData = await archivesRes.json();

      if (deptData.success) setDepartments(deptData.data);
      if (catData.success) setCategories(catData.data);
      if (routingData.success) setRoutingMode(routingData.mode);
      if (archivesData.success) setArchives(archivesData.data);
      if (priData.success) {
        setPriorities(priData.data);
        // Initialize editing SLA hours mapping
        const hoursMap = {};
        priData.data.forEach(p => {
          hoursMap[p.id] = p.sla_hours.toString();
        });
        setEditingPriorities(hoursMap);
      }
    } catch (err) {
      console.error('Failed to retrieve settings data:', err);
      setError('Connection to server failed. Unable to load system configurations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Flash success/error helper
  const triggerSuccess = (msg) => {
    setSuccessMessage(msg);
    setActionError('');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const triggerError = (msg) => {
    setActionError(msg);
    setSuccessMessage('');
    setTimeout(() => setActionError(''), 5000);
  };

  const handleRetryEmail = async (id) => {
    setRetryingEmailId(id);
    try {
      const res = await authFetch(`/settings/outbox/${id}/retry`, { method: 'POST' });
      const resData = await res.json();
      if (resData.success) {
        triggerSuccess(resData.message || 'Email retry triggered successfully');
        fetchOutbox(outboxPage);
      } else {
        triggerError(resData.message || 'Failed to trigger email retry');
      }
    } catch (err) {
      triggerError('Network error triggering email retry');
    } finally {
      setRetryingEmailId(null);
    }
  };

  const handleDownloadArchive = async (filename) => {
    try {
      const res = await authFetch(`/settings/archives/${filename}`);
      if (!res.ok) {
        const errResult = await res.json();
        triggerError(errResult.message || 'Failed to download archive file');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (err) {
      triggerError('Network error downloading archive file');
    }
  };

  const handleTriggerArchive = async () => {
    setTriggeringArchive(true);
    setActionError('');
    try {
      const res = await authFetch('/settings/archives/run', { method: 'POST' });
      const result = await res.json();
      if (res.ok && result.success) {
        const { auditPruned, notificationsPruned, filesGenerated } = result.data;
        triggerSuccess(`Archival completed successfully. Pruned ${auditPruned} audit logs, ${notificationsPruned} notifications. Created: ${filesGenerated.join(', ') || 'None'}`);
        // Reload archives list
        const listRes = await authFetch('/settings/archives');
        const listData = await listRes.json();
        if (listData.success) setArchives(listData.data);
      } else {
        triggerError(result.message || 'Archival execution failed.');
      }
    } catch (err) {
      triggerError('Network error triggering archive execution.');
    } finally {
      setTriggeringArchive(false);
    }
  };

  // Department handlers
  const handleCreateDepartment = async (e) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    setSubmittingDept(true);
    try {
      const res = await authFetch('/settings/departments', {
        method: 'POST',
        body: JSON.stringify({
          name: newDeptName.trim(),
          description: newDeptDesc.trim() || null
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setDepartments(prev => [...prev, result.data]);
        setNewDeptName('');
        setNewDeptDesc('');
        triggerSuccess('Department added successfully.');
      } else {
        triggerError(result.message || 'Failed to add department.');
      }
    } catch (err) {
      triggerError('Network error adding department.');
    } finally {
      setSubmittingDept(false);
    }
  };

  const handleToggleDepartmentStatus = async (dept) => {
    try {
      const res = await authFetch(`/settings/departments/${dept.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          is_active: !dept.is_active
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setDepartments(prev => prev.map(d => d.id === dept.id ? result.data : d));
        triggerSuccess(`Department '${dept.name}' ${!dept.is_active ? 'activated' : 'deactivated'}.`);
      } else {
        triggerError(result.message || 'Status update failed.');
      }
    } catch (err) {
      triggerError('Network error updating department status.');
    }
  };

  // Category handlers
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSubmittingCat(true);
    try {
      const res = await authFetch('/settings/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName.trim(),
          description: newCatDesc.trim() || null
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setCategories(prev => [...prev, result.data]);
        setNewCatName('');
        setNewCatDesc('');
        triggerSuccess('Complaint category added successfully.');
      } else {
        triggerError(result.message || 'Failed to add category.');
      }
    } catch (err) {
      triggerError('Network error adding category.');
    } finally {
      setSubmittingCat(false);
    }
  };

  const handleToggleCategoryStatus = async (cat) => {
    try {
      const res = await authFetch(`/settings/categories/${cat.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          is_active: !cat.is_active
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setCategories(prev => prev.map(c => c.id === cat.id ? result.data : c));
        triggerSuccess(`Category '${cat.name}' ${!cat.is_active ? 'activated' : 'deactivated'}.`);
      } else {
        triggerError(result.message || 'Status update failed.');
      }
    } catch (err) {
      triggerError('Network error updating category status.');
    }
  };

  // SLA handlers
  const handleUpdateSla = async (priorityId, priorityName) => {
    const val = editingPriorities[priorityId];
    if (!val || val.trim() === '') {
      triggerError('SLA hours value cannot be empty');
      return;
    }
    const hours = parseInt(val, 10);
    if (isNaN(hours) || hours <= 0) {
      triggerError('SLA hours must be a positive integer greater than zero');
      return;
    }

    setUpdatingPriorities(prev => ({ ...prev, [priorityId]: true }));
    try {
      const res = await authFetch(`/settings/priorities/${priorityId}`, {
        method: 'PUT',
        body: JSON.stringify({
          sla_hours: hours
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setPriorities(prev => prev.map(p => p.id === priorityId ? result.data : p));
        triggerSuccess(`SLA resolution hours for ${priorityName} updated to ${hours} hours.`);
      } else {
        triggerError(result.message || 'Failed to update SLA duration.');
      }
    } catch (err) {
      triggerError('Network error updating SLA duration.');
    } finally {
      setUpdatingPriorities(prev => ({ ...prev, [priorityId]: false }));
    }
  };

  // Routing handlers
  const handleUpdateRoutingMode = async (e) => {
    e.preventDefault();
    setUpdatingRouting(true);
    try {
      const res = await authFetch('/settings/routing', {
        method: 'PUT',
        body: JSON.stringify({ mode: routingMode })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setRoutingMode(result.mode);
        triggerSuccess(`Ticket routing strategy updated to ${result.mode} successfully.`);
      } else {
        triggerError(result.message || 'Failed to update routing strategy.');
      }
    } catch (err) {
      triggerError('Network error updating routing strategy.');
    } finally {
      setUpdatingRouting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <h2>Loading settings panel...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>System Settings & Configurations</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
          Configure departments list, active complaint categories, and dynamically update priority SLA targets.
        </p>
      </div>

      {successMessage && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>{successMessage}</div>}
      {actionError && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>{actionError}</div>}

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', marginBottom: '1.5rem', gap: '1rem' }}>
        <button
          onClick={() => setActiveTab('departments')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'departments' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'departments' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Departments Management
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'categories' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'categories' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Ticket Categories
        </button>
        <button
          onClick={() => setActiveTab('priorities')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'priorities' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'priorities' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          SLA Targets (Priorities)
        </button>
        <button
          onClick={() => setActiveTab('routing')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'routing' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'routing' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Ticket Routing
        </button>
        <button
          onClick={() => setActiveTab('archives')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'archives' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'archives' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Archived Logs
        </button>
        <button
          onClick={() => { setActiveTab('outbox'); fetchOutbox(1); }}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 'bold',
            color: activeTab === 'outbox' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'outbox' ? '3px solid var(--primary-color)' : '3px solid transparent',
            marginBottom: '-2px'
          }}
        >
          Outbound Mail Logs
        </button>
      </div>

      {/* DEPARTMENTS TAB CONTENT */}
      {activeTab === 'departments' && (
        <div className="section-grid">
          {/* List Card */}
          <div className="card" style={{ flexGrow: 2 }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Departments ledger ({departments.length})
            </h2>
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Name</th>
                    <th style={{ padding: '0.5rem' }}>Description</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((dept) => (
                    <tr key={dept.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{dept.name}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {dept.description || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span className={`badge badge-${dept.is_active ? 'success' : 'danger'}`} style={{ fontSize: '0.7rem' }}>
                          {dept.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`btn ${dept.is_active ? 'btn-outline' : 'btn-primary'}`}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: dept.is_active ? '#ef4444' : '#10b981', color: dept.is_active ? '#ef4444' : '#10b981', background: 'none' }}
                          onClick={() => handleToggleDepartmentStatus(dept)}
                        >
                          {dept.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create Card */}
          <div className="card" style={{ flexGrow: 1, height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Add New Department
            </h3>
            <form onSubmit={handleCreateDepartment}>
              <div className="form-group">
                <label className="form-label">Department Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder="e.g. Finance Operations"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={newDeptDesc}
                  onChange={(e) => setNewDeptDesc(e.target.value)}
                  placeholder="Summarize department tasks..."
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={submittingDept || !newDeptName.trim()}>
                {submittingDept ? 'Creating...' : 'Create Department'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORIES TAB CONTENT */}
      {activeTab === 'categories' && (
        <div className="section-grid">
          {/* List Card */}
          <div className="card" style={{ flexGrow: 2 }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Complaint Categories ({categories.length})
            </h2>
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Name</th>
                    <th style={{ padding: '0.5rem' }}>Description</th>
                    <th style={{ padding: '0.5rem' }}>Status</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{cat.name}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {cat.description || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span className={`badge badge-${cat.is_active ? 'success' : 'danger'}`} style={{ fontSize: '0.7rem' }}>
                          {cat.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <button
                          type="button"
                          className={`btn ${cat.is_active ? 'btn-outline' : 'btn-primary'}`}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: cat.is_active ? '#ef4444' : '#10b981', color: cat.is_active ? '#ef4444' : '#10b981', background: 'none' }}
                          onClick={() => handleToggleCategoryStatus(cat)}
                        >
                          {cat.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create Card */}
          <div className="card" style={{ flexGrow: 1, height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.05rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Add Ticket Category
            </h3>
            <form onSubmit={handleCreateCategory}>
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Hardware Issue"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (Optional)</label>
                <textarea
                  className="form-input"
                  rows="3"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                  placeholder="Specify what belongs to this category..."
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={submittingCat || !newCatName.trim()}>
                {submittingCat ? 'Creating...' : 'Create Category'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SLA HOURS TAB CONTENT */}
      {activeTab === 'priorities' && (
        <div style={{ maxWidth: '640px' }}>
          <div className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Priority Tiers SLA Hours Configuration
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Modifying SLA hours directly alters the target timeline hours for **newly created tickets** on these priorities. Existing ticket deadlines are untouched.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {priorities.map((pri) => (
                <div
                  key={pri.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f8fafc',
                    padding: '1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}
                >
                  <div style={{ flexGrow: 1, minWidth: '180px' }}>
                    <strong style={{ fontSize: '1rem' }}>{pri.name} Priority</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {pri.description || 'No description recorded'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        className="form-input"
                        value={editingPriorities[pri.id] || ''}
                        onChange={(e) => setEditingPriorities(prev => ({ ...prev, [pri.id]: e.target.value }))}
                        style={{ width: '80px', textAlign: 'center', padding: '0.4rem 0.25rem', marginBottom: 0 }}
                        min="1"
                        required
                      />
                      <span style={{ fontSize: '0.85rem', marginLeft: '0.4rem', fontWeight: 600 }}>hours</span>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                      onClick={() => handleUpdateSla(pri.id, pri.name)}
                      disabled={updatingPriorities[pri.id]}
                    >
                      {updatingPriorities[pri.id] ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TICKET ROUTING TAB CONTENT */}
      {activeTab === 'routing' && (
        <div style={{ maxWidth: '640px' }}>
          <div className="card">
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              Automated Ticket Auto-Routing & Load-Balancing Engine
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Select the active ticket allocation mechanism for all departments. Automatic assignments only rotate through active agents belonging to the target department.
            </p>

            <form onSubmit={handleUpdateRoutingMode}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)' }}>
                  <input
                    type="radio"
                    name="routingMode"
                    value="MANUAL"
                    checked={routingMode === 'MANUAL'}
                    onChange={(e) => setRoutingMode(e.target.value)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <strong>Manual Assignment</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      New tickets are filed unassigned. Admins or Department Heads must route and assign them manually.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)' }}>
                  <input
                    type="radio"
                    name="routingMode"
                    value="ROUND_ROBIN"
                    checked={routingMode === 'ROUND_ROBIN'}
                    onChange={(e) => setRoutingMode(e.target.value)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <strong>Round Robin Strategy</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Sequentially distributes new complaints among active agents belonging to the target department in a rotation.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.75rem', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)' }}>
                  <input
                    type="radio"
                    name="routingMode"
                    value="LEAST_BUSY"
                    checked={routingMode === 'LEAST_BUSY'}
                    onChange={(e) => setRoutingMode(e.target.value)}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <strong>Least Busy Load Balancing</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Assigns new complaints to the active agent in the target department who has the lowest number of active/open tickets (excluding Resolved and Closed).
                    </div>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" disabled={updatingRouting}>
                {updatingRouting ? 'Updating...' : 'Save Strategy'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ARCHIVED LOGS TAB CONTENT */}
      {activeTab === 'archives' && (
        <div className="card" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>
              System Log Archives ({archives.length})
            </h2>
            <button
              onClick={handleTriggerArchive}
              className="btn btn-primary"
              disabled={triggeringArchive}
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              {triggeringArchive ? 'Archiving...' : 'Trigger Archival Run'}
            </button>
          </div>

          <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            System logs (audit trail and notifications) older than 90 days are automatically archived weekly.
            You can manually trigger a run or download historical logs below.
          </div>

          {archives.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
              No log archives generated yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem' }}>Filename</th>
                    <th style={{ padding: '0.75rem' }}>Size</th>
                    <th style={{ padding: '0.75rem' }}>Created At</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map(arc => (
                    <tr key={arc.filename} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: '500' }}>{arc.filename}</td>
                      <td style={{ padding: '0.75rem' }}>{(arc.size / 1024).toFixed(2)} KB</td>
                      <td style={{ padding: '0.75rem' }}>{new Date(arc.created_at).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDownloadArchive(arc.filename)}
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* OUTBOX TAB CONTENT */}
      {activeTab === 'outbox' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem' }}>
              Outbound Transactional Email logs ({outboxTotal})
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search recipient / subject..."
                value={outboxSearch}
                onChange={(e) => {
                  setOutboxSearch(e.target.value);
                  fetchOutbox(1, outboxStatusFilter, e.target.value);
                }}
                className="form-control"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: '200px' }}
              />
              <select
                value={outboxStatusFilter}
                onChange={(e) => {
                  setOutboxStatusFilter(e.target.value);
                  fetchOutbox(1, e.target.value, outboxSearch);
                }}
                className="form-control"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: '130px' }}
              >
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Sent">Sent</option>
                <option value="Failed">Failed</option>
              </select>
              <button
                type="button"
                onClick={() => fetchOutbox(1)}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                disabled={outboxLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          {outboxLoading && outbox.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading outbound mail logs...
            </div>
          ) : outbox.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)' }}>
              No email dispatch history matches the filters.
            </div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.75rem' }}>Recipient</th>
                      <th style={{ padding: '0.75rem' }}>Subject</th>
                      <th style={{ padding: '0.75rem' }}>Status</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Attempts</th>
                      <th style={{ padding: '0.75rem' }}>Created At</th>
                      <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outbox.map(mail => {
                      let badgeColor = '#eab308'; // Pending
                      if (mail.status === 'Sent') badgeColor = '#10b981';
                      if (mail.status === 'Failed') badgeColor = '#ef4444';

                      return (
                        <tr key={mail.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '500' }}>{mail.recipient}</td>
                          <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{mail.subject}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span
                              className={`badge`}
                              style={{
                                background: badgeColor,
                                color: '#ffffff',
                                fontSize: '0.7rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px'
                              }}
                            >
                              {mail.status.toUpperCase()}
                            </span>
                            {mail.error_message && (
                              <div style={{ fontSize: '0.7rem', color: '#dc2626', marginTop: '0.25rem', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={mail.error_message}>
                                Error: {mail.error_message}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{mail.attempts}</td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {new Date(mail.created_at).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button
                                onClick={() => setSelectedEmail(mail)}
                                className="btn btn-outline"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                View Body
                              </button>
                              {mail.status === 'Failed' && (
                                <button
                                  onClick={() => handleRetryEmail(mail.id)}
                                  disabled={retryingEmailId === mail.id}
                                  className="btn btn-primary"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#3b82f6', borderColor: '#3b82f6' }}
                                >
                                  {retryingEmailId === mail.id ? 'Retrying...' : 'Retry'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {outboxPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1.5rem', gap: '1rem' }}>
                  <button
                    disabled={outboxPage <= 1 || outboxLoading}
                    onClick={() => fetchOutbox(outboxPage - 1)}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: '0.85rem' }}>
                    Page {outboxPage} of {outboxPages}
                  </span>
                  <button
                    disabled={outboxPage >= outboxPages || outboxLoading}
                    onClick={() => fetchOutbox(outboxPage + 1)}
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* VIEW EMAIL BODY MODAL */}
      {selectedEmail && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '600px', maxWidth: '90%', maxHeight: '80%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem' }}>View Outbound Email Body</h3>
              <button
                onClick={() => setSelectedEmail(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
              <div><strong>Recipient:</strong> {selectedEmail.recipient}</div>
              <div><strong>Subject:</strong> {selectedEmail.subject}</div>
              <div><strong>Queued At:</strong> {new Date(selectedEmail.created_at).toLocaleString()}</div>
            </div>
            <div style={{
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '1rem',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: 'var(--text-color)',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {selectedEmail.body}
            </div>
            <div style={{ textAlign: 'right', marginTop: '1.5rem' }}>
              <button onClick={() => setSelectedEmail(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
