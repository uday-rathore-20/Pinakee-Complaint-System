const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dbPool = require('../config/db');
const { generateToken } = require('../utils/jwt');
const logger = require('../utils/logger');

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

    // Query user by email and join role/department names, including security tracking columns
    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.password_hash, u.is_active,
             u.failed_login_attempts, u.locked_until,
             r.name AS role, d.name AS department
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.email = $1
    `;
    const result = await dbPool.query(query, [email.toLowerCase().trim()]);

    if (result.rows.length === 0) {
      logger.audit('AUTH_FAILED', { email: email.toLowerCase().trim(), reason: 'User not found' });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check if account is temporarily locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remainingMin = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        success: false,
        message: `This account has been temporarily locked due to consecutive failed login attempts. Please try again after ${remainingMin} minutes.`
      });
    }

    // Check if user is active
    if (!user.is_active) {
      logger.audit('AUTH_FAILED', { email: user.email, reason: 'Account deactivated' });
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.'
      });
    }

    // Compare hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      let newAttempts = (user.failed_login_attempts || 0) + 1;

      // If lockout expired but attempts weren't reset, reset tracker starting at 1
      if (user.locked_until && new Date() >= new Date(user.locked_until)) {
        newAttempts = 1;
      }

      if (newAttempts >= 5) {
        const lockTime = new Date();
        lockTime.setMinutes(lockTime.getMinutes() + 15); // 15 mins lockout
        await dbPool.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [newAttempts, lockTime, user.id]
        );
        logger.audit('AUTH_FAILED_LOCKED', { email: user.email, attempts: newAttempts });
        return res.status(423).json({
          success: false,
          message: 'This account has been temporarily locked due to consecutive failed login attempts. Please try again after 15 minutes.'
        });
      } else {
        await dbPool.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = NULL WHERE id = $2',
          [newAttempts, user.id]
        );
        logger.audit('AUTH_FAILED', { email: user.email, reason: 'Incorrect password', attempts: newAttempts });
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }
    }

    // Reset failed login attempts on successful login
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await dbPool.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [user.id]
      );
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

    logger.audit('AUTH_SUCCESS', { email: user.email }, safeUser);

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

/**
 * Request password recovery token.
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const emailClean = email.toLowerCase().trim();

    // Check if user exists
    const userRes = await dbPool.query('SELECT id, first_name FROM users WHERE email = $1', [emailClean]);

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];

      // Generate secure reset token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 1); // 1 hour token expiry

      // Save hashed token and expiry in DB
      await dbPool.query(
        'UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3',
        [hashedToken, expiry, user.id]
      );

      // Log simulated email
      const notifications = require('../utils/notifications');
      const body = `Hi ${user.first_name},\n\nWe received a request to reset your password. Use the following recovery token to set a new password:\n\nToken: ${rawToken}\n\nThis token will expire in 1 hour.\n\nBest regards,\nPINakee Security Team`;
      notifications.logEmail(emailClean, 'Password Recovery Reset Token', body);
      logger.info(`[SIMULATOR] Password recovery token generated for ${emailClean}: ${rawToken}`);
    }

    // Always return generic success message to prevent user enumeration
    return res.status(200).json({
      success: true,
      message: 'If this email address is registered, a password recovery link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to request password reset' });
  }
};

/**
 * Validate and set new password using recovery token.
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({ success: false, message: 'Token and new password are required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    // Query user by token and expiry
    const userRes = await dbPool.query(
      'SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_expires_at > CURRENT_TIMESTAMP',
      [hashedToken]
    );

    if (userRes.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.'
      });
    }

    const user = userRes.rows[0];

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);

    // Update password, clear failed attempts and locks
    await dbPool.query(
      'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, reset_token = NULL, reset_token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, user.id]
    );

    logger.audit('PASSWORD_RECOVERED', { email: user.email });

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully.'
    });
  } catch (error) {
    console.error('Reset password error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

/**
 * Retrieve simulated email log content (Dev only).
 * GET /api/auth/simulated-emails
 */
const getSimulatedEmails = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(__dirname, '../logs/email_simulator.log');
    if (!fs.existsSync(logPath)) {
      return res.status(200).json({ success: true, logs: '' });
    }
    const content = fs.readFileSync(logPath, 'utf8');
    return res.status(200).json({ success: true, logs: content });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  login,
  getMe,
  forgotPassword,
  resetPassword,
  getSimulatedEmails
};
