const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const logDirectory = path.join(__dirname, '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Log formatting definitions
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let output = `[${timestamp}] ${level}: ${message}`;
    if (stack) {
      output += `\nStack: ${stack}`;
    }
    if (Object.keys(meta).length > 0 && !meta.isAudit) {
      output += ` | Meta: ${JSON.stringify(meta)}`;
    } else if (meta.isAudit) {
      output += ` | AUDIT: [${meta.action}] ${JSON.stringify(meta.details)} by User:${meta.userEmail} (${meta.userRole})`;
    }
    return output;
  })
);

// Initialize winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: { service: 'pinakee-complaint-backend' },
  transports: [
    // Output to Console
    new winston.transports.Console({
      format: consoleFormat
    }),
    // Output to Rotated files (free, open-source, prevents disk depletion)
    new DailyRotateFile({
      filename: path.join(logDirectory, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d', // Keep 14 days of history
      level: 'info'
    })
  ]
});

/**
 * Helper to log security audit events in a structured JSON signature
 * @param {string} action - Audit action name (e.g., 'AUTH_FAILED', 'RATE_LIMIT_BLOCKED')
 * @param {Object} details - Action-specific attributes
 * @param {Object} [user] - Requester user context
 * @param {string} [ipAddress] - IP Address of request
 */
logger.audit = (action, details = {}, user = null, ipAddress = null) => {
  logger.info({
    message: `Security Audit: ${action}`,
    isAudit: true,
    action,
    details,
    userId: user?.id || 'anonymous',
    userRole: user?.role || 'anonymous',
    userEmail: user?.email || 'anonymous',
    timestamp: new Date().toISOString()
  });

  // Asynchronously insert row into PostgreSQL audit_logs table
  const dbPool = require('../config/db');
  if (dbPool) {
    const userIdVal = user && user.id && user.id !== 'anonymous' ? user.id : null;
    const description = `Security Audit: ${action}`;
    const cleanDetails = { ...details };
    // Security sanitization: strip sensitive items from details before DB insertion
    if (cleanDetails.password) delete cleanDetails.password;
    if (cleanDetails.new_password) delete cleanDetails.new_password;
    if (cleanDetails.token) delete cleanDetails.token;
    if (cleanDetails.password_hash) delete cleanDetails.password_hash;
    if (cleanDetails.reset_token) delete cleanDetails.reset_token;

    dbPool.query(
      'INSERT INTO audit_logs (user_id, action_type, description, ip_address, metadata_json) VALUES ($1, $2, $3, $4, $5)',
      [userIdVal, action, description, ipAddress || null, JSON.stringify(cleanDetails)]
    ).catch(err => {
      console.error('Failed to insert audit log record into database:', err.message);
    });
  }
};

module.exports = logger;
