const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dbPool = require('../config/db');
const logger = require('./logger');

const archiveDir = path.join(__dirname, '..', 'archives');

// Ensure archive directory exists automatically
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
}

let isRunning = false;

/**
 * Compresses data using zlib gzip.
 */
const compressData = (dataStr) => {
  return new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(dataStr, 'utf-8'), (err, buffer) => {
      if (err) reject(err);
      else resolve(buffer);
    });
  });
};

/**
 * Runs the archival and database pruning routine for a specific table.
 */
const archiveTable = async (tableName, userContext, ipAddress, client) => {
  // 1. Fetch records older than 90 days
  // Use a transaction-bound select with row-level locks
  const selectQuery = `
    SELECT *
    FROM ${tableName}
    WHERE created_at < NOW() - INTERVAL '90 days'
    ORDER BY id ASC
    FOR UPDATE
  `;
  const selectRes = await client.query(selectQuery);
  const records = selectRes.rows;

  if (records.length === 0) {
    return { count: 0, filename: null };
  }

  // 2. Generate filename based on date and time
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');

  const prefix = tableName === 'audit_logs' ? 'audit' : 'notifications';
  const filename = `archive-${prefix}-${yyyymmdd}-${hhmmss}.json.gz`;
  const filePath = path.join(archiveDir, filename);

  // 3. Serialize and compress the database rows
  const serialized = JSON.stringify(records, null, 2);
  const compressedBuffer = await compressData(serialized);

  // 4. Write compressed file to disk
  fs.writeFileSync(filePath, compressedBuffer);

  // Verify file creation and non-zero size before database deletion
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`Failed to write valid archive file on disk at: ${filePath}`);
  }

  // 5. Delete archived rows inside the transaction
  const maxId = records[records.length - 1].id;
  const deleteQuery = `
    DELETE FROM ${tableName}
    WHERE id <= $1
  `;
  await client.query(deleteQuery, [maxId]);

  // Log successful archival operation using the existing audit logging utility
  logger.audit('ARCHIVE_DAEMON_SUCCESS', {
    table: tableName,
    filename: filename,
    recordCount: records.length,
    maxPrunedId: maxId
  }, userContext, ipAddress);

  return { count: records.length, filename, filePath };
};

/**
 * Performs archival for both audit logs and in-app notifications.
 */
const runArchiver = async (userContext = null, ipAddress = null) => {
  if (isRunning) {
    logger.info('Archiving Daemon: Job already in progress. Skipping execution.');
    return { success: false, message: 'Archiving job already in progress' };
  }

  isRunning = true;
  logger.info('Archiving Daemon: Starting automated archival and log pruning check...');

  if (!dbPool) {
    isRunning = false;
    return { success: false, message: 'Database connection is unavailable' };
  }

  const client = await dbPool.connect();
  const createdFiles = [];

  try {
    await client.query('BEGIN');

    // Archive audit logs
    const auditRes = await archiveTable('audit_logs', userContext, ipAddress, client);
    if (auditRes.filename) {
      createdFiles.push(auditRes.filePath);
    }

    // Archive in-app notifications
    const notifRes = await archiveTable('in_app_notifications', userContext, ipAddress, client);
    if (notifRes.filename) {
      createdFiles.push(notifRes.filePath);
    }

    await client.query('COMMIT');
    client.release();

    logger.info(`Archiving Daemon: Finished run. Pruned ${auditRes.count} audit logs and ${notifRes.count} notifications.`);
    isRunning = false;

    return {
      success: true,
      auditPruned: auditRes.count,
      notificationsPruned: notifRes.count,
      filesGenerated: createdFiles.map(p => path.basename(p))
    };
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();

    // Cleanup generated files on transaction failure to maintain idempotency
    createdFiles.forEach(f => {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (unlinkErr) {
          console.error(`Failed to delete failed archive file ${f}:`, unlinkErr.message);
        }
      }
    });

    logger.audit('ARCHIVE_DAEMON_FAILURE', { error: error.message }, userContext, ipAddress);
    logger.error('Archiving Daemon failure:', { message: error.message, stack: error.stack });
    isRunning = false;

    throw error;
  }
};

/**
 * Scheduler checking once every 24 hours.
 */
const startArchiveScheduler = (intervalMs = 24 * 60 * 60 * 1000) => {
  logger.info(`Archiving Daemon scheduler initialized (Check interval: ${intervalMs}ms)`);

  // Run on startup
  runArchiver().catch(err => console.error('Archiving Daemon startup run failed:', err.message));

  const intervalId = setInterval(() => {
    runArchiver().catch(err => console.error('Archiving Daemon scheduled run failed:', err.message));
  }, intervalMs);

  return intervalId;
};

module.exports = {
  runArchiver,
  startArchiveScheduler
};
