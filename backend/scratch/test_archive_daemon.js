const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { Pool } = require('pg');
require('dotenv').config({ path: 'd:/Pinakee-Complaint-System/backend/.env' });
const bcrypt = require('bcryptjs');

// Spawn the backend server on test port 5098
const serverProcess = spawn('node', ['server.js'], {
  cwd: 'd:/Pinakee-Complaint-System/backend',
  env: {
    ...process.env,
    PORT: '5098',
    NODE_ENV: 'test'
  }
});

serverProcess.stdout.on('data', (data) => {
  // Console log server logs optionally
});

serverProcess.stderr.on('data', (data) => {
  // Console log errors
});

// Helper to decompress gzip buffer
const decompressGzip = (buffer) => {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buffer, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded.toString('utf-8'));
    });
  });
};

const archiveDir = path.join(__dirname, '..', 'archives');

setTimeout(async () => {
  let dbPool = null;
  let adminToken = null;
  let customerToken = null;
  let agentToken = null;

  let customerId = null;
  let agentId = null;

  try {
    console.log('\n======================================================');
    console.log('--- Starting Archiving Daemon & Log Pruning Tests ---');
    console.log('======================================================\n');
    const baseUrl = 'http://localhost:5098';

    // 1. Connect to database
    console.log('1. Connecting to database...');
    dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    console.log('Connected.');

    // Cleanup previous records
    console.log('Cleaning up previous test records...');
    await dbPool.query("DELETE FROM audit_logs WHERE description LIKE 'TEST_ARCHIVE_%'");
    await dbPool.query("DELETE FROM in_app_notifications WHERE title LIKE 'TEST_ARCHIVE_%'");
    await dbPool.query("DELETE FROM users WHERE email IN ('arch_admin@test.com', 'arch_cust@test.com', 'arch_agent@test.com')");

    // Clear archives folder files created by previous runs
    if (fs.existsSync(archiveDir)) {
      const files = fs.readdirSync(archiveDir);
      files.forEach(f => {
        if (f.startsWith('archive-')) {
          fs.unlinkSync(path.join(archiveDir, f));
        }
      });
    }

    // 2. Setup test users
    console.log('2. Creating test user profiles...');
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash('password123', salt);

    const adminRes = await dbPool.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active) VALUES ('Arch', 'Admin', 'arch_admin@test.com', $1, 1, true) RETURNING id",
      [passHash]
    );

    const custRes = await dbPool.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active) VALUES ('Arch', 'Cust', 'arch_cust@test.com', $1, 4, true) RETURNING id",
      [passHash]
    );
    customerId = custRes.rows[0].id;

    const agentRes = await dbPool.query(
      "INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active) VALUES ('Arch', 'Agent', 'arch_agent@test.com', $1, 3, true) RETURNING id",
      [passHash]
    );
    agentId = agentRes.rows[0].id;

    // 3. Authenticate and get JWTs
    console.log('3. Authenticating users...');
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arch_admin@test.com', password: 'password123' })
    });
    adminToken = (await adminLogin.json()).data.token;

    const custLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arch_cust@test.com', password: 'password123' })
    });
    customerToken = (await custLogin.json()).data.token;

    const agentLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'arch_agent@test.com', password: 'password123' })
    });
    agentToken = (await agentLogin.json()).data.token;

    // ==========================================
    // TEST 1: AUTHORIZATION PROTECTION
    // ==========================================
    console.log('\n- Test 1: Verifying role-based access restrictions...');

    // Customer list attempt -> 403
    const custListRes = await fetch(`${baseUrl}/api/settings/archives`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    if (custListRes.status !== 403) {
      throw new Error(`Customer was allowed to list archives! Status: ${custListRes.status}`);
    }

    // Agent list attempt -> 403
    const agentListRes = await fetch(`${baseUrl}/api/settings/archives`, {
      headers: { 'Authorization': `Bearer ${agentToken}` }
    });
    if (agentListRes.status !== 403) {
      throw new Error(`Agent was allowed to list archives! Status: ${agentListRes.status}`);
    }

    // Customer download attempt -> 403
    const custDownRes = await fetch(`${baseUrl}/api/settings/archives/archive-audit-20260101-000000.json.gz`, {
      headers: { 'Authorization': `Bearer ${customerToken}` }
    });
    if (custDownRes.status !== 403) {
      throw new Error(`Customer was allowed to download archives! Status: ${custDownRes.status}`);
    }

    // Admin list attempt -> 200 (Success)
    const adminListRes = await fetch(`${baseUrl}/api/settings/archives`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (adminListRes.status !== 200) {
      throw new Error(`Admin was blocked from listing archives! Status: ${adminListRes.status}`);
    }
    const adminListData = await adminListRes.json();
    if (!adminListData.success || !Array.isArray(adminListData.data)) {
      throw new Error('Admin list response structure was invalid');
    }
    console.log('   [SUCCESS] Role-based authentication rules verified.');

    // ==========================================
    // TEST 2: PRUNING ACCURACY
    // ==========================================
    console.log('\n- Test 2: Testing database logs pruning timeframe accuracy...');

    // Seed records older than 90 days (using a fixed PAST timestamp)
    console.log('   Seeding logs older than 90 days...');
    const oldAuditCount = 3;
    for (let i = 0; i < oldAuditCount; i++) {
      await dbPool.query(`
        INSERT INTO audit_logs (user_id, action_type, description, created_at)
        VALUES ($1, 'TEST_ARCHIVE_OLD', 'TEST_ARCHIVE_Old audit record ' || $2, NOW() - INTERVAL '100 days')
      `, [customerId, i]);
      await dbPool.query(`
        INSERT INTO in_app_notifications (user_id, type, title, message, created_at)
        VALUES ($1, 'TEST_ARCHIVE_OLD', 'TEST_ARCHIVE_Old notif title', 'TEST_ARCHIVE_Old notif message ' || $2, NOW() - INTERVAL '100 days')
      `, [customerId, i]);
    }

    // Seed records newer than 90 days
    console.log('   Seeding logs newer than 90 days...');
    const newAuditCount = 2;
    for (let i = 0; i < newAuditCount; i++) {
      await dbPool.query(`
        INSERT INTO audit_logs (user_id, action_type, description, created_at)
        VALUES ($1, 'TEST_ARCHIVE_NEW', 'TEST_ARCHIVE_New audit record ' || $2, NOW() - INTERVAL '10 days')
      `, [customerId, i]);
      await dbPool.query(`
        INSERT INTO in_app_notifications (user_id, type, title, message, created_at)
        VALUES ($1, 'TEST_ARCHIVE_NEW', 'TEST_ARCHIVE_New notif title', 'TEST_ARCHIVE_New notif message ' || $2, NOW() - INTERVAL '10 days')
      `, [customerId, i]);
    }

    // Execute the archiver directly within the test process to verify local actions
    console.log('   Executing archiving daemon run...');
    const { runArchiver } = require('../utils/archiveDaemon');
    const archiveResult = await runArchiver({ id: adminRes.rows[0].id, role: 'ADMIN', email: 'arch_admin@test.com' }, '127.0.0.1');

    if (!archiveResult.success) {
      throw new Error(`Archiver returned failed status: ${archiveResult.message}`);
    }

    console.log(`   Archiver reported pruned: ${archiveResult.auditPruned} audits, ${archiveResult.notificationsPruned} notifications.`);

    if (archiveResult.auditPruned !== oldAuditCount) {
      throw new Error(`Expected ${oldAuditCount} audits pruned, got ${archiveResult.auditPruned}`);
    }
    if (archiveResult.notificationsPruned !== oldAuditCount) {
      throw new Error(`Expected ${oldAuditCount} notifications pruned, got ${archiveResult.notificationsPruned}`);
    }

    // Check database to ensure correct rows were deleted/preserved
    const checkDbAuditOld = await dbPool.query("SELECT COUNT(*) FROM audit_logs WHERE action_type = 'TEST_ARCHIVE_OLD'");
    const checkDbAuditNew = await dbPool.query("SELECT COUNT(*) FROM audit_logs WHERE action_type = 'TEST_ARCHIVE_NEW'");
    const checkDbNotifOld = await dbPool.query("SELECT COUNT(*) FROM in_app_notifications WHERE type = 'TEST_ARCHIVE_OLD'");
    const checkDbNotifNew = await dbPool.query("SELECT COUNT(*) FROM in_app_notifications WHERE type = 'TEST_ARCHIVE_NEW'");

    if (parseInt(checkDbAuditOld.rows[0].count) !== 0) {
      throw new Error(`Database failed to delete old audit logs! Remaining: ${checkDbAuditOld.rows[0].count}`);
    }
    if (parseInt(checkDbNotifOld.rows[0].count) !== 0) {
      throw new Error(`Database failed to delete old notifications! Remaining: ${checkDbNotifOld.rows[0].count}`);
    }
    if (parseInt(checkDbAuditNew.rows[0].count) !== newAuditCount) {
      throw new Error(`Database deleted newer audit logs! Remaining: ${checkDbAuditNew.rows[0].count}, expected ${newAuditCount}`);
    }
    if (parseInt(checkDbNotifNew.rows[0].count) !== newAuditCount) {
      throw new Error(`Database deleted newer notifications! Remaining: ${checkDbNotifNew.rows[0].count}, expected ${newAuditCount}`);
    }

    console.log('   [SUCCESS] Timeframe pruning accuracy verified. Old records pruned, new records preserved.');

    // ==========================================
    // TEST 3: DATA INTEGRITY CHECK
    // ==========================================
    console.log('\n- Test 3: Verifying data integrity of the generated GZIP archives...');

    if (archiveResult.filesGenerated.length !== 2) {
      throw new Error(`Expected 2 files generated, got ${archiveResult.filesGenerated.length}`);
    }

    const auditFile = archiveResult.filesGenerated.find(f => f.includes('archive-audit'));
    const notifFile = archiveResult.filesGenerated.find(f => f.includes('archive-notifications'));

    if (!auditFile || !notifFile) {
      throw new Error('Generated file prefixes were incorrect');
    }

    // Read audit file content
    const compressedAudit = fs.readFileSync(path.join(archiveDir, auditFile));
    const decompressedAuditStr = await decompressGzip(compressedAudit);
    const parsedAudits = JSON.parse(decompressedAuditStr);

    if (parsedAudits.length !== oldAuditCount) {
      throw new Error(`Archive contains ${parsedAudits.length} logs, expected ${oldAuditCount}`);
    }
    if (!parsedAudits.every(log => log.action_type === 'TEST_ARCHIVE_OLD')) {
      throw new Error('Archive data content is corrupt or contains newer/mismatched logs');
    }

    // Check sizes match settings API listing values
    const freshListRes = await fetch(`${baseUrl}/api/settings/archives`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const freshListData = await freshListRes.json();
    const listedAudit = freshListData.data.find(f => f.filename === auditFile);
    if (!listedAudit || listedAudit.size !== fs.statSync(path.join(archiveDir, auditFile)).size) {
      throw new Error('Settings archives list returned missing or incorrect file size details');
    }

    console.log('   [SUCCESS] GZIP deserialization and field-level content integrity verified.');

    // ==========================================
    // TEST 4: PATH TRAVERSAL BLOCKING
    // ==========================================
    console.log('\n- Test 4: Testing path traversal prevention on archive downloads...');

    const maliciousPaths = [
      '../server.js',
      '..\\server.js',
      '../../.env',
      '..%2F..%2F.env',
      '/etc/passwd',
      'C:\\Windows\\System32\\cmd.exe',
      'package.json'
    ];

    for (const badPath of maliciousPaths) {
      const traversalRes = await fetch(`${baseUrl}/api/settings/archives/${encodeURIComponent(badPath)}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (traversalRes.status !== 400 && traversalRes.status !== 403 && traversalRes.status !== 404) {
        throw new Error(`Path traversal bypassed! Filename "${badPath}" returned status: ${traversalRes.status}`);
      }
    }
    console.log('   [SUCCESS] Path traversal payloads successfully blocked with appropriate status codes.');

    // ==========================================
    // TEST 5: EMPTY ARCHIVE BEHAVIOR
    // ==========================================
    console.log('\n- Test 5: Testing empty dataset archival run...');

    // There are no records older than 90 days now
    const emptyResult = await runArchiver({ id: adminRes.rows[0].id, role: 'ADMIN', email: 'arch_admin@test.com' }, '127.0.0.1');
    if (!emptyResult.success) {
      throw new Error('Archiving failed on empty database dataset');
    }
    if (emptyResult.auditPruned !== 0 || emptyResult.notificationsPruned !== 0 || emptyResult.filesGenerated.length !== 0) {
      throw new Error(`Empty run generated unnecessary archives or incorrectly reported pruned counts. Files: ${emptyResult.filesGenerated.length}`);
    }
    console.log('   [SUCCESS] Empty run completed cleanly without creating blank files.');

    // ==========================================
    // TEST 6: FAILURE SAFETY (ROLLBACK ON WRITE FAILS)
    // ==========================================
    console.log('\n- Test 6: Testing transaction rollback on file write failure...');

    // Seed another record older than 90 days
    await dbPool.query(`
      INSERT INTO audit_logs (user_id, action_type, description, created_at)
      VALUES ($1, 'TEST_ARCHIVE_OLD', 'TEST_ARCHIVE_Rollback verify record', NOW() - INTERVAL '100 days')
    `, [customerId]);

    // Stub/mock writeFileSync to throw error during the next execution
    const originalWriteFileSync = fs.writeFileSync;
    fs.writeFileSync = (filePath) => {
      throw new Error('SIMULATED_DISK_WRITE_FAILURE');
    };
    const storage = require('../utils/storage');
    const originalSaveArchiveFile = storage.saveArchiveFile;
    storage.saveArchiveFile = async () => {
      throw new Error('SIMULATED_DISK_WRITE_FAILURE');
    };

    try {
      await runArchiver({ id: adminRes.rows[0].id, role: 'ADMIN', email: 'arch_admin@test.com' }, '127.0.0.1');
      throw new Error('Archiver completed successfully even though writeFileSync threw an error!');
    } catch (err) {
      if (err.message !== 'SIMULATED_DISK_WRITE_FAILURE') {
        throw err;
      }
      console.log('   Caught simulated write error. Checking database rollback status...');
    } finally {
      // Restore stub
      fs.writeFileSync = originalWriteFileSync;
      storage.saveArchiveFile = originalSaveArchiveFile;
    }

    // Verify database row still exists (meaning transaction rolled back cleanly)
    const checkDbRollback = await dbPool.query("SELECT COUNT(*) FROM audit_logs WHERE description = 'TEST_ARCHIVE_Rollback verify record'");
    if (parseInt(checkDbRollback.rows[0].count) !== 1) {
      throw new Error('Transaction committed and pruned records even though writing to disk failed!');
    }
    console.log('   [SUCCESS] Failure safety verified. Transaction rolled back, records remain intact in DB.');

    // ==========================================
    // TEST 7: IDEMPOTENCY / RETRY SAFETY
    // ==========================================
    console.log('\n- Test 7: Testing idempotency and retry safety...');

    // Execute successful run to archive the seeded record from Test 6
    const retryResult = await runArchiver({ id: adminRes.rows[0].id, role: 'ADMIN', email: 'arch_admin@test.com' }, '127.0.0.1');
    if (!retryResult.success || retryResult.auditPruned !== 1) {
      throw new Error(`Retry run failed to archive the record from Test 6. Pruned: ${retryResult.auditPruned}`);
    }

    // Immediate second execution
    const secondResult = await runArchiver({ id: adminRes.rows[0].id, role: 'ADMIN', email: 'arch_admin@test.com' }, '127.0.0.1');
    if (secondResult.auditPruned !== 0) {
      throw new Error(`Second execution duplicated pruning! Pruned: ${secondResult.auditPruned}`);
    }
    console.log('   [SUCCESS] Idempotency and safe retries verified.');

    console.log('\n------------------------------------------------------');
    console.log('All Archiving Daemon & Log Pruning tests PASSED.');
    console.log('------------------------------------------------------\n');

  } catch (error) {
    console.error('\n--- ARCHIVING DAEMON TEST RUNNER FAILED ---');
    console.error(error);
    process.exitCode = 1;
  } finally {
    console.log('Cleaning up database settings test records...');
    if (dbPool) {
      try {
        await dbPool.query("DELETE FROM audit_logs WHERE description LIKE 'TEST_ARCHIVE_%'");
        await dbPool.query("DELETE FROM in_app_notifications WHERE title LIKE 'TEST_ARCHIVE_%'");
        await dbPool.query("DELETE FROM users WHERE email IN ('arch_admin@test.com', 'arch_cust@test.com', 'arch_agent@test.com')");
      } catch (err) {
        console.error('Database cleanup failed:', err.message);
      } finally {
        await dbPool.end();
      }
    }

    // Cleanup files generated during tests
    if (fs.existsSync(archiveDir)) {
      try {
        const files = fs.readdirSync(archiveDir);
        files.forEach(f => {
          if (f.startsWith('archive-')) {
            fs.unlinkSync(path.join(archiveDir, f));
          }
        });
      } catch (err) {
        // Safe check
      }
    }

    console.log('Stopping test backend server...');
    serverProcess.kill('SIGKILL');

    // Explicitly exit Node to ensure no process hang
    setTimeout(() => {
      process.exit(process.exitCode || 0);
    }, 500);
  }
}, 20000); // 20 seconds startup window
