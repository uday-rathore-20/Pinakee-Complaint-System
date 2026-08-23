const { verifyToken } = require('../utils/jwt');
const dbPool = require('../config/db');

/**
 * Middleware to authenticate requests via JWT.
 * Expects header: "Authorization: Bearer <token>"
 */
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access token is missing or invalid'
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Access token is invalid or expired'
    });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({
        success: false,
        message: 'Database connection is unavailable'
      });
    }

    // Fetch full, fresh user details from database
    const query = `
      SELECT u.id, u.first_name, u.last_name, u.email, u.is_active, 
             r.name AS role, d.name AS department
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = $1
    `;
    const result = await dbPool.query(query, [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User associated with token does not exist'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated'
      });
    }

    // Attach user profile information to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to authorize requests by user roles.
 * @param {...string} allowedRoles - Array of roles allowed to access the route
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient privileges'
      });
    }

    next();
  };
};

module.exports = {
  authenticateJWT,
  requireRole,
};
