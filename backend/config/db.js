const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let pool = null;

if (!connectionString) {
  console.warn('Warning: DATABASE_URL environment variable is not defined. PostgreSQL connection pool is uninitialized.');
} else {
  pool = new Pool({
    connectionString,
    // Support SSL configuration for secure remote databases if needed in production, but respect disable flags
    ssl: (process.env.NODE_ENV === 'production' && process.env.PGSSLMODE !== 'disable')
      ? { rejectUnauthorized: false }
      : false
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client pool:', err);
  });
}

module.exports = pool;
