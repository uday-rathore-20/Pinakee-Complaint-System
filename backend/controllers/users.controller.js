const bcrypt = require('bcryptjs');
const dbPool = require('../config/db');

/**
 * Helper to check if a record exists in a table.
 */
const checkRecordExists = async (table, id) => {
  const result = await dbPool.query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
  return result.rows.length > 0;
};

/**
 * Get users list.
 * GET /api/users
 */
const getUsers = async (req, res) => {
  const { role, department, is_active } = req.query;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, u.city, u.state, u.pincode, u.is_active,
             r.name AS role, d.name AS department, u.created_at, u.updated_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
    `;
    const queryParams = [];
    const whereClauses = [];

    if (role) {
      queryParams.push(role.toUpperCase().trim());
      whereClauses.push(`r.name = $${queryParams.length}`);
    }

    if (department) {
      queryParams.push(department.trim());
      whereClauses.push(`d.name = $${queryParams.length}`);
    }

    if (is_active !== undefined) {
      const activeBool = is_active === 'true';
      queryParams.push(activeBool);
      whereClauses.push(`u.is_active = $${queryParams.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const result = await dbPool.query(query, queryParams);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get users error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve users list'
    });
  }
};

/**
 * Get user by ID.
 * GET /api/users/:id
 */
const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, u.city, u.state, u.pincode, u.is_active,
             r.name AS role, d.name AS department, u.created_at, u.updated_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const result = await dbPool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get user by ID error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user'
    });
  }
};

/**
 * Create a new user.
 * POST /api/users
 * Restricted to ADMIN
 */
const createUser = async (req, res) => {
  const { role_id, department_id, first_name, last_name, email, password } = req.body;

  // Validation
  if (!role_id || !first_name || !last_name || !email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Role ID, first name, last name, email, and password are required'
    });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const formattedEmail = email.toLowerCase().trim();

    // Check duplicate email
    const emailCheck = await dbPool.query('SELECT id FROM users WHERE email = $1', [formattedEmail]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Email address is already in use'
      });
    }

    // Validate role exists and is allowed for new user creation
    const roleCheck = await dbPool.query('SELECT id, name FROM roles WHERE id = $1', [role_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role_id: role does not exist'
      });
    }

    const roleName = roleCheck.rows[0].name;
    const allowedNewRoles = ['ADMIN', 'ENGINEER', 'CUSTOMER'];
    if (!allowedNewRoles.includes(roleName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role_id: '${roleName}' is no longer accepted as an active application role. Allowed roles: ${allowedNewRoles.join(', ')}`
      });
    }

    // Validate department exists if provided
    if (department_id) {
      const deptExists = await checkRecordExists('departments', department_id);
      if (!deptExists) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id: department does not exist'
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert
    const insertQuery = `
      INSERT INTO users (role_id, department_id, first_name, last_name, email, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id
    `;
    const insertResult = await dbPool.query(insertQuery, [
      role_id,
      department_id || null,
      first_name.trim(),
      last_name.trim(),
      formattedEmail,
      passwordHash
    ]);

    // Fetch the newly created user's detail record (with roles/department text)
    const newUserId = insertResult.rows[0].id;
    const fetchQuery = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, 
             r.name AS role, d.name AS department, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const fetchResult = await dbPool.query(fetchQuery, [newUserId]);

    const logger = require('../utils/logger');
    logger.audit('USER_CREATED', { createdUserId: newUserId, email: email.toLowerCase().trim() }, req.user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: fetchResult.rows[0]
    });
  } catch (error) {
    console.error('Create user error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user account'
    });
  }
};

/**
 * Update an existing user profile details.
 * PUT /api/users/:id
 * Restricted to ADMIN
 */
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { role_id, department_id, first_name, last_name, email, password, is_active } = req.body;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check if user exists
    const userCheck = await dbPool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prepare fields to update
    const updateFields = [];
    const values = [];

    if (first_name) {
      values.push(first_name.trim());
      updateFields.push(`first_name = $${values.length}`);
    }

    if (last_name) {
      values.push(last_name.trim());
      updateFields.push(`last_name = $${values.length}`);
    }

    if (email) {
      const formattedEmail = email.toLowerCase().trim();
      // Check duplicate email
      const emailCheck = await dbPool.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [formattedEmail, id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email address is already in use by another user'
        });
      }
      values.push(formattedEmail);
      updateFields.push(`email = $${values.length}`);
    }

    if (role_id) {
      const roleCheck = await dbPool.query('SELECT id, name FROM roles WHERE id = $1', [role_id]);
      if (roleCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid role_id: role does not exist' });
      }
      const roleName = roleCheck.rows[0].name;
      const allowedNewRoles = ['ADMIN', 'ENGINEER', 'CUSTOMER'];
      if (!allowedNewRoles.includes(roleName)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role_id: '${roleName}' is no longer accepted as an active application role. Allowed roles: ${allowedNewRoles.join(', ')}`
        });
      }
      values.push(role_id);
      updateFields.push(`role_id = $${values.length}`);
    }

    if (department_id !== undefined) {
      if (department_id !== null) {
        const deptExists = await checkRecordExists('departments', department_id);
        if (!deptExists) {
          return res.status(400).json({ success: false, message: 'Invalid department_id: department does not exist' });
        }
      }
      values.push(department_id);
      updateFields.push(`department_id = $${values.length}`);
    }

    if (is_active !== undefined) {
      values.push(is_active);
      updateFields.push(`is_active = $${values.length}`);
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      values.push(passwordHash);
      updateFields.push(`password_hash = $${values.length}`);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update'
      });
    }

    // Add ID to values array
    values.push(id);
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')} 
      WHERE id = $${values.length}
    `;
    await dbPool.query(updateQuery, values);

    // Fetch updated safe user profile
    const fetchQuery = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, 
             r.name AS role, d.name AS department, u.created_at, u.updated_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const fetchResult = await dbPool.query(fetchQuery, [id]);

    const logger = require('../utils/logger');
    logger.audit('USER_UPDATED', { updatedUserId: id }, req.user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: fetchResult.rows[0]
    });
  } catch (error) {
    console.error('Update user error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user account'
    });
  }
};

/**
 * Patch user active status.
 * PATCH /api/users/:id/status
 * Restricted to ADMIN
 */
const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { is_active } = req.body;

  if (is_active === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Field is_active (boolean) is required'
    });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      UPDATE users 
      SET is_active = $1 
      WHERE id = $2
      RETURNING id, is_active
    `;
    const result = await dbPool.query(query, [is_active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const logger = require('../utils/logger');
    logger.audit('USER_STATUS_TOGGLED', { updatedUserId: id, is_active }, req.user, req.ip);

    return res.status(200).json({
      success: true,
      message: `User account has been ${is_active ? 'activated' : 'deactivated'}`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update user status error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to modify user status'
    });
  }
};

