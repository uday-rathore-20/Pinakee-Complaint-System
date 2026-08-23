const bcrypt = require('bcryptjs');
const dbPool = require('../config/db');
const { generateToken } = require('../utils/jwt');

/**
 * Handle user login.
 * POST /api/auth/login
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  // Simple validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection is unavailable'
      });
    }

    // Query user by email and join role/department names
    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.password_hash, u.is_active,
             r.name AS role, d.name AS department
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.email = $1
    `;
    const result = await dbPool.query(query, [email.toLowerCase().trim()]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.'
      });
    }

    // Compare hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token containing safe payload
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    // Strip out the password hash before sending the user data
    const safeUser = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      department: user.department
    };

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: safeUser
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during login'
    });
  }
};

/**
 * Handle current authenticated user retrieval.
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user
    }
  });
};

module.exports = {
  login,
  getMe,
};
