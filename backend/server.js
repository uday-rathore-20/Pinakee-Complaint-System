const express = require('express');
const cors = require('cors');
require('dotenv').config();
const dbPool = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Root route (friendly greeting)
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the PINakee Complaint Management System API',
    endpoints: {
      healthCheck: '/api/health'
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
