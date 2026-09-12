const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

// Production Environment Hardening Validation
const { validateProductionEnv } = require('./utils/envValidator');
validateProductionEnv();

const dbPool = require('./config/db');
const { sanitizePayloadMiddleware } = require('./utils/sanitize');
const logger = require('./utils/logger');
const httpLogger = require('./middleware/auditLogger');
const correlationIdMiddleware = require('./middleware/correlationId');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Mount Request Correlation ID tracking middleware first
app.use(correlationIdMiddleware);

// Enable Helmet for secure HTTP response headers
app.use(helmet());

// Enable HTTP request logging via Morgan routed to Winston
app.use(httpLogger);

// Configure CORS to restrict allowed origins from .env (whitelisting)
const defaultAllowedOrigins = isProduction ? [] : [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000'
];

const envAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...envAllowedOrigins]));

const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.audit('CORS_BLOCKED', { origin: origin || 'none', allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Express request parser
app.use(express.json());

// Global input HTML/XSS sanitization firewall
app.use(sanitizePayloadMiddleware);

// Tiered Application & Auth Rate Limiters
const { apiRateLimiter, loginRateLimiter } = require('./middleware/rateLimiter');

// 1. Apply global rate limiting across all /api endpoints
app.use('/api', apiRateLimiter);

// 2. Apply specialized strict rate limiter to authentication endpoints
app.use('/api/auth', loginRateLimiter);

// Routes
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const customersRoutes = require('./routes/customers.routes');
const engineersRoutes = require('./routes/engineers.routes');
const lookupsRoutes = require('./routes/lookups.routes');
const complaintsRoutes = require('./routes/complaints.routes');
const fcrRoutes = require('./routes/fcr.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const attachmentsRoutes = require('./routes/attachments.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const reportsRoutes = require('./routes/reports.routes');
const auditLogsRoutes = require('./routes/auditLogs.routes');
const settingsRoutes = require('./routes/settings.routes');

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/engineers', engineersRoutes);
app.use('/api', lookupsRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/complaints', fcrRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', attachmentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/audit-trails', auditLogsRoutes);
app.use('/api/audit-trail', auditLogsRoutes);
app.use('/api/settings', settingsRoutes);

if (process.env.NODE_ENV === 'test') {
  app.post('/api/test/run-sla', async (req, res) => {
    try {
      const { checkSlaBreaches } = require('./utils/slaScheduler');
      await checkSlaBreaches();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// Root route (API discovery and service status)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PINakee Complaint Management System API',
    healthCheck: '/api/health',
    version: '1.0.0'
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'unconfigured';

  if (dbPool) {
    try {
      // Test the db connection viability
      const client = await dbPool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = `disconnected (${err.message})`;
    }
  }

  res.status(200).json({
    status: 'ok',
    message: 'Backend server is running successfully',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Fallback for unmapped API endpoints (returns structured JSON 404)
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Fallback for non-API unmapped routes (returns structured JSON 404)
app.all('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Centralized Error Handling Middleware (hides stack traces in production)
app.use((err, req, res, next) => {
  const requestId = req.requestId || req.id || 'unknown';
  logger.error('Unhandled Error:', { requestId, message: err.message, stack: err.stack });

  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(err.status || 500).json({
    success: false,
    message: isProduction ? 'Internal Server Error' : err.message,
    requestId,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Start Server
const server = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);

  // Start background SLA breach monitoring scheduler (checks every 60s)
  const { startSlaScheduler } = require('./utils/slaScheduler');
  startSlaScheduler(60000);

  // Start background log archiving daemon scheduler (checks every 24h)
  const { startArchiveScheduler } = require('./utils/archiveDaemon');
  startArchiveScheduler(24 * 60 * 60 * 1000);

  // Start background email outbox worker (checks every 15s)
  const emailWorker = require('./utils/emailWorker');
  emailWorker.start(15000);
});

// Initialize Socket.IO engine
const { initSocket } = require('./utils/socket');
initSocket(server);

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  const emailWorker = require('./utils/emailWorker');
  emailWorker.stop();

  server.close(() => {
    logger.info('HTTP server closed');
    if (dbPool) {
      dbPool.end(() => {
        logger.info('Database pool has ended');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  const emailWorker = require('./utils/emailWorker');
  emailWorker.stop();

  server.close(() => {
    logger.info('HTTP server closed');
    if (dbPool) {
      dbPool.end(() => {
        logger.info('Database pool has ended');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});
