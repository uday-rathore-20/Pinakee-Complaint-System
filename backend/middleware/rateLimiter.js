const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * 1. Auth Rate Limiter
 * Protects login and password endpoints against brute-force attacks (100 req / 15m)
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 100,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') return true;
    return false;
  },
  handler: (req, res, next, options) => {
    logger.audit('RATE_LIMIT_BLOCKED', {
      limiter: 'AUTH',
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    }, null, req.ip);
    res.status(options.statusCode).json(options.message);
  },
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 2. Global API Rate Limiter
 * Protects general API endpoints against volumetric denial-of-service and automated scraping (1000 req / 15m)
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 1000,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => {
    // Never rate limit health checks
    if (req.path === '/api/health' || req.path === '/health') return true;
    // Allow test suites to bypass if explicit header is passed in test env
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') return true;
    return false;
  },
  handler: (req, res, next, options) => {
    logger.audit('RATE_LIMIT_BLOCKED', {
      limiter: 'GLOBAL_API',
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    }, null, req.ip);
    res.status(options.statusCode).json(options.message);
  },
  message: {
    success: false,
    message: 'Too many requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 3. Attachment Upload Limiter
 * Protects file upload endpoints against rapid disk/bandwidth exhaustion (120 uploads / 15m)
 */
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX, 10) || 120,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') return true;
    return false;
  },
  handler: (req, res, next, options) => {
    logger.audit('RATE_LIMIT_BLOCKED', {
      limiter: 'UPLOAD',
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    }, null, req.ip);
    res.status(options.statusCode).json(options.message);
  },
  message: {
    success: false,
    message: 'Upload rate limit exceeded, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * 4. Complaint Mutation Limiter
 * Protects complaint creation and updates against spam submissions (150 req / 15m)
 */
const complaintMutationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.COMPLAINT_MUTATION_RATE_LIMIT_MAX, 10) || 150,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip,
  validate: { keyGeneratorIpFallback: false },
  skip: (req) => {
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') return true;
    return false;
  },
  handler: (req, res, next, options) => {
    logger.audit('RATE_LIMIT_BLOCKED', {
      limiter: 'COMPLAINT_MUTATION',
      ip: req.ip,
      url: req.originalUrl,
      method: req.method
    }, null, req.ip);
    res.status(options.statusCode).json(options.message);
  },
  message: {
    success: false,
    message: 'Too many complaint modification requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  complaintMutationRateLimiter
};