const updateUserProfile = async (req, res) => {
  const userId = req.user.id;
  const { first_name, last_name, phone_number, address, city, state, pincode } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ success: false, message: 'First name and last name are required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      UPDATE users 
      SET first_name = $1, last_name = $2,
          phone_number = COALESCE($3, phone_number),
          address = COALESCE($4, address),
          city = COALESCE($5, city),
          state = COALESCE($6, state),
          pincode = COALESCE($7, pincode),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id
    `;
    const result = await dbPool.query(query, [
      first_name.trim(),
      last_name.trim(),
      phone_number !== undefined ? phone_number?.trim() : null,
      address !== undefined ? address?.trim() : null,
      city !== undefined ? city?.trim() : null,
      state !== undefined ? state?.trim() : null,
      pincode !== undefined ? pincode?.trim() : null,
      userId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Fetch the complete profile details with text names for role/department
    const fetchQuery = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, u.city, u.state, u.pincode, u.is_active,
             r.name AS role, d.name AS department, u.created_at, u.updated_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const fetchResult = await dbPool.query(fetchQuery, [userId]);

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: fetchResult.rows[0]
    });
  } catch (error) {
    console.error('Update user profile error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update user profile' });
  }
};

const changeUserPassword = async (req, res) => {
  const userId = req.user.id;
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ success: false, message: 'Current password and new password are required' });
  }

  if (new_password.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Retrieve the user's password hash
    const userResult = await dbPool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { password_hash } = userResult.rows[0];

    // Verify current password matches stored hash
    const isMatch = await bcrypt.compare(current_password, password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);

    // Save the new password hash
    await dbPool.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPasswordHash, userId]);

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change user password error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

/**
 * Export all users as a CSV file.
 * GET /api/users/export
 */
const exportUsers = async (req, res) => {
  const user = req.user;

  // Double check ADMIN role authorization
  if (user.role !== 'ADMIN') {
    const logger = require('../utils/logger');
    logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'export_users_csv' }, user, req.ip);
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access only' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT u.first_name, u.last_name, u.email, u.is_active,
             r.name AS role, d.name AS department, u.created_at
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      ORDER BY u.created_at DESC
    `;

    const result = await dbPool.query(query);
    const logger = require('../utils/logger');
    logger.audit('USERS_EXPORTED_CSV', { recordCount: result.rows.length }, user, req.ip);

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      let stringVal = String(val);
      if (stringVal.startsWith('=') || stringVal.startsWith('+') || stringVal.startsWith('-') || stringVal.startsWith('@')) {
        stringVal = `'${stringVal}`;
      }
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    };

    const headers = ['First Name', 'Last Name', 'Email', 'Role', 'Department', 'Active Status', 'Date Created'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const csvRow = [
        escapeCSV(row.first_name),
        escapeCSV(row.last_name),
        escapeCSV(row.email),
        escapeCSV(row.role),
        escapeCSV(row.department || 'None'),
        escapeCSV(row.is_active ? 'Active' : 'Inactive'),
        escapeCSV(new Date(row.created_at).toISOString())
      ];
      csvRows.push(csvRow.join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="users_export_${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export users error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to export users list' });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  updateUserProfile,
  changeUserPassword,
  exportUsers,
};
