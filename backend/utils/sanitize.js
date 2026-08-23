/**
 * Sanitization and XSS Prevention Utilities
 */

/**
 * Escapes HTML characters in a string to prevent XSS.
 * @param {string} str - Raw input string
 * @returns {string} Sanitized/escaped string
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Recursively sanitizes a value (object, array, string).
 * @param {*} val - Value to sanitize
 * @returns {*} Sanitized value
 */
const sanitizeValue = (val) => {
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    return sanitizeString(val);
  }

  if (Array.isArray(val)) {
    return val.map(item => sanitizeValue(item));
  }

  if (typeof val === 'object') {
    const sanitizedObj = {};
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        sanitizedObj[key] = sanitizeValue(val[key]);
      }
    }
    return sanitizedObj;
  }

  return val;
};

/**
 * Express middleware to sanitize req.body, req.query, and req.params automatically.
 */
const sanitizePayloadMiddleware = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = {
  sanitizeString,
  sanitizeValue,
  sanitizePayloadMiddleware
};
