/**
 * Environment Pre-Flight Diagnostics Script (Doctor)
 */
const { Client } = require('pg');
require('dotenv').config();

async function runDiagnostics() {
  console.log('======================================================');
  console.log('--- Running PINakee Backend Pre-Flight Diagnostics ---');
  console.log('======================================================\n');

  const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];
  const missingEnv = [];

  for (const envVar of requiredEnv) {
    if (!process.env[envVar] || process.env[envVar].trim() === '') {
      missingEnv.push(envVar);
    }
  }

  if (missingEnv.length > 0) {
    console.error('❌ Diagnostic FAILED: Missing Required Environment Variables:');
    for (const missing of missingEnv) {
      console.error(`  - ${missing}`);
    }
    console.log('\nTroubleshooting Info:');
    console.log('Please copy backend/.env.example to backend/.env and configure values.');
    process.exit(1);
  }

  console.log('✓ Required Environment Variables: OK');

  // Verify PostgreSQL Connection Viability
  const connectionString = process.env.DATABASE_URL;
  console.log('Testing PostgreSQL database connection viability...');

  const sslMode = (process.env.NODE_ENV === 'production' && process.env.PGSSLMODE !== 'disable')
    ? { rejectUnauthorized: false }
    : false;

  const client = new Client({
    connectionString,
    ssl: sslMode
  });

  try {
    await client.connect();
    const result = await client.query('SELECT 1');
    if (result.rows.length > 0) {
      console.log('✓ Database connection: OK');
    }
    await client.end();
  } catch (err) {
    console.error('❌ Diagnostic FAILED: Database connection failed:');
    console.error(`  Error message: ${err.message}`);
    console.log('\nTroubleshooting Info:');
    console.log('1. Verify your PostgreSQL service is running.');
    console.log('2. Verify the DATABASE_URL credentials and port match your Postgres setup.');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('✓ Pre-Flight Diagnostics: PASSED');
  console.log('======================================================\n');
  process.exit(0);
}

runDiagnostics();
