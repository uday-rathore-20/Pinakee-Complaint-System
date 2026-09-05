/**
 * Database Migration Runner
 * PINakee Complaint Management System
 *
 * Implements:
 * - Standalone pg.Client execution
 * - Session-level advisory concurrency locking
 * - Atomic schema_migrations tracking
 * - Conservative baseline safety check (prevents destructive schema.sql re-runs)
 * - Deterministic numeric migration discovery & execution
 * - Per-migration transactional boundaries (BEGIN ... COMMIT / ROLLBACK)
 * - Signal safety (SIGINT / SIGTERM)
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// 1. Load Environment Configuration
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.trim()) {
  console.error('CRITICAL ERROR: DATABASE_URL environment variable is missing or empty.');
  process.exit(1);
}

// 2. SSL Configuration matching project standards
const isProduction = process.env.NODE_ENV === 'production';
const sslConfig = (isProduction && process.env.PGSSLMODE !== 'disable')
  ? { rejectUnauthorized: false }
  : false;

// 3. Mandatory Core Baseline Tables to verify baseline state
const CORE_BASELINE_TABLES = [
  'roles',
  'departments',
  'users',
  'complaint_statuses',
  'complaint_priorities',
  'complaint_categories',
  'complaints',
  'complaint_comments',
  'complaint_status_history'
];

const ADVISORY_LOCK_ID = 987654321;
const DATABASE_DIR = path.join(__dirname, '..', 'database');
const SCHEMA_SQL_PATH = path.join(DATABASE_DIR, 'schema.sql');

let client = null;
let lockAcquired = false;

// Graceful signal handling
function setupSignalHandlers() {
  const handleSignal = async (signal) => {
    console.warn(`\nReceived ${signal}. Cleaning up and aborting migration process...`);
    await cleanup();
    process.exit(1);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

async function cleanup() {
  if (client) {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock($1);', [ADVISORY_LOCK_ID]);
        lockAcquired = false;
      } catch (err) {
        // Silently ignore unlock errors during abrupt disconnect
      }
    }
    try {
      await client.end();
    } catch (err) {
      // Ignore disconnect errors
    }
    client = null;
  }
}

// 4. Discovery and Validation of Migration Files
function discoverMigrationFiles() {
  if (!fs.existsSync(DATABASE_DIR)) {
    throw new Error(`Database directory not found: ${DATABASE_DIR}`);
  }

  const allFiles = fs.readdirSync(DATABASE_DIR);
  const migrationFiles = allFiles.filter(f => /^migration_.*\.sql$/i.test(f));

  const parsed = [];
  const seenVersions = new Map();

  for (const filename of migrationFiles) {
    const match = filename.match(/^migration_(\d+)(?:_(.*))?\.sql$/i);
    if (!match) {
      throw new Error(`Malformed migration filename "${filename}". Expected format: migration_<number>_<description>.sql`);
    }

    const numStr = match[1];
    const num = parseInt(numStr, 10);
    const desc = match[2] || '';
    const versionId = `${numStr}_${desc}`.replace(/_+$/, '');

    if (seenVersions.has(num)) {
      throw new Error(`Duplicate migration numeric version detected: ${num} in "${filename}" and "${seenVersions.get(num)}"`);
    }

    seenVersions.set(num, filename);
    parsed.push({
      filename,
      versionNumber: num,
      versionId,
      fullPath: path.join(DATABASE_DIR, filename)
    });
  }

  // Sort numerically
  parsed.sort((a, b) => a.versionNumber - b.versionNumber);
  return parsed;
}

// 5. Main Runner Execution
async function runMigrations() {
  setupSignalHandlers();

  console.log('=== PINakee Database Migration Runner ===');

  // Discover and validate migrations first
  const discoveredMigrations = discoverMigrationFiles();
  console.log(`Discovered ${discoveredMigrations.length} migration file(s) in database directory.`);

  // Connect to database
  client = new Client({
    connectionString: DATABASE_URL,
    ssl: sslConfig
  });

  try {
    await client.connect();
    console.log('Connected to database successfully.');
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    await cleanup();
    process.exit(1);
  }

  // Acquire session-level advisory lock
  try {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked;', [ADVISORY_LOCK_ID]);
    const acquired = lockRes.rows && lockRes.rows[0] && lockRes.rows[0].locked;
    if (!acquired) {
      console.error(`Could not acquire PostgreSQL advisory lock (${ADVISORY_LOCK_ID}). Another migration runner is currently active.`);
      await cleanup();
      process.exit(1);
    }
    lockAcquired = true;
    console.log(`Acquired advisory lock (${ADVISORY_LOCK_ID}).`);
  } catch (err) {
    console.error('Error attempting to acquire advisory lock:', err.message);
    await cleanup();
    process.exit(1);
  }

  try {
    // 6. Ensure schema_migrations ledger exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        execution_time_ms INT NOT NULL
      );
    `);

    // Fetch already applied migrations
    const appliedRes = await client.query('SELECT version FROM schema_migrations;');
    const appliedVersions = new Set(appliedRes.rows.map(r => r.version));

    // 7. Core Baseline Assessment
    const tableCheckRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1);
    `, [CORE_BASELINE_TABLES]);

    const existingCoreTables = new Set(tableCheckRes.rows.map(r => r.table_name));
    const allCoreExist = CORE_BASELINE_TABLES.every(t => existingCoreTables.has(t));
    const noneCoreExist = CORE_BASELINE_TABLES.every(t => !existingCoreTables.has(t));
    const isBaselineRecorded = appliedVersions.has('001_baseline');

    if (allCoreExist) {
      if (!isBaselineRecorded) {
        console.log('Detected existing fully initialized baseline database. Recording 001_baseline in ledger without re-running schema.sql.');
        await client.query(`
          INSERT INTO schema_migrations (version, execution_time_ms)
          VALUES ('001_baseline', 0)
          ON CONFLICT (version) DO NOTHING;
        `);
        appliedVersions.add('001_baseline');
      } else {
        console.log('✓ Baseline (001_baseline) is already applied.');
      }
    } else if (noneCoreExist) {
      if (isBaselineRecorded) {
        console.error('ERROR: 001_baseline is recorded in schema_migrations, but core tables are missing from the public schema.');
        await cleanup();
        process.exit(1);
      }

      console.log('Database is completely empty. Bootstrapping baseline from schema.sql...');
      if (!fs.existsSync(SCHEMA_SQL_PATH)) {
        throw new Error(`Baseline schema file not found: ${SCHEMA_SQL_PATH}`);
      }

      const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
      const startTime = Date.now();

      await client.query('BEGIN');
      try {
        await client.query(schemaSql);
        const duration = Date.now() - startTime;
        await client.query(`
          INSERT INTO schema_migrations (version, execution_time_ms)
          VALUES ($1, $2);
        `, ['001_baseline', duration]);
        await client.query('COMMIT');
        console.log(`✓ Applied 001_baseline (${duration}ms)`);
        appliedVersions.add('001_baseline');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to execute baseline schema.sql: ${err.message}`);
      }
    } else {
      // Partial / Inconsistent baseline state
      const missing = CORE_BASELINE_TABLES.filter(t => !existingCoreTables.has(t));
      const present = CORE_BASELINE_TABLES.filter(t => existingCoreTables.has(t));
      console.error('CRITICAL ABORT: Database is in a partial / inconsistent baseline state.');
      console.error(`- Present core tables: ${present.join(', ')}`);
      console.error(`- Missing core tables: ${missing.join(', ')}`);
      console.error('schema.sql will NOT be executed to prevent data corruption. Resolve manually.');
      await cleanup();
      process.exit(1);
    }

    // 8. Execute Pending Migrations
    let pendingCount = 0;
    for (const migration of discoveredMigrations) {
      if (appliedVersions.has(migration.versionId)) {
        console.log(`✓ Already applied: ${migration.versionId}`);
        continue;
      }

      pendingCount++;
      console.log(`Applying migration: ${migration.filename} (${migration.versionId})...`);

      const sqlContent = fs.readFileSync(migration.fullPath, 'utf8');
      const startTime = Date.now();

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        const duration = Date.now() - startTime;

        await client.query(`
          INSERT INTO schema_migrations (version, execution_time_ms)
          VALUES ($1, $2);
        `, [migration.versionId, duration]);

        await client.query('COMMIT');
        appliedVersions.add(migration.versionId);
        console.log(`✓ Applied ${migration.versionId} (${duration}ms)`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${migration.filename} failed: ${err.message}`);
      }
    }

    if (pendingCount === 0) {
      console.log('Database schema is up to date. Zero pending migrations.');
    } else {
      console.log(`Successfully applied ${pendingCount} pending migration(s).`);
    }

    // Release advisory lock and disconnect cleanly
    await cleanup();
    console.log('Migration execution completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('MIGRATION RUNNER ERROR:', err.message);
    await cleanup();
    process.exit(1);
  }
}

runMigrations();
