const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'fallback_secret_key') {
      throw new Error('CRITICAL CONFIGURATION ERROR: Insecure or missing JWT_SECRET in production mode.');
    }
    return process.env.JWT_SECRET;
  }
  return process.env.JWT_SECRET || 'fallback_secret_key';
};

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate a JWT token for a user payload.
 * @param {Object} payload - User object payload (should contain user.id, user.email, etc.)
 * @returns {string} Signed JWT
 */
const generateToken = (payload) => {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * Verify a JWT token.
 * @param {string} token - Signed token
 * @returns {Object|null} Decoded payload or null if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (error) {
    return null;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  getJwtSecret,
};
