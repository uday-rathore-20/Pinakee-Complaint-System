const bcrypt = require('bcryptjs');
const dbPool = require('../config/db');
const logger = require('../utils/logger');

/**
 * List all customers with summary metrics.
 * GET /api/customers
 */
const getCustomers = async (req, res) => {
  const { search, status, customer_type } = req.query;
  const user = req.user;

  // Authorization: Admin and Dept Head only
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at,
             cp.customer_code, cp.company_name, cp.customer_type, cp.city, cp.state, cp.pincode,
             cp.is_amc, cp.is_warranty,
             (SELECT COUNT(*)::int FROM customer_service_locations WHERE customer_id = u.id AND is_active = true) AS active_locations_count,
             (SELECT COUNT(*)::int FROM customer_service_locations WHERE customer_id = u.id) AS total_locations_count,
             (SELECT COUNT(*)::int FROM customer_contacts WHERE customer_id = u.id) AS contacts_count,
             (SELECT COUNT(*)::int FROM complaints WHERE created_by_id = u.id) AS complaints_count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      WHERE r.name = 'CUSTOMER'
    `;

    const queryParams = [];

    if (status !== undefined && status !== '') {
      queryParams.push(status === 'true' || status === 'active');
      query += ` AND u.is_active = $${queryParams.length}`;
    }

    if (customer_type) {
      queryParams.push(customer_type.trim());
      query += ` AND cp.customer_type = $${queryParams.length}`;
    }

    if (search) {
      queryParams.push(`%${search.trim()}%`);
      const pIdx = queryParams.length;
      query += ` AND (
        u.first_name ILIKE $${pIdx} OR
        u.last_name ILIKE $${pIdx} OR
        u.email ILIKE $${pIdx} OR
        u.phone_number ILIKE $${pIdx} OR
        cp.company_name ILIKE $${pIdx} OR
        cp.customer_code ILIKE $${pIdx} OR
        cp.city ILIKE $${pIdx}
      )`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await dbPool.query(query, queryParams);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get customers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve customers' });
  }
};

/**
 * Get customer by user ID with full profile, locations, and contacts.
 * GET /api/customers/:id
 */
const getCustomerById = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const targetId = parseInt(id, 10);

  // Authorization: Admin or Customer Self only (prevents IDOR)
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetId) {
    logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'view_customer_profile', targetCustomerId: targetId }, user, req.ip);
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this customer profile' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch user + profile
    const userQuery = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at, u.updated_at,
             r.name AS role,
             cp.customer_code, cp.company_name, cp.customer_type, cp.alternate_mobile, cp.alternate_email,
             cp.address_line1, cp.address_line2, cp.city, cp.state, cp.pincode, cp.country,
             cp.gst_number, cp.pan_number, cp.website, cp.customer_category,
             cp.is_amc, cp.is_warranty, cp.notes
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      WHERE u.id = $1 AND r.name = 'CUSTOMER'
    `;
    const userResult = await dbPool.query(userQuery, [targetId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customer = userResult.rows[0];

    // 2. Fetch service locations
    const locQuery = `
      SELECT id, location_code, location_name, address, city, state, pincode,
             contact_person, contact_number, email, is_active, created_at, updated_at
      FROM customer_service_locations
      WHERE customer_id = $1
      ORDER BY is_active DESC, location_name ASC
    `;
    const locResult = await dbPool.query(locQuery, [targetId]);

    // 3. Fetch contacts
    const contactQuery = `
      SELECT id, name, designation, mobile, email, is_primary, created_at, updated_at
      FROM customer_contacts
      WHERE customer_id = $1
      ORDER BY is_primary DESC, name ASC
    `;
    const contactResult = await dbPool.query(contactQuery, [targetId]);

    return res.status(200).json({
      success: true,
      data: {
        customer,
        service_locations: locResult.rows,
        contacts: contactResult.rows
      }
    });
  } catch (error) {
    console.error('Get customer details error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve customer details' });
  }
};

/**
 * Create a new Customer account with profile, primary address, and optional location/contact.
 * POST /api/customers
 */
