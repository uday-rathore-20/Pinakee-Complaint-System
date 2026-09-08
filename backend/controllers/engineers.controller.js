const bcrypt = require('bcryptjs');
const dbPool = require('../config/db');
const logger = require('../utils/logger');

/**
 * List all engineers with skill tags and workload counts.
 * GET /api/engineers
 */
const getEngineers = async (req, res) => {
  const { search, status, department, employment_type } = req.query;
  const user = req.user;

  // Authorization: Admin, Dept Head (or internal lookup)
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at,
             ep.engineer_code, ep.employee_id, ep.designation, ep.department,
             ep.employment_type, ep.engineer_status, ep.base_location, ep.city, ep.state, ep.pincode,
             ep.official_mobile, ep.official_email, ep.joining_date,
             (
               SELECT COALESCE(json_agg(json_build_object('id', s.id, 'name', s.name, 'category', s.category)), '[]')
               FROM engineer_skills es
               JOIN skills s ON es.skill_id = s.id
               WHERE es.engineer_id = u.id
             ) AS skills,
             (
               SELECT COALESCE(json_agg(json_build_object('id', et.id, 'name', et.name)), '[]')
               FROM engineer_expertise ee
               JOIN expertise_types et ON ee.expertise_id = et.id
               WHERE ee.engineer_id = u.id
             ) AS expertise,
             (
               SELECT COUNT(*)::int
               FROM complaints c
               JOIN complaint_statuses cs ON c.status_id = cs.id
               WHERE c.assigned_to_id = u.id AND cs.name NOT IN ('Resolved', 'Closed')
             ) AS active_tickets_count,
             (
               SELECT COUNT(*)::int
               FROM complaints c
               JOIN complaint_statuses cs ON c.status_id = cs.id
               WHERE c.assigned_to_id = u.id AND cs.name = 'Resolved'
             ) AS resolved_tickets_count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN engineer_profiles ep ON u.id = ep.user_id
      WHERE r.name = 'ENGINEER'
    `;

    const queryParams = [];

    if (status !== undefined && status !== '') {
      queryParams.push(status === 'true' || status === 'active');
      query += ` AND u.is_active = $${queryParams.length}`;
    }

    if (department) {
      queryParams.push(department.trim());
      query += ` AND ep.department = $${queryParams.length}`;
    }

    if (employment_type) {
      queryParams.push(employment_type.trim());
      query += ` AND ep.employment_type = $${queryParams.length}`;
    }

    if (search) {
      queryParams.push(`%${search.trim()}%`);
      const pIdx = queryParams.length;
      query += ` AND (
        u.first_name ILIKE $${pIdx} OR
        u.last_name ILIKE $${pIdx} OR
        u.email ILIKE $${pIdx} OR
        u.phone_number ILIKE $${pIdx} OR
        ep.engineer_code ILIKE $${pIdx} OR
        ep.employee_id ILIKE $${pIdx} OR
        ep.designation ILIKE $${pIdx} OR
        ep.base_location ILIKE $${pIdx}
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
    console.error('Get engineers error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve engineers' });
  }
};

/**
 * Get engineer by user ID with skills, expertise, and operational profile.
 * GET /api/engineers/:id
 */
