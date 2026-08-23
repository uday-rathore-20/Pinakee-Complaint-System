const express = require('express');
const cors = require('cors');
require('dotenv').config();
const dbPool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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
