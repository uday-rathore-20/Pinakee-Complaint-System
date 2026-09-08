import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const Customers = () => {
  const { authFetch } = useAuth();

  // List states
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState('');

  // Form Modal States
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerType, setCustomerType] = useState('Company');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [alternateMobile, setAlternateMobile] = useState('');
  const [alternateEmail, setAlternateEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [website, setWebsite] = useState('');
  const [customerCategory, setCustomerCategory] = useState('');
  const [isAmc, setIsAmc] = useState(false);
  const [isWarranty, setIsWarranty] = useState(false);
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Detail / Profile View Modal State
  const [viewCustomer, setViewCustomer] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');

  // Customer Step Definitions
  const customerSteps = [
    { id: 'basic', num: 1, label: 'Basic Information' },
    { id: 'address', num: 2, label: 'Primary Address' },
    { id: 'locations', num: 3, label: 'Service Locations' },
    { id: 'contacts', num: 4, label: 'Contact Persons' },
    { id: 'login', num: 5, label: 'Login Account' }
  ];

  const currentStepIndex = customerSteps.findIndex(s => s.id === activeTab);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === customerSteps.length - 1;

  // Lock background scrolling when modal is open
  useEffect(() => {
    if (showModal || viewCustomer) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showModal, viewCustomer]);

  // Location / Contact sub-modal states in Detail View
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locState, setLocState] = useState('');
  const [locPincode, setLocPincode] = useState('');
  const [locContactPerson, setLocContactPerson] = useState('');
  const [locContactNumber, setLocContactNumber] = useState('');
  const [locEmail, setLocEmail] = useState('');
  const [locSubmitting, setLocSubmitting] = useState(false);
  const [locError, setLocError] = useState('');

  const [showContactModal, setShowContactModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactDesignation, setContactDesignation] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactIsPrimary, setContactIsPrimary] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState('');

  const fetchCustomersList = async () => {
    try {
      let url = '/customers';
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('customer_type', typeFilter);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await authFetch(url);
      const result = await res.json();
      if (result.success) {
        setCustomers(result.data);
      } else {
        setError(result.message || 'Failed to fetch customers.');
      }
    } catch (err) {
      setError('Connection to server failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomersList();
  }, [search, statusFilter, typeFilter]);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setCompanyName('');
    setCustomerType('Company');
    setEmail('');
    setMobile('');
    setAlternateMobile('');
    setAlternateEmail('');
    setPassword('');
    setConfirmPassword('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setState('');
    setPincode('');
    setCountry('India');
    setGstNumber('');
    setPanNumber('');
    setWebsite('');
    setCustomerCategory('');
    setIsAmc(false);
    setIsWarranty(false);
    setNotes('');
    setIsActive(true);
    setFormError('');
    setActiveTab('basic');
  };

  const handleOpenCreateModal = () => {
    setEditingCustomer(null);
    resetForm();
    setShowModal(true);
  };

  const handleOpenEditModal = async (cust) => {
    setEditingCustomer(cust);
    resetForm();
    try {
      const res = await authFetch(`/customers/${cust.id}`);
      const result = await res.json();
      if (result.success) {
        const c = result.data.customer;
        setFirstName(c.first_name || '');
        setLastName(c.last_name || '');
        setCompanyName(c.company_name || '');
        setCustomerType(c.customer_type || 'Company');
        setEmail(c.email || '');
        setMobile(c.phone_number || '');
        setAlternateMobile(c.alternate_mobile || '');
        setAlternateEmail(c.alternate_email || '');
        setAddressLine1(c.address_line1 || '');
        setAddressLine2(c.address_line2 || '');
        setCity(c.city || '');
        setState(c.state || '');
        setPincode(c.pincode || '');
        setCountry(c.country || 'India');
        setGstNumber(c.gst_number || '');
        setPanNumber(c.pan_number || '');
        setWebsite(c.website || '');
        setCustomerCategory(c.customer_category || '');
        setIsAmc(c.is_amc || false);
        setIsWarranty(c.is_warranty || false);
        setNotes(c.notes || '');
        setIsActive(c.is_active !== false);
        setShowModal(true);
      }
    } catch (err) {
      setError('Failed to load customer details for edit.');
    }
  };

  const handleToggleStatus = async (cust) => {
    try {
      const res = await authFetch(`/customers/${cust.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !cust.is_active })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchCustomersList();
        if (viewCustomer && viewCustomer.customer.id === cust.id) {
          loadCustomerDetails(cust.id);
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
    if (activeTab === 'basic') {
      if (!firstName.trim() || !lastName.trim()) {
        setFormError('Please enter both Customer First Name and Last Name.');
        return;
      }
      if (!companyName.trim()) {
        setFormError('Company or Customer Name is required.');
        return;
      }
      if (!email.trim() || !mobile.trim()) {
        setFormError('Primary Email and Primary Mobile Number are required.');
        return;
      }
    } else if (activeTab === 'address') {
      if (!addressLine1.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
        setFormError('Address Line 1, City, State, and Pincode are required.');
        return;
      }
    }
    if (currentStepIndex < customerSteps.length - 1) {
      setActiveTab(customerSteps[currentStepIndex + 1].id);
    }
  };

  const handlePrevStep = () => {
    setFormError('');
    if (currentStepIndex > 0) {
      setActiveTab(customerSteps[currentStepIndex - 1].id);
    }
  };

  const handleSubmitCustomer = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Customer first and last name are required.');
      setFormSubmitting(false);
      return;
    }
    if (!email.trim()) {
      setFormError('Valid email address is required.');
      setFormSubmitting(false);
      return;
    }
    if (!mobile.trim()) {
      setFormError('Mobile number is required.');
      setFormSubmitting(false);
      return;
    }
    if (!editingCustomer) {
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
    if (!addressLine1.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setFormError('Primary address, city, state, and pincode are required.');
      setFormSubmitting(false);
      return;
    }

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      company_name: companyName.trim() || `${firstName.trim()} ${lastName.trim()}`,
      customer_type: customerType,
      email: email.trim(),
      mobile: mobile.trim(),
      alternate_mobile: alternateMobile.trim() || null,
      alternate_email: alternateEmail.trim() || null,
      address_line1: addressLine1.trim(),
      address_line2: addressLine2.trim() || null,
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      country: country.trim() || 'India',
      gst_number: gstNumber.trim() || null,
      pan_number: panNumber.trim() || null,
      website: website.trim() || null,
      customer_category: customerCategory.trim() || null,
      is_amc: isAmc,
      is_warranty: isWarranty,
      notes: notes.trim() || null,
      is_active: isActive
    };

    if (!editingCustomer) {
      payload.password = password;
      payload.confirm_password = confirmPassword;
    }

    try {
      const url = editingCustomer ? `/customers/${editingCustomer.id}` : '/customers';
      const method = editingCustomer ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setShowModal(false);
        resetForm();
        await fetchCustomersList();
        if (editingCustomer && viewCustomer && viewCustomer.customer.id === editingCustomer.id) {
          loadCustomerDetails(editingCustomer.id);
        }
      } else {
        setFormError(result.message || 'Failed to save customer account.');
      }
    } catch (err) {
      setFormError('Server is currently unreachable.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const loadCustomerDetails = async (custId) => {
    setDetailLoading(true);
    try {
      const res = await authFetch(`/customers/${custId}`);
      const result = await res.json();
      if (result.success) {
        setViewCustomer(result.data);
      } else {
        setError(result.message || 'Failed to load details.');
      }
    } catch (err) {
      setError('Connection failure loading customer details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenDetailView = (cust) => {
    setViewCustomer(null);
    setDetailTab('overview');
    loadCustomerDetails(cust.id);
  };

  // Location Actions
  const handleOpenAddLocation = () => {
    setEditingLocation(null);
    setLocName('');
    setLocAddress(viewCustomer?.customer.address_line1 || '');
    setLocCity(viewCustomer?.customer.city || '');
    setLocState(viewCustomer?.customer.state || '');
    setLocPincode(viewCustomer?.customer.pincode || '');
    setLocContactPerson('');
    setLocContactNumber('');
    setLocEmail('');
    setLocError('');
    setShowLocationModal(true);
  };

  const handleOpenEditLocation = (loc) => {
    setEditingLocation(loc);
    setLocName(loc.location_name);
    setLocAddress(loc.address);
    setLocCity(loc.city);
    setLocState(loc.state);
    setLocPincode(loc.pincode);
    setLocContactPerson(loc.contact_person || '');
    setLocContactNumber(loc.contact_number || '');
    setLocEmail(loc.email || '');
    setLocError('');
    setShowLocationModal(true);
  };

  const handleToggleLocationStatus = async (locId) => {
    try {
      const res = await authFetch(`/customers/locations/${locId}/status`, { method: 'PATCH' });
      if (res.ok) {
        loadCustomerDetails(viewCustomer.customer.id);
        fetchCustomersList();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitLocation = async (e) => {
    e.preventDefault();
    setLocError('');
    setLocSubmitting(true);

    if (!locName.trim() || !locAddress.trim() || !locCity.trim() || !locState.trim() || !locPincode.trim()) {
      setLocError('Location name, address, city, state, and pincode are required.');
      setLocSubmitting(false);
      return;
    }

    const payload = {
      location_name: locName.trim(),
      address: locAddress.trim(),
      city: locCity.trim(),
      state: locState.trim(),
      pincode: locPincode.trim(),
      contact_person: locContactPerson.trim() || null,
      contact_number: locContactNumber.trim() || null,
      email: locEmail.trim() || null
    };

    try {
      const url = editingLocation
        ? `/customers/locations/${editingLocation.id}`
        : `/customers/${viewCustomer.customer.id}/locations`;
      const method = editingLocation ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setShowLocationModal(false);
        loadCustomerDetails(viewCustomer.customer.id);
        fetchCustomersList();
      } else {
        setLocError(result.message || 'Failed to save service location.');
      }
    } catch (err) {
      setLocError('Server error.');
    } finally {
      setLocSubmitting(false);
    }
  };

  // Contact Actions
  const handleOpenAddContact = () => {
    setEditingContact(null);
    setContactName('');
    setContactDesignation('');
    setContactMobile('');
    setContactEmail('');
    setContactIsPrimary(false);
    setContactError('');
    setShowContactModal(true);
  };

  const handleOpenEditContact = (cnt) => {
    setEditingContact(cnt);
    setContactName(cnt.name);
    setContactDesignation(cnt.designation || '');
    setContactMobile(cnt.mobile);
    setContactEmail(cnt.email);
    setContactIsPrimary(cnt.is_primary || false);
    setContactError('');
    setShowContactModal(true);
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm('Are you sure you want to remove this contact person?')) return;
    try {
      const res = await authFetch(`/customers/contacts/${contactId}`, { method: 'DELETE' });
      if (res.ok) {
        loadCustomerDetails(viewCustomer.customer.id);
        fetchCustomersList();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitContact = async (e) => {
    e.preventDefault();
    setContactError('');
    setContactSubmitting(true);

    if (!contactName.trim() || !contactMobile.trim() || !contactEmail.trim()) {
      setContactError('Contact Name, Mobile number, and Email are required.');
      setContactSubmitting(false);
      return;
    }

    const payload = {
      name: contactName.trim(),
      designation: contactDesignation.trim() || null,
      mobile: contactMobile.trim(),
      email: contactEmail.trim(),
      is_primary: contactIsPrimary
    };

    try {
      const url = editingContact
        ? `/customers/contacts/${editingContact.id}`
        : `/customers/${viewCustomer.customer.id}/contacts`;
      const method = editingContact ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const result = await res.json();

      if (res.ok && result.success) {
        setShowContactModal(false);
        loadCustomerDetails(viewCustomer.customer.id);
        fetchCustomersList();
      } else {
        setContactError(result.message || 'Failed to save contact person.');
      }
    } catch (err) {
      setContactError('Server error.');
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title-group">
          <h1>Customer Management</h1>
          <p>Create corporate and individual customer accounts, service locations, and contact directories</p>
        </div>

        <button className="btn btn-primary" onClick={handleOpenCreateModal}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Add Customer
        </button>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* Filter Toolbar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'center' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Search Customers</label>
            <input
              type="text"
              className="form-input"
              placeholder="Search by name, company, code, city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Customer Type</label>
            <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option value="Company">Company</option>
              <option value="Individual">Individual</option>
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

      {/* Customers Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading customers directory...</div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No customers found matching the criteria.</div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer ID</th>
                  <th>Customer / Company</th>
                  <th>Type</th>
                  <th>Primary Contact</th>
                  <th>Service Locations</th>
                  <th>Contracts</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="badge badge-info" style={{ fontWeight: '700', fontSize: '0.75rem' }}>
                        {c.customer_code || `CUST-${String(c.id).padStart(4, '0')}`}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {c.company_name || `${c.first_name} ${c.last_name}`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {c.first_name} {c.last_name} {c.city ? `• ${c.city}` : ''}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.customer_type || 'Company'}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem' }}>{c.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.phone_number || '—'}</div>
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                        📍 {c.active_locations_count || 0} active
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {c.is_amc && <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>AMC</span>}
                        {c.is_warranty && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>WARRANTY</span>}
                        {!c.is_amc && !c.is_warranty && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Standard</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                        {c.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleOpenDetailView(c)}
                          title="View complete customer profile"
                        >
                          View
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleOpenEditModal(c)}
                          title="Edit customer information"
                        >
                          Edit
                        </button>
                        <button
                          className={`btn btn-sm ${c.is_active ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleToggleStatus(c)}
                          title={c.is_active ? 'Disable customer account' : 'Activate customer account'}
                        >
                          {c.is_active ? 'Disable' : 'Activate'}
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

      {/* CREATE / EDIT CUSTOMER MODAL */}
      {showModal && (
        <div className="enterprise-modal-overlay">
          <div className="enterprise-modal-container">
            {/* Modal Header */}
            <div className="enterprise-modal-header">
              <div>
                <h3 className="enterprise-modal-title">
                  {editingCustomer ? `Edit Customer — ${editingCustomer.company_name || editingCustomer.first_name}` : 'Add New Customer'}
                </h3>
                <p className="enterprise-modal-subtitle">
                  {editingCustomer ? 'Update customer organization profile, registered address, and contract details.' : 'Create a customer account with primary address, service locations, and contacts.'}
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
              {customerSteps.map((step) => {
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
            <form onSubmit={handleSubmitCustomer} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="enterprise-modal-body">
                {formError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1.25rem', fontSize: '0.85rem' }}>
                    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <div>{formError}</div>
                  </div>
                )}

                {/* STEP 1: BASIC INFORMATION */}
                {activeTab === 'basic' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Customer Information</div>
                      <p className="enterprise-section-subtitle">Basic identity and primary organization details.</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">First Name *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Rahul"
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
                          placeholder="e.g. Sharma"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Company / Organization Name *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Zenith Tech Solutions Ltd"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Customer Type *</label>
                        <select
                          className="form-select"
                          value={customerType}
                          onChange={(e) => setCustomerType(e.target.value)}
                        >
                          <option value="Company">Company</option>
                          <option value="Individual">Individual</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Primary Email (Login) *</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="customer@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          Primary email for account access and ticket updates.
                        </small>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Primary Mobile Number *</label>
                        <input
                          type="tel"
                          className="form-input"
                          placeholder="+91 98765 43210"
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value)}
                          required
                        />
                        <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                          Official contact number for field visits.
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
                        <label className="form-label">Alternate Email <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="billing@example.com"
                          value={alternateEmail}
                          onChange={(e) => setAlternateEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">GST Number <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 23AAAAA0000A1Z5"
                          value={gstNumber}
                          onChange={(e) => setGstNumber(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">PAN Number <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. ABCDE1234F"
                          value={panNumber}
                          onChange={(e) => setPanNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Website URL <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="url"
                          className="form-input"
                          placeholder="https://clientcorp.com"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Customer Category <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. Enterprise, SME, Healthcare"
                          value={customerCategory}
                          onChange={(e) => setCustomerCategory(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={isAmc}
                          onChange={(e) => setIsAmc(e.target.checked)}
                          style={{ accentColor: 'var(--primary-color)' }}
                        />
                        <span><strong>Annual Maintenance Contract (AMC) Active</strong></span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input
                          type="checkbox"
                          checked={isWarranty}
                          onChange={(e) => setIsWarranty(e.target.checked)}
                          style={{ accentColor: 'var(--primary-color)' }}
                        />
                        <span><strong>Service / Hardware Warranty Active</strong></span>
                      </label>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Internal Notes / Account Remarks <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                      <textarea
                        className="form-input"
                        rows="2"
                        placeholder="Special client preferences, service instructions, or SLA notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 2: PRIMARY ADDRESS */}
                {activeTab === 'address' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Primary Registered Address</div>
                      <p className="enterprise-section-subtitle">Official billing address and primary physical headquarters.</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Address Line 1 *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. 123 Tech Park, Sector 4"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Address Line 2 <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span></label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Floor, Suite, Landmark"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">City *</label>
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
                        <label className="form-label">State *</label>
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
                        <label className="form-label">PIN Code *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. 462001"
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Country</label>
                      <input
                        type="text"
                        className="form-input"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: SERVICE LOCATIONS */}
                {activeTab === 'locations' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Service Locations</div>
                      <p className="enterprise-section-subtitle">Multi-site dispatch locations, plant facilities, and branch offices.</p>
                    </div>

                    <div className="enterprise-info-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>📍</span>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}>
                        <strong>Primary Service Location</strong> will be automatically provisioned from the registered address ({addressLine1 ? `${addressLine1}, ${city || 'City'}, ${state || 'State'} - ${pincode || 'Pincode'}` : 'Configured in Step 2: Primary Address'}) with unique code <code>LOC-0001</code>.
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Additional plant or branch locations can be added after account creation in the Customer Profile.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: CONTACT PERSONS */}
                {activeTab === 'contacts' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Authorized Contact Persons</div>
                      <p className="enterprise-section-subtitle">Key personnel authorized for service request coordination.</p>
                    </div>

                    <div className="enterprise-info-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>👤</span>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}>
                        <strong>Primary Contact Person</strong> will be automatically created as:
                        <div style={{ marginTop: '0.35rem', fontWeight: '600' }}>
                          {firstName || 'First'} {lastName || 'Last'} &bull; {mobile || '+91 Mobile'} &bull; {email || 'email@example.com'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Additional departmental contacts can be added and managed in the Customer Profile.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 5: LOGIN ACCOUNT */}
                {activeTab === 'login' && (
                  <div>
                    <div className="enterprise-section-header">
                      <div className="enterprise-section-title">Login Credentials</div>
                      <p className="enterprise-section-subtitle">Portal access credentials and account activation.</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Login Identifier / Email</label>
                      <input
                        type="text"
                        className="form-input"
                        value={email || 'Defined in Step 1: Basic Info'}
                        disabled
                        style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
                      />
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                        System access role: <strong>CUSTOMER</strong>
                      </small>
                    </div>

                    {!editingCustomer ? (
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
                        Password updates for existing customers are managed via the secure User Administration reset flow.
                      </div>
                    )}

                    <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                      <label className="form-label">Account Activation Status</label>
                      <select
                        className="form-select"
                        value={isActive ? 'true' : 'false'}
                        onChange={(e) => setIsActive(e.target.value === 'true')}
                      >
                        <option value="true">ACTIVE (Allowed to login and create complaints)</option>
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
                        ? 'Saving Customer...'
                        : (editingCustomer ? 'Update Customer Profile' : 'Create Customer Account')}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED CUSTOMER PROFILE DRAWER / VIEW MODAL */}
      {viewCustomer && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-container" style={{ maxWidth: '950px', maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                    {viewCustomer.customer.customer_code || `CUST-${String(viewCustomer.customer.id).padStart(4, '0')}`}
                  </span>
                  <h3 style={{ margin: 0 }}>{viewCustomer.customer.company_name || `${viewCustomer.customer.first_name} ${viewCustomer.customer.last_name}`}</h3>
                  <span className={`badge ${viewCustomer.customer.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem' }}>
                    {viewCustomer.customer.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Contact: {viewCustomer.customer.first_name} {viewCustomer.customer.last_name} • {viewCustomer.customer.email}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewCustomer(null)}>&times;</button>
            </div>

            {/* Profile Sub-Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <button
                className={`btn btn-sm ${detailTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDetailTab('overview')}
                style={{ borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
              >
                Overview & Address
              </button>
              <button
                className={`btn btn-sm ${detailTab === 'locations' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDetailTab('locations')}
                style={{ borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
              >
                Service Locations ({viewCustomer.service_locations?.length || 0})
              </button>
              <button
                className={`btn btn-sm ${detailTab === 'contacts' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDetailTab('contacts')}
                style={{ borderRadius: '4px 4px 0 0', borderBottom: 'none' }}
              >
                Contact Persons ({viewCustomer.contacts?.length || 0})
              </button>
            </div>

            {/* DETAIL TAB 1: OVERVIEW */}
            {detailTab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
                  <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                    Customer Contact Information
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Customer Name:</span> <strong>{viewCustomer.customer.first_name} {viewCustomer.customer.last_name}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Email:</span> <a href={`mailto:${viewCustomer.customer.email}`} style={{ color: 'var(--primary-color)' }}>{viewCustomer.customer.email}</a></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Mobile:</span> <a href={`tel:${viewCustomer.customer.phone_number}`} style={{ color: 'var(--primary-color)', fontWeight: '600' }}>{viewCustomer.customer.phone_number}</a></div>
                    {viewCustomer.customer.alternate_mobile && <div><span style={{ color: 'var(--text-muted)' }}>Alt Mobile:</span> {viewCustomer.customer.alternate_mobile}</div>}
                    {viewCustomer.customer.alternate_email && <div><span style={{ color: 'var(--text-muted)' }}>Alt Email:</span> {viewCustomer.customer.alternate_email}</div>}
                  </div>
                </div>

                <div className="card" style={{ borderLeft: '4px solid var(--brand-cyan)' }}>
                  <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                    Primary Registered Address
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <div>{viewCustomer.customer.address_line1}</div>
                    {viewCustomer.customer.address_line2 && <div>{viewCustomer.customer.address_line2}</div>}
                    <div style={{ fontWeight: '600' }}>
                      {[viewCustomer.customer.city, viewCustomer.customer.state].filter(Boolean).join(', ')}{viewCustomer.customer.pincode ? ` - ${viewCustomer.customer.pincode}` : ''}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Country: {viewCustomer.customer.country || 'India'}</div>
                  </div>
                </div>

                <div className="card" style={{ gridColumn: 'span 2' }}>
                  <h4 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.4rem', marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                    Business & Contract Terms
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>GST Number:</span> <strong>{viewCustomer.customer.gst_number || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>PAN:</span> <strong>{viewCustomer.customer.pan_number || '—'}</strong></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Website:</span> {viewCustomer.customer.website ? <a href={viewCustomer.customer.website} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)' }}>{viewCustomer.customer.website}</a> : '—'}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Category:</span> {viewCustomer.customer.customer_category || 'General'}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>AMC Status:</span> {viewCustomer.customer.is_amc ? <span className="badge badge-success">ACTIVE AMC</span> : <span className="badge badge-neutral">None</span>}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Warranty:</span> {viewCustomer.customer.is_warranty ? <span className="badge badge-warning">ACTIVE WARRANTY</span> : <span className="badge badge-neutral">None</span>}</div>
                  </div>
                  {viewCustomer.customer.notes && (
                    <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.82rem', border: '1px solid var(--border-color)' }}>
                      <strong>Notes:</strong> {viewCustomer.customer.notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DETAIL TAB 2: SERVICE LOCATIONS */}
            {detailTab === 'locations' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Customer Service Locations</h4>
                  <button className="btn btn-sm btn-primary" onClick={handleOpenAddLocation}>
                    + Add Service Location
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                  {viewCustomer.service_locations?.map((loc) => (
                    <div
                      key={loc.id}
                      className="card"
                      style={{
                        padding: '1rem',
                        borderLeft: `4px solid ${loc.is_active ? 'var(--brand-cyan)' : '#94a3b8'}`,
                        opacity: loc.is_active ? 1 : 0.75
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <span className="badge badge-neutral" style={{ fontSize: '0.7rem', fontWeight: '700' }}>
                            {loc.location_code}
                          </span>
                          <h4 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem' }}>{loc.location_name}</h4>
                        </div>
                        <span className={`badge ${loc.is_active ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
                          {loc.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                        <div>{loc.address}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{loc.city}, {loc.state} - {loc.pincode}</div>
                      </div>

                      {(loc.contact_person || loc.contact_number) && (
                        <div style={{ fontSize: '0.78rem', background: '#f8fafc', padding: '0.35rem 0.5rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Site Contact:</span> {loc.contact_person || 'Staff'} {loc.contact_number ? `(${loc.contact_number})` : ''}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleOpenEditLocation(loc)}>Edit</button>
                        <button
                          className={`btn btn-sm ${loc.is_active ? 'btn-danger' : 'btn-primary'}`}
                          onClick={() => handleToggleLocationStatus(loc.id)}
                        >
                          {loc.is_active ? 'Disable' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DETAIL TAB 3: CONTACT PERSONS */}
            {detailTab === 'contacts' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Customer Contact Directory</h4>
                  <button className="btn btn-sm btn-primary" onClick={handleOpenAddContact}>
                    + Add Contact Person
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {viewCustomer.contacts?.map((cnt) => (
                    <div
                      key={cnt.id}
                      className="card"
                      style={{
                        padding: '1rem',
                        borderLeft: `4px solid ${cnt.is_primary ? 'var(--primary-color)' : 'var(--border-color)'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem' }}>{cnt.name}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cnt.designation || 'Staff Contact'}</div>
                        </div>
                        {cnt.is_primary && (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                            ★ Primary
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.82rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <div>📞 <a href={`tel:${cnt.mobile}`} style={{ color: 'var(--primary-color)', fontWeight: '600' }}>{cnt.mobile}</a></div>
                        <div>✉ <a href={`mailto:${cnt.email}`} style={{ color: 'var(--primary-color)' }}>{cnt.email}</a></div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleOpenEditContact(cnt)}>Edit</button>
                        {!cnt.is_primary && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteContact(cnt.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SERVICE LOCATION SUB-MODAL */}
      {showLocationModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>{editingLocation ? 'Edit Service Location' : 'Add New Service Location'}</h3>
              <button className="modal-close" onClick={() => setShowLocationModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmitLocation}>
              {locError && <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{locError}</div>}

              <div className="form-group">
                <label className="form-label">Location Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Head Office / Branch 2"
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full Address *</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Plot/Street/Area Address"
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
                  <label className="form-label">Site Contact Person</label>
                  <input type="text" className="form-input" placeholder="Name" value={locContactPerson} onChange={(e) => setLocContactPerson(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Site Contact Phone</label>
                  <input type="tel" className="form-input" placeholder="Phone" value={locContactNumber} onChange={(e) => setLocContactNumber(e.target.value)} />
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowLocationModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={locSubmitting}>
                  {locSubmitting ? 'Saving...' : (editingLocation ? 'Update Location' : 'Add Location')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONTACT PERSON SUB-MODAL */}
      {showContactModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{editingContact ? 'Edit Contact Person' : 'Add Contact Person'}</h3>
              <button className="modal-close" onClick={() => setShowContactModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleSubmitContact}>
              {contactError && <div className="alert alert-danger" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>{contactError}</div>}

              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Vikram Verma" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Designation / Role</label>
                <input type="text" className="form-input" placeholder="e.g. IT Director / Plant Lead" value={contactDesignation} onChange={(e) => setContactDesignation(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Mobile Number *</label>
                <input type="tel" className="form-input" placeholder="+91 98765 00000" value={contactMobile} onChange={(e) => setContactMobile(e.target.value)} required />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input type="email" className="form-input" placeholder="contact@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={contactIsPrimary} onChange={(e) => setContactIsPrimary(e.target.checked)} />
                  <strong>Set as Primary Contact Person</strong>
                </label>
              </div>

              <div className="modal-actions" style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowContactModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={contactSubmitting}>
                  {contactSubmitting ? 'Saving...' : (editingContact ? 'Update Contact' : 'Add Contact')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