const createCustomer = async (req, res) => {
  const user = req.user;

  // Authorization: Admin only
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required to create customer accounts' });
  }

  const {
    first_name,
    last_name,
    company_name,
    customer_type = 'Company',
    email,
    mobile,
    phone_number,
    alternate_mobile,
    alternate_email,
    password,
    confirm_password,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    country = 'India',
    gst_number,
    pan_number,
    website,
    customer_category,
    is_amc = false,
    is_warranty = false,
    notes,
    is_active = true,
    initial_location_name,
    initial_contact_person,
    initial_contact_designation
  } = req.body;

  const contactNumber = mobile || phone_number;

  // Validations
  if (!first_name || first_name.trim().length < 2 || first_name.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Customer first name must be between 2 and 100 characters' });
  }
  if (!last_name || last_name.trim().length < 2 || last_name.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Customer last name must be between 2 and 100 characters' });
  }
  const fullName = `${first_name.trim()} ${last_name.trim()}`;
  if (fullName.length > 150) {
    return res.status(400).json({ success: false, message: 'Full customer name must not exceed 150 characters' });
  }
  const compName = company_name ? company_name.trim() : fullName;
  if (compName.length < 2 || compName.length > 200) {
    return res.status(400).json({ success: false, message: 'Company name must be between 2 and 200 characters' });
  }
  const normalizedType = (customer_type || 'Company').toUpperCase() === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY';

  if (!email || !email.trim() || email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'A valid email address (up to 255 characters) is required' });
  }
  if (!contactNumber || !contactNumber.trim() || contactNumber.trim().length > 20 || !/^[0-9+\-\s()]{7,20}$/.test(contactNumber.trim())) {
    return res.status(400).json({ success: false, message: 'A valid mobile phone number (7-20 digits) is required' });
  }
  if (alternate_mobile && (!/^[0-9+\-\s()]{7,20}$/.test(alternate_mobile.trim()) || alternate_mobile.trim().length > 20)) {
    return res.status(400).json({ success: false, message: 'Alternate mobile number must be a valid phone format (up to 20 characters)' });
  }
  if (alternate_email && (alternate_email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alternate_email.trim()))) {
    return res.status(400).json({ success: false, message: 'Alternate email must be a valid email address' });
  }
  if (!password || password.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  if (confirm_password && password !== confirm_password) {
    return res.status(400).json({ success: false, message: 'Password and Confirm Password do not match' });
  }
  if (!address_line1 || !address_line1.trim() || address_line1.trim().length > 255) {
    return res.status(400).json({ success: false, message: 'Primary address line 1 is required (up to 255 characters)' });
  }
  if (!city || !city.trim() || city.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'City is required (up to 100 characters)' });
  }
  if (!state || !state.trim() || state.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'State is required (up to 100 characters)' });
  }
  if (!pincode || !pincode.trim() || !/^\d{4,10}$/.test(pincode.trim().replace(/\s/g, ''))) {
    return res.status(400).json({ success: false, message: 'A valid pincode (4-10 digits) is required' });
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check if email already exists
    const emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Email address is already in use by another account' });
    }

    // 2. Fetch CUSTOMER role ID
    const roleRes = await client.query("SELECT id FROM roles WHERE name = 'CUSTOMER'");
    if (roleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ success: false, message: 'CUSTOMER role configuration is missing' });
    }
    const customerRoleId = roleRes.rows[0].id;

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Insert User
    const userInsertQuery = `
      INSERT INTO users (
        role_id, first_name, last_name, email, password_hash,
        phone_number, address, city, state, pincode, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, first_name, last_name, email, phone_number, is_active, created_at
    `;
    const userValues = [
      customerRoleId,
      first_name.trim(),
      last_name.trim(),
      email.toLowerCase().trim(),
      passwordHash,
      contactNumber.trim(),
      address_line1.trim() + (address_line2 ? `, ${address_line2.trim()}` : ''),
      city.trim(),
      state.trim(),
      pincode.trim(),
      is_active !== false
    ];
    const userRes = await client.query(userInsertQuery, userValues);
    const newUserId = userRes.rows[0].id;

    // 5. Generate Customer Code
    const codeSeqRes = await client.query("SELECT nextval('customer_code_seq') AS num");
    const custNum = codeSeqRes.rows[0].num;
    const customerCode = `CUST-${String(custNum).padStart(4, '0')}`;

    // 6. Insert Customer Profile
    const profileInsertQuery = `
      INSERT INTO customer_profiles (
        user_id, customer_code, company_name, customer_type,
        alternate_mobile, alternate_email,
        address_line1, address_line2, city, state, pincode, country,
        gst_number, pan_number, website, customer_category,
        is_amc, is_warranty, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;
    const profileValues = [
      newUserId,
      customerCode,
      (company_name || `${first_name} ${last_name}`).trim(),
      customer_type || 'Company',
      alternate_mobile ? alternate_mobile.trim() : null,
      alternate_email ? alternate_email.toLowerCase().trim() : null,
      address_line1.trim(),
      address_line2 ? address_line2.trim() : null,
      city.trim(),
      state.trim(),
      pincode.trim(),
      country ? country.trim() : 'India',
      gst_number ? gst_number.trim() : null,
      pan_number ? pan_number.trim() : null,
      website ? website.trim() : null,
      customer_category ? customer_category.trim() : null,
      is_amc === true || is_amc === 'true',
      is_warranty === true || is_warranty === 'true',
      notes ? notes.trim() : null
    ];
    const profileRes = await client.query(profileInsertQuery, profileValues);

    // 7. Auto-create Primary Service Location
    const locSeqRes = await client.query("SELECT nextval('location_code_seq') AS num");
    const locNum = locSeqRes.rows[0].num;
    const locationCode = `LOC-${String(locNum).padStart(4, '0')}`;

    const locName = initial_location_name && initial_location_name.trim() ? initial_location_name.trim() : 'Head Office';
    const locInsertQuery = `
      INSERT INTO customer_service_locations (
        customer_id, location_code, location_name, address, city, state, pincode,
        contact_person, contact_number, email, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *
    `;
    const locValues = [
      newUserId,
      locationCode,
      locName,
      address_line1.trim() + (address_line2 ? `, ${address_line2.trim()}` : ''),
      city.trim(),
      state.trim(),
      pincode.trim(),
      initial_contact_person || `${first_name} ${last_name}`.trim(),
      contactNumber.trim(),
      email.toLowerCase().trim()
    ];
    await client.query(locInsertQuery, locValues);

    // 8. Auto-create Primary Contact Person
    const contactInsertQuery = `
      INSERT INTO customer_contacts (
        customer_id, name, designation, mobile, email, is_primary
      ) VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `;
    const contactValues = [
      newUserId,
      initial_contact_person || `${first_name} ${last_name}`.trim(),
      initial_contact_designation || 'Primary Contact',
      contactNumber.trim(),
      email.toLowerCase().trim()
    ];
    await client.query(contactInsertQuery, contactValues);

    await client.query('COMMIT');

    logger.audit('CUSTOMER_CREATED', {
      createdCustomerId: newUserId,
      customerCode,
      email: email.toLowerCase().trim(),
      company: profileValues[2]
    }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Customer account created successfully',
      data: {
        user: userRes.rows[0],
        profile: profileRes.rows[0]
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create customer error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create customer account' });
  } finally {
    client.release();
  }
};

/**
 * Update Customer details and profile.
 * PUT /api/customers/:id
 */
const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const targetId = parseInt(id, 10);

  // Authorization: Admin or Customer Self only
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetId) {
    logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'update_customer_profile', targetCustomerId: targetId }, user, req.ip);
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to update this profile' });
  }

  const {
    first_name,
    last_name,
    company_name,
    customer_type,
    mobile,
    phone_number,
    alternate_mobile,
    alternate_email,
    address_line1,
    address_line2,
    city,
    state,
    pincode,
    country,
    gst_number,
    pan_number,
    website,
    customer_category,
    is_amc,
    is_warranty,
    notes,
    is_active
  } = req.body;

  const contactNumber = mobile || phone_number;

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // 1. Update users record
    const userUpdateFields = [];
    const userValues = [];

    if (first_name) {
      userValues.push(first_name.trim());
      userUpdateFields.push(`first_name = $${userValues.length}`);
    }
    if (last_name) {
      userValues.push(last_name.trim());
      userUpdateFields.push(`last_name = $${userValues.length}`);
    }
    if (contactNumber) {
      userValues.push(contactNumber.trim());
      userUpdateFields.push(`phone_number = $${userValues.length}`);
    }
    if (address_line1) {
      userValues.push(address_line1.trim() + (address_line2 ? `, ${address_line2.trim()}` : ''));
      userUpdateFields.push(`address = $${userValues.length}`);
    }
    if (city) {
      userValues.push(city.trim());
      userUpdateFields.push(`city = $${userValues.length}`);
    }
    if (state) {
      userValues.push(state.trim());
      userUpdateFields.push(`state = $${userValues.length}`);
    }
    if (pincode) {
      userValues.push(pincode.trim());
      userUpdateFields.push(`pincode = $${userValues.length}`);
    }
    if (is_active !== undefined && user.role === 'ADMIN') {
      userValues.push(is_active === true || is_active === 'true');
      userUpdateFields.push(`is_active = $${userValues.length}`);
    }

    if (userUpdateFields.length > 0) {
      userValues.push(targetId);
      const userUpdateQuery = `
        UPDATE users
        SET ${userUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${userValues.length}
      `;
      await client.query(userUpdateQuery, userValues);
    }

    // 2. Update customer_profiles record (upsert if missing)
    const profCheck = await client.query('SELECT id FROM customer_profiles WHERE user_id = $1', [targetId]);

    if (profCheck.rows.length === 0) {
      // Generate code and insert
      const codeSeqRes = await client.query("SELECT nextval('customer_code_seq') AS num");
      const custNum = codeSeqRes.rows[0].num;
      const customerCode = `CUST-${String(custNum).padStart(4, '0')}`;

      await client.query(`
        INSERT INTO customer_profiles (
          user_id, customer_code, company_name, customer_type, alternate_mobile, alternate_email,
          address_line1, address_line2, city, state, pincode, country,
          gst_number, pan_number, website, customer_category, is_amc, is_warranty, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
        targetId, customerCode, company_name || 'Customer Account', customer_type || 'Company',
        alternate_mobile || null, alternate_email || null,
        address_line1 || null, address_line2 || null, city || null, state || null, pincode || null, country || 'India',
        gst_number || null, pan_number || null, website || null, customer_category || null,
        is_amc || false, is_warranty || false, notes || null
      ]);
    } else {
      const profUpdateFields = [];
      const profValues = [];

      if (company_name !== undefined) {
        profValues.push(company_name.trim());
        profUpdateFields.push(`company_name = $${profValues.length}`);
      }
      if (customer_type !== undefined) {
        profValues.push(customer_type.trim());
        profUpdateFields.push(`customer_type = $${profValues.length}`);
      }
      if (alternate_mobile !== undefined) {
        profValues.push(alternate_mobile ? alternate_mobile.trim() : null);
        profUpdateFields.push(`alternate_mobile = $${profValues.length}`);
      }
      if (alternate_email !== undefined) {
        profValues.push(alternate_email ? alternate_email.toLowerCase().trim() : null);
        profUpdateFields.push(`alternate_email = $${profValues.length}`);
      }
      if (address_line1 !== undefined) {
        profValues.push(address_line1 ? address_line1.trim() : null);
        profUpdateFields.push(`address_line1 = $${profValues.length}`);
      }
      if (address_line2 !== undefined) {
        profValues.push(address_line2 ? address_line2.trim() : null);
        profUpdateFields.push(`address_line2 = $${profValues.length}`);
      }
      if (city !== undefined) {
        profValues.push(city ? city.trim() : null);
        profUpdateFields.push(`city = $${profValues.length}`);
      }
      if (state !== undefined) {
        profValues.push(state ? state.trim() : null);
        profUpdateFields.push(`state = $${profValues.length}`);
      }
      if (pincode !== undefined) {
        profValues.push(pincode ? pincode.trim() : null);
        profUpdateFields.push(`pincode = $${profValues.length}`);
      }
      if (country !== undefined) {
        profValues.push(country ? country.trim() : 'India');
        profUpdateFields.push(`country = $${profValues.length}`);
      }
      if (gst_number !== undefined) {
        profValues.push(gst_number ? gst_number.trim() : null);
        profUpdateFields.push(`gst_number = $${profValues.length}`);
      }
      if (pan_number !== undefined) {
        profValues.push(pan_number ? pan_number.trim() : null);
        profUpdateFields.push(`pan_number = $${profValues.length}`);
      }
      if (website !== undefined) {
        profValues.push(website ? website.trim() : null);
        profUpdateFields.push(`website = $${profValues.length}`);
      }
      if (customer_category !== undefined) {
        profValues.push(customer_category ? customer_category.trim() : null);
        profUpdateFields.push(`customer_category = $${profValues.length}`);
      }
      if (is_amc !== undefined) {
        profValues.push(is_amc === true || is_amc === 'true');
        profUpdateFields.push(`is_amc = $${profValues.length}`);
      }
      if (is_warranty !== undefined) {
        profValues.push(is_warranty === true || is_warranty === 'true');
        profUpdateFields.push(`is_warranty = $${profValues.length}`);
      }
      if (notes !== undefined) {
        profValues.push(notes ? notes.trim() : null);
        profUpdateFields.push(`notes = $${profValues.length}`);
      }

      if (profUpdateFields.length > 0) {
        profValues.push(targetId);
        const profQuery = `
          UPDATE customer_profiles
          SET ${profUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $${profValues.length}
        `;
        await client.query(profQuery, profValues);
      }
    }

    await client.query('COMMIT');

    logger.audit('CUSTOMER_UPDATED', { updatedCustomerId: targetId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Customer profile updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update customer error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update customer profile' });
  } finally {
    client.release();
  }
};

