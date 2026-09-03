const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const requestContext = new AsyncLocalStorage();

// Validation regex: Alphanumeric characters, hyphens, and underscores, max 64 characters
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Correlation ID middleware.
 * Inspects X-Request-Id or X-Correlation-Id header, validates for safe formatting,
 * or generates a cryptographically secure UUID if missing, invalid, or oversized.
 * Sets X-Request-Id header on response and attaches requestId to request context.
 */
const correlationIdMiddleware = (req, res, next) => {
  const rawId = req.headers['x-request-id'] || req.headers['x-correlation-id'];

  let requestId;
  if (typeof rawId === 'string' && VALID_REQUEST_ID_REGEX.test(rawId.trim())) {
    requestId = rawId.trim();
  } else {
    requestId = crypto.randomUUID();
  }

  req.requestId = requestId;
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
};

module.exports = correlationIdMiddleware;
module.exports.requestContext = requestContext;