const getEngineerById = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const targetId = parseInt(id, 10);

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Role-based field scoping
    const isStaff = user.role === 'ADMIN' || user.role === 'DEPT_HEAD' || user.id === targetId;

    let query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.is_active, u.created_at,
             r.name AS role,
             ep.engineer_code, ep.employee_id, ep.designation, ep.department,
             ep.employment_type, ep.engineer_status, ep.official_mobile, ep.official_email,
             ep.base_location, ep.city, ep.state, ep.pincode, ep.joining_date
    `;

    if (isStaff) {
      query += `, ep.alternate_mobile, ep.personal_email, ep.emergency_contact, ep.date_of_birth, ep.gender`;
    }

    query += `
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN engineer_profiles ep ON u.id = ep.user_id
      WHERE u.id = $1 AND r.name = 'ENGINEER'
    `;

    const result = await dbPool.query(query, [targetId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Engineer not found' });
    }

    const engineer = result.rows[0];

    // Fetch skills
    const skillsQuery = `
      SELECT s.id, s.name, s.category
      FROM engineer_skills es
      JOIN skills s ON es.skill_id = s.id
      WHERE es.engineer_id = $1
      ORDER BY s.category ASC, s.name ASC
    `;
    const skillsRes = await dbPool.query(skillsQuery, [targetId]);

    // Fetch expertise
    const expQuery = `
      SELECT et.id, et.name
      FROM engineer_expertise ee
      JOIN expertise_types et ON ee.expertise_id = et.id
      WHERE ee.engineer_id = $1
      ORDER BY et.name ASC
    `;
    const expRes = await dbPool.query(expQuery, [targetId]);

    return res.status(200).json({
      success: true,
      data: {
        engineer,
        skills: skillsRes.rows,
        expertise: expRes.rows
      }
    });
  } catch (error) {
    console.error('Get engineer details error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve engineer details' });
  }
};

/**
 * Create a new Engineer account with profile, skills, and expertise.
 * POST /api/engineers
 */
const createEngineer = async (req, res) => {
  const user = req.user;

  // Authorization: Admin only
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required to create engineer accounts' });
  }

  const {
    first_name,
    last_name,
    email,
    mobile,
    phone_number,
    alternate_mobile,
    personal_email,
    emergency_contact,
    password,
    confirm_password,
    employee_id,
    designation = 'Field Service Engineer',
    department = 'IT Support',
    joining_date,
    employment_type = 'FULL_TIME',
    engineer_status = 'ACTIVE',
    date_of_birth,
    gender,
    base_location,
    city,
    state,
    pincode,
    skills = [],
    expertise = [],
    is_active = true
  } = req.body;

  const contactNumber = mobile || phone_number;

  // Validations
  if (!first_name || first_name.trim().length < 2 || first_name.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Engineer first name must be between 2 and 100 characters' });
  }
  if (!last_name || last_name.trim().length < 2 || last_name.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Engineer last name must be between 2 and 100 characters' });
  }
  const fullEngName = `${first_name.trim()} ${last_name.trim()}`;
  if (fullEngName.length > 150) {
    return res.status(400).json({ success: false, message: 'Full engineer name must not exceed 150 characters' });
  }
  if (!employee_id || !employee_id.trim() || employee_id.trim().length > 50) {
    return res.status(400).json({ success: false, message: 'Employee ID is required (up to 50 characters)' });
  }
  if (!designation || !designation.trim() || designation.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Designation is required (up to 100 characters)' });
  }
  if (!city || !city.trim() || city.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Base City is required (up to 100 characters)' });
  }
  if (!state || !state.trim() || state.trim().length > 100) {
    return res.status(400).json({ success: false, message: 'Base State is required (up to 100 characters)' });
  }
  if (!email || !email.trim() || email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ success: false, message: 'A valid official email address is required' });
  }
  if (!contactNumber || !contactNumber.trim() || contactNumber.trim().length > 20 || !/^[0-9+\-\s()]{7,20}$/.test(contactNumber.trim())) {
    return res.status(400).json({ success: false, message: 'A valid official mobile phone number (7-20 digits) is required' });
  }
  if (alternate_mobile && (!/^[0-9+\-\s()]{7,20}$/.test(alternate_mobile.trim()) || alternate_mobile.trim().length > 20)) {
    return res.status(400).json({ success: false, message: 'Alternate mobile number must be a valid phone format' });
  }
  if (personal_email && (personal_email.trim().length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal_email.trim()))) {
    return res.status(400).json({ success: false, message: 'Personal email must be a valid email address' });
  }
  if (!password || password.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  if (confirm_password && password !== confirm_password) {
    return res.status(400).json({ success: false, message: 'Password and Confirm Password do not match' });
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

    // Check if employee_id already exists
    const empCheck = await client.query('SELECT id FROM engineer_profiles WHERE employee_id = $1', [employee_id.trim()]);
    if (empCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Employee ID is already in use by another engineer' });
    }

    // 2. Fetch ENGINEER role ID
    const roleRes = await client.query("SELECT id FROM roles WHERE name = 'ENGINEER'");
    if (roleRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ success: false, message: 'ENGINEER role configuration is missing' });
    }
    const engineerRoleId = roleRes.rows[0].id;

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
      engineerRoleId,
      first_name.trim(),
      last_name.trim(),
      email.toLowerCase().trim(),
      passwordHash,
      contactNumber.trim(),
      base_location ? base_location.trim() : null,
      city ? city.trim() : null,
      state ? state.trim() : null,
      pincode ? pincode.trim() : null,
      is_active !== false
    ];
    const userRes = await client.query(userInsertQuery, userValues);
    const newUserId = userRes.rows[0].id;

    // 5. Generate Engineer Code
    const codeSeqRes = await client.query("SELECT nextval('engineer_code_seq') AS num");
    const engNum = codeSeqRes.rows[0].num;
    const engineerCode = `ENG-${String(engNum).padStart(4, '0')}`;
    const employeeIdVal = employee_id && employee_id.trim() ? employee_id.trim() : `EMP-${String(engNum).padStart(3, '0')}`;

    // 6. Insert Engineer Profile
    const profileInsertQuery = `
      INSERT INTO engineer_profiles (
        user_id, engineer_code, employee_id,
        official_mobile, official_email, alternate_mobile, personal_email, emergency_contact,
        designation, department, joining_date, employment_type, engineer_status,
        date_of_birth, gender, base_location, city, state, pincode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;
    const profileValues = [
      newUserId,
      engineerCode,
      employeeIdVal,
      contactNumber.trim(),
      email.toLowerCase().trim(),
      alternate_mobile ? alternate_mobile.trim() : null,
      personal_email ? personal_email.toLowerCase().trim() : null,
      emergency_contact ? emergency_contact.trim() : null,
      designation.trim(),
      department ? department.trim() : 'IT Support',
      joining_date || null,
      employment_type || 'FULL_TIME',
      engineer_status || 'ACTIVE',
      date_of_birth || null,
      gender || null,
      base_location ? base_location.trim() : null,
      city ? city.trim() : null,
      state ? state.trim() : null,
      pincode ? pincode.trim() : null
    ];
    const profileRes = await client.query(profileInsertQuery, profileValues);

    // 7. Insert Skills
    if (Array.isArray(skills) && skills.length > 0) {
      for (const skillItem of skills) {
        let skillId = typeof skillItem === 'number' ? skillItem : null;
        if (!skillId && typeof skillItem === 'string') {
          const sRes = await client.query('SELECT id FROM skills WHERE name ILIKE $1', [skillItem.trim()]);
          if (sRes.rows.length > 0) skillId = sRes.rows[0].id;
        }
        if (skillId) {
          await client.query('INSERT INTO engineer_skills (engineer_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [newUserId, skillId]);
        }
      }
    }

    // 8. Insert Expertise
    if (Array.isArray(expertise) && expertise.length > 0) {
      for (const expItem of expertise) {
        let expId = typeof expItem === 'number' ? expItem : null;
        if (!expId && typeof expItem === 'string') {
          const eRes = await client.query('SELECT id FROM expertise_types WHERE name ILIKE $1', [expItem.trim()]);
          if (eRes.rows.length > 0) expId = eRes.rows[0].id;
        }
        if (expId) {
          await client.query('INSERT INTO engineer_expertise (engineer_id, expertise_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [newUserId, expId]);
        }
      }
    }

    await client.query('COMMIT');

    logger.audit('ENGINEER_CREATED', {
      createdEngineerId: newUserId,
      engineerCode,
      employeeId: employeeIdVal,
      email: email.toLowerCase().trim()
    }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Engineer account created successfully',
      data: {
        user: userRes.rows[0],
        profile: profileRes.rows[0]
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create engineer error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create engineer account' });
  } finally {
    client.release();
  }
};

/**
 * Update Engineer details, skills, and expertise.
 * PUT /api/engineers/:id
 */
const updateEngineer = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const targetId = parseInt(id, 10);

  // Authorization: Admin or Engineer Self
  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD' && user.id !== targetId) {
    logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'update_engineer_profile', targetEngineerId: targetId }, user, req.ip);
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to update this profile' });
  }

  const {
    first_name,
    last_name,
    mobile,
    phone_number,
    alternate_mobile,
    personal_email,
    emergency_contact,
    employee_id,
    designation,
    department,
    joining_date,
    employment_type,
    engineer_status,
    date_of_birth,
    gender,
    base_location,
    city,
    state,
    pincode,
    skills,
    expertise,
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
    if (base_location) {
      userValues.push(base_location.trim());
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
      await client.query(`
        UPDATE users
        SET ${userUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${userValues.length}
      `, userValues);
    }

    // 2. Update engineer_profiles
    const profCheck = await client.query('SELECT id FROM engineer_profiles WHERE user_id = $1', [targetId]);

    if (profCheck.rows.length === 0) {
      const codeSeqRes = await client.query("SELECT nextval('engineer_code_seq') AS num");
      const engNum = codeSeqRes.rows[0].num;
      const engineerCode = `ENG-${String(engNum).padStart(4, '0')}`;

      await client.query(`
        INSERT INTO engineer_profiles (
          user_id, engineer_code, employee_id, official_mobile, official_email,
          alternate_mobile, personal_email, emergency_contact, designation, department,
          joining_date, employment_type, engineer_status, date_of_birth, gender,
          base_location, city, state, pincode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
        targetId, engineerCode, employee_id || `EMP-${String(engNum).padStart(3, '0')}`,
        contactNumber || null, user.email || null, alternate_mobile || null, personal_email || null,
        emergency_contact || null, designation || 'Field Service Engineer', department || 'IT Support',
        joining_date || null, employment_type || 'FULL_TIME', engineer_status || 'ACTIVE',
        date_of_birth || null, gender || null, base_location || null, city || null, state || null, pincode || null
      ]);
    } else {
      const profUpdateFields = [];
      const profValues = [];

      if (employee_id !== undefined && user.role === 'ADMIN') {
        profValues.push(employee_id ? employee_id.trim() : null);
        profUpdateFields.push(`employee_id = $${profValues.length}`);
      }
      if (contactNumber !== undefined) {
        profValues.push(contactNumber ? contactNumber.trim() : null);
        profUpdateFields.push(`official_mobile = $${profValues.length}`);
      }
      if (alternate_mobile !== undefined) {
        profValues.push(alternate_mobile ? alternate_mobile.trim() : null);
        profUpdateFields.push(`alternate_mobile = $${profValues.length}`);
      }
      if (personal_email !== undefined) {
        profValues.push(personal_email ? personal_email.toLowerCase().trim() : null);
        profUpdateFields.push(`personal_email = $${profValues.length}`);
      }
      if (emergency_contact !== undefined) {
        profValues.push(emergency_contact ? emergency_contact.trim() : null);
        profUpdateFields.push(`emergency_contact = $${profValues.length}`);
      }
      if (designation !== undefined && user.role === 'ADMIN') {
        profValues.push(designation.trim());
        profUpdateFields.push(`designation = $${profValues.length}`);
      }
      if (department !== undefined && user.role === 'ADMIN') {
        profValues.push(department ? department.trim() : 'IT Support');
        profUpdateFields.push(`department = $${profValues.length}`);
      }
      if (joining_date !== undefined && user.role === 'ADMIN') {
        profValues.push(joining_date || null);
        profUpdateFields.push(`joining_date = $${profValues.length}`);
      }
      if (employment_type !== undefined && user.role === 'ADMIN') {
        profValues.push(employment_type.trim());
        profUpdateFields.push(`employment_type = $${profValues.length}`);
      }
      if (engineer_status !== undefined && user.role === 'ADMIN') {
        profValues.push(engineer_status.trim());
        profUpdateFields.push(`engineer_status = $${profValues.length}`);
      }
      if (date_of_birth !== undefined) {
        profValues.push(date_of_birth || null);
        profUpdateFields.push(`date_of_birth = $${profValues.length}`);
      }
      if (gender !== undefined) {
        profValues.push(gender ? gender.trim() : null);
        profUpdateFields.push(`gender = $${profValues.length}`);
      }
      if (base_location !== undefined) {
        profValues.push(base_location ? base_location.trim() : null);
        profUpdateFields.push(`base_location = $${profValues.length}`);
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

      if (profUpdateFields.length > 0) {
        profValues.push(targetId);
        await client.query(`
          UPDATE engineer_profiles
          SET ${profUpdateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $${profValues.length}
        `, profValues);
      }
    }

    // 3. Update Skills if provided
    if (skills !== undefined && Array.isArray(skills)) {
      await client.query('DELETE FROM engineer_skills WHERE engineer_id = $1', [targetId]);
      for (const skillItem of skills) {
        let skillId = typeof skillItem === 'number' ? skillItem : null;
        if (!skillId && typeof skillItem === 'string') {
          const sRes = await client.query('SELECT id FROM skills WHERE name ILIKE $1', [skillItem.trim()]);
          if (sRes.rows.length > 0) skillId = sRes.rows[0].id;
        }
        if (skillId) {
          await client.query('INSERT INTO engineer_skills (engineer_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, skillId]);
        }
      }
    }

    // 4. Update Expertise if provided
    if (expertise !== undefined && Array.isArray(expertise)) {
      await client.query('DELETE FROM engineer_expertise WHERE engineer_id = $1', [targetId]);
      for (const expItem of expertise) {
        let expId = typeof expItem === 'number' ? expItem : null;
        if (!expId && typeof expItem === 'string') {
          const eRes = await client.query('SELECT id FROM expertise_types WHERE name ILIKE $1', [expItem.trim()]);
          if (eRes.rows.length > 0) expId = eRes.rows[0].id;
        }
        if (expId) {
          await client.query('INSERT INTO engineer_expertise (engineer_id, expertise_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [targetId, expId]);
        }
      }
    }

    await client.query('COMMIT');

    logger.audit('ENGINEER_UPDATED', { updatedEngineerId: targetId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Engineer profile updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update engineer error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update engineer profile' });
  } finally {
    client.release();
  }
};

/**
 * Toggle Engineer Status (Active/Disabled).
 * PATCH /api/engineers/:id/status
 */
const toggleEngineerStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active, engineer_status } = req.body;
  const user = req.user;

  if (user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
  }

  try {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const targetActive = is_active !== undefined ? (is_active === true || is_active === 'true') : true;

      const userRes = await client.query(
        'UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, is_active',
        [targetActive, id]
      );

      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Engineer not found' });
      }

      if (engineer_status) {
        await client.query(
          'UPDATE engineer_profiles SET engineer_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [engineer_status, id]
        );
      } else {
        await client.query(
          'UPDATE engineer_profiles SET engineer_status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [targetActive ? 'ACTIVE' : 'DISABLED', id]
        );
      }

      await client.query('COMMIT');

      logger.audit('ENGINEER_STATUS_TOGGLED', { engineerId: id, is_active: targetActive }, user, req.ip);

      return res.status(200).json({
        success: true,
        message: `Engineer account has been ${targetActive ? 'activated' : 'disabled'}`,
        data: { id, is_active: targetActive }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Toggle engineer status error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update engineer status' });
  }
};

/**
 * Get lookups for skills and expertise types.
 * GET /api/engineers/meta/skills-expertise
 */
const getSkillsAndExpertise = async (req, res) => {
  try {
    const skillsRes = await dbPool.query('SELECT id, name, category FROM skills ORDER BY category ASC, name ASC');
    const expertiseRes = await dbPool.query('SELECT id, name FROM expertise_types ORDER BY name ASC');

    return res.status(200).json({
      success: true,
      data: {
        skills: skillsRes.rows,
        expertise: expertiseRes.rows
      }
    });
  } catch (error) {
    console.error('Get skills & expertise error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve skills metadata' });
  }
};

module.exports = {
  getEngineers,
  getEngineerById,
  createEngineer,
  updateEngineer,
  toggleEngineerStatus,
  getSkillsAndExpertise
};