/**
 * Toggle Customer Account Status (Active/Disabled).
 * PATCH /api/customers/:id/status
 */
const toggleCustomerStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;
  const user = req.user;

  if (user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }

  if (is_active === undefined) {
    return res.status(400).json({ success: false, message: 'is_active field is required' });
  }

  try {
    const result = await dbPool.query(
      'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, is_active',
      [is_active === true || is_active === 'true', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    logger.audit('CUSTOMER_STATUS_TOGGLED', { customerId: id, is_active: result.rows[0].is_active }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: `Customer account has been ${result.rows[0].is_active ? 'activated' : 'disabled'}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle customer status error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update customer status' });
  }
};

// ==========================================
// SERVICE LOCATIONS CRUD
// ==========================================

/**
 * List service locations for a customer.
 * GET /api/customers/:customerId/locations
 */
const getServiceLocations = async (req, res) => {
  const { customerId } = req.params;
  const { active_only } = req.query;
  const user = req.user;
  const targetCustId = parseInt(customerId, 10);

  // Authorization: Admin or Customer Self
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetCustId) {
    return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
  }

  try {
    let query = `
      SELECT id, location_code, location_name, address, city, state, pincode,
             contact_person, contact_number, email, is_active, created_at, updated_at
      FROM customer_service_locations
      WHERE customer_id = $1
    `;
    const params = [targetCustId];

    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY is_active DESC, location_name ASC`;

    const result = await dbPool.query(query, params);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get service locations error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve service locations' });
  }
};

/**
 * Add a service location to a customer account.
 * POST /api/customers/:customerId/locations
 */
const addServiceLocation = async (req, res) => {
  const { customerId } = req.params;
  const user = req.user;
  const targetCustId = parseInt(customerId, 10);

  // Authorization: Admin or Customer Self
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetCustId) {
    return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
  }

  const {
    location_name,
    address,
    city,
    state,
    pincode,
    contact_person,
    contact_number,
    email,
    is_active = true
  } = req.body;

  if (!location_name || !location_name.trim()) {
    return res.status(400).json({ success: false, message: 'Location name is required' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ success: false, message: 'Address is required' });
  }
  if (!city || !city.trim() || !state || !state.trim() || !pincode || !pincode.trim()) {
    return res.status(400).json({ success: false, message: 'City, State, and Pincode are required' });
  }

  try {
    const locSeqRes = await dbPool.query("SELECT nextval('location_code_seq') AS num");
    const locNum = locSeqRes.rows[0].num;
    const locationCode = `LOC-${String(locNum).padStart(4, '0')}`;

    const query = `
      INSERT INTO customer_service_locations (
        customer_id, location_code, location_name, address, city, state, pincode,
        contact_person, contact_number, email, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const values = [
      targetCustId,
      locationCode,
      location_name.trim(),
      address.trim(),
      city.trim(),
      state.trim(),
      pincode.trim(),
      contact_person ? contact_person.trim() : null,
      contact_number ? contact_number.trim() : null,
      email ? email.toLowerCase().trim() : null,
      is_active !== false
    ];

    const result = await dbPool.query(query, values);

    logger.audit('SERVICE_LOCATION_CREATED', {
      customerId: targetCustId,
      locationCode,
      locationName: location_name.trim()
    }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Service location added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Add service location error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add service location' });
  }
};

/**
 * Update a service location.
 * PUT /api/customers/locations/:locationId
 */
const updateServiceLocation = async (req, res) => {
  const { locationId } = req.params;
  const user = req.user;
  const targetLocId = parseInt(locationId, 10);

  try {
    // Check ownership
    const checkQuery = `SELECT customer_id FROM customer_service_locations WHERE id = $1`;
    const checkRes = await dbPool.query(checkQuery, [targetLocId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service location not found' });
    }

    const locOwnerId = checkRes.rows[0].customer_id;
    if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== locOwnerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
    }

    const {
      location_name,
      address,
      city,
      state,
      pincode,
      contact_person,
      contact_number,
      email,
      is_active
    } = req.body;

    const updateFields = [];
    const values = [];

    if (location_name) {
      values.push(location_name.trim());
      updateFields.push(`location_name = $${values.length}`);
    }
    if (address) {
      values.push(address.trim());
      updateFields.push(`address = $${values.length}`);
    }
    if (city) {
      values.push(city.trim());
      updateFields.push(`city = $${values.length}`);
    }
    if (state) {
      values.push(state.trim());
      updateFields.push(`state = $${values.length}`);
    }
    if (pincode) {
      values.push(pincode.trim());
      updateFields.push(`pincode = $${values.length}`);
    }
    if (contact_person !== undefined) {
      values.push(contact_person ? contact_person.trim() : null);
      updateFields.push(`contact_person = $${values.length}`);
    }
    if (contact_number !== undefined) {
      values.push(contact_number ? contact_number.trim() : null);
      updateFields.push(`contact_number = $${values.length}`);
    }
    if (email !== undefined) {
      values.push(email ? email.toLowerCase().trim() : null);
      updateFields.push(`email = $${values.length}`);
    }
    if (is_active !== undefined) {
      values.push(is_active === true || is_active === 'true');
      updateFields.push(`is_active = $${values.length}`);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(targetLocId);
    const query = `
      UPDATE customer_service_locations
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await dbPool.query(query, values);

    return res.status(200).json({
      success: true,
      message: 'Service location updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update service location error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update service location' });
  }
};

/**
 * Toggle active status of a service location (soft-disable).
 * PATCH /api/customers/locations/:locationId/status
 */
const toggleServiceLocationStatus = async (req, res) => {
  const { locationId } = req.params;
  const { is_active } = req.body;
  const user = req.user;
  const targetLocId = parseInt(locationId, 10);

  try {
    const checkQuery = `SELECT customer_id, is_active FROM customer_service_locations WHERE id = $1`;
    const checkRes = await dbPool.query(checkQuery, [targetLocId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service location not found' });
    }

    const locOwnerId = checkRes.rows[0].customer_id;
    if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== locOwnerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
    }

    const targetStatus = is_active !== undefined ? (is_active === true || is_active === 'true') : !checkRes.rows[0].is_active;

    const result = await dbPool.query(
      'UPDATE customer_service_locations SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [targetStatus, targetLocId]
    );

    return res.status(200).json({
      success: true,
      message: `Service location has been ${result.rows[0].is_active ? 'activated' : 'deactivated'}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle service location status error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to toggle location status' });
  }
};

// ==========================================
// CONTACT PERSONS CRUD
// ==========================================

/**
 * List contact persons for a customer.
 * GET /api/customers/:customerId/contacts
 */
const getContacts = async (req, res) => {
  const { customerId } = req.params;
  const user = req.user;
  const targetCustId = parseInt(customerId, 10);

  // Authorization: Admin or Customer Self
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetCustId) {
    return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
  }

  try {
    const query = `
      SELECT id, name, designation, mobile, email, is_primary, created_at, updated_at
      FROM customer_contacts
      WHERE customer_id = $1
      ORDER BY is_primary DESC, name ASC
    `;
    const result = await dbPool.query(query, [targetCustId]);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get customer contacts error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve contacts' });
  }
};

/**
 * Add contact person.
 * POST /api/customers/:customerId/contacts
 */
const addContact = async (req, res) => {
  const { customerId } = req.params;
  const user = req.user;
  const targetCustId = parseInt(customerId, 10);

  // Authorization: Admin or Customer Self
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetCustId) {
    return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
  }

  const { name, designation, mobile, email, is_primary = false } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Contact name is required' });
  }
  if (!mobile || !mobile.trim()) {
    return res.status(400).json({ success: false, message: 'Mobile number is required' });
  }
  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    if (is_primary === true || is_primary === 'true') {
      await client.query('UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1', [targetCustId]);
    }

    const query = `
      INSERT INTO customer_contacts (
        customer_id, name, designation, mobile, email, is_primary
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [
      targetCustId,
      name.trim(),
      designation ? designation.trim() : null,
      mobile.trim(),
      email.toLowerCase().trim(),
      is_primary === true || is_primary === 'true'
    ];

    const result = await client.query(query, values);

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Contact person added successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Add contact error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add contact person' });
  } finally {
    client.release();
  }
};

/**
 * Update contact person.
 * PUT /api/customers/contacts/:contactId
 */
const updateContact = async (req, res) => {
  const { contactId } = req.params;
  const user = req.user;
  const targetContactId = parseInt(contactId, 10);

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const checkQuery = `SELECT customer_id FROM customer_contacts WHERE id = $1`;
    const checkRes = await client.query(checkQuery, [targetContactId]);

    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Contact person not found' });
    }

    const custOwnerId = checkRes.rows[0].customer_id;
    if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== custOwnerId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
    }

    const { name, designation, mobile, email, is_primary } = req.body;

    if (is_primary === true || is_primary === 'true') {
      await client.query('UPDATE customer_contacts SET is_primary = false WHERE customer_id = $1', [custOwnerId]);
    }

    const updateFields = [];
    const values = [];

    if (name) {
      values.push(name.trim());
      updateFields.push(`name = $${values.length}`);
    }
    if (designation !== undefined) {
      values.push(designation ? designation.trim() : null);
      updateFields.push(`designation = $${values.length}`);
    }
    if (mobile) {
      values.push(mobile.trim());
      updateFields.push(`mobile = $${values.length}`);
    }
    if (email) {
      values.push(email.toLowerCase().trim());
      updateFields.push(`email = $${values.length}`);
    }
    if (is_primary !== undefined) {
      values.push(is_primary === true || is_primary === 'true');
      updateFields.push(`is_primary = $${values.length}`);
    }

    if (updateFields.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(targetContactId);
    const query = `
      UPDATE customer_contacts
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length}
      RETURNING *
    `;
    const result = await client.query(query, values);

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Contact person updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update contact error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update contact person' });
  } finally {
    client.release();
  }
};

/**
 * Delete contact person.
 * DELETE /api/customers/contacts/:contactId
 */
const deleteContact = async (req, res) => {
  const { contactId } = req.params;
  const user = req.user;
  const targetContactId = parseInt(contactId, 10);

  try {
    const checkQuery = `SELECT customer_id FROM customer_contacts WHERE id = $1`;
    const checkRes = await dbPool.query(checkQuery, [targetContactId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Contact person not found' });
    }

    const custOwnerId = checkRes.rows[0].customer_id;
    if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== custOwnerId) {
      return res.status(403).json({ success: false, message: 'Forbidden: Access denied' });
    }

    await dbPool.query('DELETE FROM customer_contacts WHERE id = $1', [targetContactId]);

    return res.status(200).json({
      success: true,
      message: 'Contact person removed successfully'
    });
  } catch (error) {
    console.error('Delete contact error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete contact person' });
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  getServiceLocations,
  addServiceLocation,
  updateServiceLocation,
  toggleServiceLocationStatus,
  getContacts,
  addContact,
  updateContact,
  deleteContact
};
