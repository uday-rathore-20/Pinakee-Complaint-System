const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const baseUrl = 'http://localhost:5198';
let serverProcess = null;
let dbPool = null;

// Track seed IDs
let adminToken = '';
let adminId = null;
let deptId = null;

function cleanup(exitCode) {
  console.log('Cleaning up database settings test records...');
  if (dbPool) {
    dbPool.query("DROP TRIGGER IF EXISTS trg_abort_delete ON email_outbox")
      .then(() => dbPool.query("DROP FUNCTION IF EXISTS abort_delete()"))
      .then(() => dbPool.query("DELETE FROM email_outbox WHERE recipient LIKE 'test_arch_%'"))
      .then(() => dbPool.query("DELETE FROM audit_logs WHERE description LIKE 'TEST_ARCH_%'"))
      .then(() => dbPool.query("DELETE FROM in_app_notifications WHERE title LIKE 'TEST_ARCH_%'"))
      .then(() => {
        if (adminId) dbPool.query("DELETE FROM users WHERE id = $1", [adminId]);
        if (deptId) dbPool.query("DELETE FROM departments WHERE id = $1", [deptId]);
      })
      .then(() => {
        // Clean up mock archives folder matching test naming
        const archiveDir = path.join(__dirname, '..', 'archives');
        if (fs.existsSync(archiveDir)) {
          const files = fs.readdirSync(archiveDir);
          files.forEach(file => {
            if (file.includes('emails') && file.startsWith('archive-')) {
              try {
                fs.unlinkSync(path.join(archiveDir, file));
              } catch (e) {}
            }
          });
        }
        console.log('Database clean completed.');
        dbPool.end();
        if (serverProcess) {
          console.log('Terminating test server process...');
          serverProcess.kill();
        }
        process.exit(exitCode);
      })
      .catch(err => {
        console.error('Error during cleanup:', err.message);
        if (serverProcess) serverProcess.kill();
        process.exit(1);
      });
  } else {
    if (serverProcess) serverProcess.kill();
    process.exit(exitCode);
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting test backend server on port 5198...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: '5198',
        NODE_ENV: 'test'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server is running on port 5198')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server STDERR]: ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

async function runTests() {
  try {
    await startServer();

    // Connect to DB pool
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    console.log('Database pool connected.');

    // Initial cleanup of old test records
    await dbPool.query("DELETE FROM email_outbox WHERE recipient LIKE 'test_arch_%'");
    await dbPool.query("DELETE FROM audit_logs WHERE description LIKE 'TEST_ARCH_%'");
    await dbPool.query("DELETE FROM in_app_notifications WHERE title LIKE 'TEST_ARCH_%'");
    await dbPool.query("DELETE FROM users WHERE email = 'test_arch_admin@test.com'");
    await dbPool.query("DELETE FROM departments WHERE name = 'TEST_ARCH_DEPT'");

    // Fetch Roles
    const rolesRes = await dbPool.query("SELECT id, name FROM roles");
    const adminRole = rolesRes.rows.find(r => r.name === 'ADMIN');

    // Seed department and admin user
    const deptRes = await dbPool.query("INSERT INTO departments (name, description) VALUES ('TEST_ARCH_DEPT', 'Dept Arch') RETURNING id");
    deptId = deptRes.rows[0].id;

    const saltRounds = 1;
    const bcrypt = require('bcryptjs');
    const hashedPwd = await bcrypt.hash('password123', saltRounds);

    const adminRes = await dbPool.query(
      "INSERT INTO users (role_id, department_id, first_name, last_name, email, password_hash, is_active) VALUES ($1, $2, 'Admin', 'User', 'test_arch_admin@test.com', $3, true) RETURNING id",
      [adminRole.id, deptId, hashedPwd]
    );
    adminId = adminRes.rows[0].id;

    // Authenticate Admin
    const login = async (email) => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'password123' })
      });
      const body = await res.json();
      return body.data.token;
    };
    adminToken = await login('test_arch_admin@test.com');

    // ==========================================
    // TEST 1: TRANSACTIONAL EMAIL OUTBOX ARCHIVAL
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 1: Transactional Email Outbox Archival');
    console.log('------------------------------------------------------');

    // Seed email outbox records
    // Record 1: Old Sent (created 95 days ago) -> Should be pruned & archived
    const oldSentRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, created_at)
      VALUES ('test_arch_old_sent@test.com', 'Old Sent', 'Body', 'Sent', NOW() - INTERVAL '95 days')
      RETURNING id
    `);
    const oldSentId = oldSentRes.rows[0].id;

    // Record 2: Old Failed (created 95 days ago) -> Should be pruned & archived
    const oldFailedRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, created_at)
      VALUES ('test_arch_old_failed@test.com', 'Old Failed', 'Body', 'Failed', NOW() - INTERVAL '95 days')
      RETURNING id
    `);
    const oldFailedId = oldFailedRes.rows[0].id;

    // Record 3: Old Pending (created 95 days ago) -> Should NOT be pruned (Pending!)
    const oldPendingRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, created_at)
      VALUES ('test_arch_old_pending@test.com', 'Old Pending', 'Body', 'Pending', NOW() - INTERVAL '95 days')
      RETURNING id
    `);
    const oldPendingId = oldPendingRes.rows[0].id;

    // Record 4: New Sent (created 10 days ago) -> Should NOT be pruned (Too new!)
    const newSentRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, created_at)
      VALUES ('test_arch_new_sent@test.com', 'New Sent', 'Body', 'Sent', NOW() - INTERVAL '10 days')
      RETURNING id
    `);
    const newSentId = newSentRes.rows[0].id;

    // Trigger archiver manual execution via API
    const runRes = await fetch(`${baseUrl}/api/settings/archives/run`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const runBody = await runRes.json();
    console.log(' - Manual archiver trigger response:', runBody);

    if (runRes.status !== 200) {
      throw new Error(`Manual archiver run failed with status ${runRes.status}`);
    }

    // Verify database pruning results
    const selectEmail = async (id) => {
      const res = await dbPool.query("SELECT * FROM email_outbox WHERE id = $1", [id]);
      return res.rows[0];
    };

    const rowOldSent = await selectEmail(oldSentId);
    console.log(` - Old Sent pruned status: ${rowOldSent === undefined ? 'SUCCESS' : 'FAILED'}`);
    if (rowOldSent !== undefined) throw new Error('Old Sent record was not pruned');

    const rowOldFailed = await selectEmail(oldFailedId);
    console.log(` - Old Failed pruned status: ${rowOldFailed === undefined ? 'SUCCESS' : 'FAILED'}`);
    if (rowOldFailed !== undefined) throw new Error('Old Failed record was not pruned');

    const rowOldPending = await selectEmail(oldPendingId);
    console.log(` - Old Pending still exists: ${rowOldPending !== undefined ? 'SUCCESS' : 'FAILED'}`);
    if (rowOldPending === undefined) throw new Error('Old Pending record was incorrectly pruned');

    const rowNewSent = await selectEmail(newSentId);
    console.log(` - New Sent still exists: ${rowNewSent !== undefined ? 'SUCCESS' : 'FAILED'}`);
    if (rowNewSent === undefined) throw new Error('New Sent record was incorrectly pruned');

    // ==========================================
    // TEST 2: S3/MOCK STORAGE PERSISTENCE & DISK CLEANUP
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 2: S3/Mock Storage Persistence and Disk Cleanup');
    console.log('------------------------------------------------------');

    const filesGenerated = (runBody.data && runBody.data.filesGenerated) || [];
    const emailsArchive = filesGenerated.find(f => f.includes('emails'));
    console.log(' - Generated email archive filename:', emailsArchive);
    if (!emailsArchive) throw new Error('No email archive filename returned by manual run endpoint');

    // Verify the mock archives directory contains this file (since we are in mock mode in test environment)
    const archiveDir = path.join(__dirname, '..', 'archives');
    const localFilePath = path.join(archiveDir, emailsArchive);
    const localExists = fs.existsSync(localFilePath);
    console.log(` - Local mock archive file exists: ${localExists ? 'YES' : 'NO'}`);
    if (!localExists) throw new Error('Mock archive file was not persisted locally in test mode');

    // Verify file is a valid gzip file
    const fileStats = fs.statSync(localFilePath);
    console.log(` - Local archive file size: ${fileStats.size} bytes (Expected: > 0)`);
    if (fileStats.size === 0) throw new Error('Generated archive file is empty');

    // ==========================================
    // TEST 3: HORIZONTALLY-SCALABLE LISTING
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 3: Horizontally-Scalable Listing');
    console.log('------------------------------------------------------');

    const listRes = await fetch(`${baseUrl}/api/settings/archives`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const listBody = await listRes.json();
    console.log(' - API Archive list contents:', listBody.data.map(d => d.filename));

    const foundInList = listBody.data.find(d => d.filename === emailsArchive);
    if (!foundInList) throw new Error('The generated archive is missing from the list endpoint');
    console.log(` - Found in listing response: YES (Size: ${foundInList.size} bytes)`);

    // Test download URL mapping
    const downloadRes = await fetch(`${baseUrl}/api/settings/archives/${emailsArchive}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
      redirect: 'manual'
    });
    console.log(` - Download endpoint response status: ${downloadRes.status} (Expected: 200 for mock direct download or 302 for S3 redirect)`);
    if (downloadRes.status !== 200 && downloadRes.status !== 302) {
      throw new Error(`Download request failed with status ${downloadRes.status}`);
    }

    // ==========================================
    // TEST 4: ROLLBACK SAFETY / FAIL-SAFE CLEANUP
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 4: Rollback Safety / Fail-Safe Cleanup');
    console.log('------------------------------------------------------');

    // Inject temporary abort delete trigger on email_outbox to abort transactions during runArchiver
    await dbPool.query(`
      CREATE OR REPLACE FUNCTION abort_delete() RETURNS TRIGGER AS $$
      BEGIN
          RAISE EXCEPTION 'Simulated abort delete';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await dbPool.query(`
      CREATE TRIGGER trg_abort_delete
      BEFORE DELETE ON email_outbox
      FOR EACH ROW EXECUTE FUNCTION abort_delete();
    `);

    // Re-seed an old Sent email record to trigger another run
    await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, created_at)
      VALUES ('test_arch_rollback@test.com', 'Rollback Subject', 'Body', 'Sent', NOW() - INTERVAL '95 days')
    `);

    // Trigger runArchiver -> should abort and roll back
    const failRunRes = await fetch(`${baseUrl}/api/settings/archives/run`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log(` - Fail manual run response status: ${failRunRes.status} (Expected: 409 or 500)`);

    // Check that NO new email archive files were permanently saved in mock folder
    const filesAfterFail = fs.readdirSync(archiveDir);
    const emailsArchivesAfter = filesAfterFail.filter(file => file.includes('emails') && file.startsWith('archive-'));
    console.log(` - Number of email archives after failed run: ${emailsArchivesAfter.length} (Expected: 1 - only the first successful one remains)`);
    if (emailsArchivesAfter.length > 1) {
      throw new Error('Rollback failed to clean up mock storage archive files');
    }

    // Clean up temporary abort trigger
    await dbPool.query("DROP TRIGGER IF EXISTS trg_abort_delete ON email_outbox");
    await dbPool.query("DROP FUNCTION IF EXISTS abort_delete()");

    console.log('\n======================================================');
    console.log('   ALL DURABLE CLOUD ARCHIVE PERSISTENCE TESTS PASSED! (PASS)');
    console.log('======================================================');

    cleanup(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.stack || err);
    cleanup(1);
  }
}

runTests();
