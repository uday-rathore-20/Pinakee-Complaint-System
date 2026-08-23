const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const dbPool = require('./config/db');
const { sanitizePayloadMiddleware } = require('./utils/sanitize');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Helmet for secure HTTP response headers
app.use(helmet());

// Configure CORS to restrict allowed origins from .env (whitelisting)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173']; // default Vite port

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests) in development,
    // but restrict in staging/production.
    const isDevelopment = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';
    if (!origin && isDevelopment) {
      return callback(null, true);
    }
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Express request parser
app.use(express.json());

// Global input HTML/XSS sanitization firewall
app.use(sanitizePayloadMiddleware);

// Auth Rate Limiting to prevent login brute-forcing (max 100 requests per 15 minutes)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiter specifically to auth endpoints
app.use('/api/auth', loginRateLimiter);

// Routes
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const lookupsRoutes = require('./routes/lookups.routes');
const complaintsRoutes = require('./routes/complaints.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const attachmentsRoutes = require('./routes/attachments.routes');

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', lookupsRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', attachmentsRoutes);

// Root route (friendly greeting)
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the PINakee Complaint Management System API',
    endpoints: {
      healthCheck: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      lookups: '/api/{categories|departments|statuses|priorities}',
      complaints: '/api/complaints',
      dashboard: '/api/dashboard/{stats|activity}',
      attachments: '/api/{complaints/:id/attachments|attachments/:id}'
    }
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

// Centralized Error Handling Middleware (hides stack traces in production)
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message);
  
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(err.status || 500).json({
    success: false,
    message: isProduction ? 'Internal Server Error' : err.message,
    ...(isProduction ? {} : { stack: err.stack })
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (dbPool) {
      dbPool.end(() => {
        console.log('Database pool has ended');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    if (dbPool) {
      dbPool.end(() => {
        console.log('Database pool has ended');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});
