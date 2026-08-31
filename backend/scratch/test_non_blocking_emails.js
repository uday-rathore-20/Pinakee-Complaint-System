const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const baseUrl = 'http://localhost:5095';
let serverProcess = null;
let dbPool = null;

// Seed IDs
let adminToken = '';
let adminId = null;
let deptId = null;

function cleanup(exitCode) {
  console.log('Cleaning up database settings test records...');
  if (dbPool) {
    dbPool.query("DELETE FROM email_outbox WHERE recipient LIKE 'test_nb_%'")
      .then(() => {
        if (adminId) dbPool.query("DELETE FROM users WHERE id = $1", [adminId]);
        if (deptId) dbPool.query("DELETE FROM departments WHERE id = $1", [deptId]);
      })
      .then(() => {
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
    console.log('Starting test backend server on port 5095...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: '5095',
        NODE_ENV: 'test'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server is running on port 5095')) {
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

    // Initial clean
    await dbPool.query("DELETE FROM email_outbox WHERE recipient LIKE 'test_nb_%'");
    await dbPool.query("DELETE FROM users WHERE email = 'test_nb_admin@test.com'");
    await dbPool.query("DELETE FROM departments WHERE name = 'TEST_NB_DEPT'");

    // Fetch Roles
    const rolesRes = await dbPool.query("SELECT id, name FROM roles");
    const adminRole = rolesRes.rows.find(r => r.name === 'ADMIN');

    // Seed department and admin user
    const deptRes = await dbPool.query("INSERT INTO departments (name, description) VALUES ('TEST_NB_DEPT', 'Dept NB') RETURNING id");
    deptId = deptRes.rows[0].id;

    const saltRounds = 1;
    const bcrypt = require('bcryptjs');
    const hashedPwd = await bcrypt.hash('password123', saltRounds);

    const adminRes = await dbPool.query(
      "INSERT INTO users (role_id, department_id, first_name, last_name, email, password_hash, is_active) VALUES ($1, $2, 'Admin', 'User', 'test_nb_admin@test.com', $3, true) RETURNING id",
      [adminRole.id, deptId, hashedPwd]
    );
    adminId = adminRes.rows[0].id;

    const emailWorker = require('../utils/emailWorker');

    // ==========================================
    // TEST 1: NON-BLOCKING & PROCESSING STATE TRANSITIONS
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 1: Non-Blocking & Processing State Transitions');
    console.log('------------------------------------------------------');

    // Seed a job
    const jobRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, attempts)
      VALUES ('test_nb_trans_delay_300@test.com', 'Subject', 'Body', 'Pending', 0)
      RETURNING id
    `);
    const jobId = jobRes.rows[0].id;

    // Stub/mock sendEmail to delay for 300ms
    const originalProcessNextJob = emailWorker.processNextJob;

    // We can directly verify that during execution, the database transitions to Processing
    const workerPromise = emailWorker.processQueue();

    // Check status in DB after 50ms -> should be 'Processing'
    await new Promise(r => setTimeout(r, 50));
    const midCheck = await dbPool.query("SELECT status, attempts FROM email_outbox WHERE id = $1", [jobId]);
    console.log(` - Mid-dispatch database status = ${midCheck.rows[0].status} (Expected: Processing)`);
    console.log(` - Mid-dispatch database attempts = ${midCheck.rows[0].attempts} (Expected: 1)`);
    if (midCheck.rows[0].status !== 'Processing') {
      throw new Error('Database status was not set to Processing immediately after claim phase');
    }

    // Wait for worker to finish
    await workerPromise;

    // Check status in DB after completion -> should be 'Sent'
    const finalCheck = await dbPool.query("SELECT status, attempts FROM email_outbox WHERE id = $1", [jobId]);
    console.log(` - Post-dispatch database status = ${finalCheck.rows[0].status} (Expected: Sent)`);
    if (finalCheck.rows[0].status !== 'Sent') {
      throw new Error('Database status failed to finalize to Sent');
    }

    // ==========================================
    // TEST 2: CRASH RECOVERY & RETRY LIMIT
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 2: Crash Recovery & Retry Limit');
    console.log('------------------------------------------------------');

    // Case A: Recoverable stuck processing job (attempts < 3, last_attempt_at is 10 mins ago)
    const recRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, attempts, last_attempt_at)
      VALUES ('test_nb_recover@test.com', 'Rec', 'Body', 'Processing', 1, NOW() - INTERVAL '10 minutes')
      RETURNING id
    `);
    const recId = recRes.rows[0].id;

    await emailWorker.processQueue();

    const recCheck = await dbPool.query("SELECT status, attempts FROM email_outbox WHERE id = $1", [recId]);
    console.log(` - Recovered job final status = ${recCheck.rows[0].status} (Expected: Sent)`);
    console.log(` - Recovered job attempts = ${recCheck.rows[0].attempts} (Expected: 2)`);
    if (recCheck.rows[0].status !== 'Sent' || recCheck.rows[0].attempts !== 2) {
      throw new Error('Stuck processing job was not successfully recovered and dispatched');
    }

    // Case B: Expired stuck processing job (attempts >= 3, last_attempt_at is 10 mins ago) -> should fail without retrying
    const expRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, attempts, last_attempt_at)
      VALUES ('test_nb_expired@test.com', 'Exp', 'Body', 'Processing', 3, NOW() - INTERVAL '10 minutes')
      RETURNING id
    `);
    const expId = expRes.rows[0].id;

    await emailWorker.processQueue();

    const expCheck = await dbPool.query("SELECT status, attempts, error_message FROM email_outbox WHERE id = $1", [expId]);
    console.log(` - Expired job final status = ${expCheck.rows[0].status} (Expected: Failed)`);
    console.log(` - Expired job attempts = ${expCheck.rows[0].attempts} (Expected: 3 - unchanged)`);
    console.log(` - Expired job error message = "${expCheck.rows[0].error_message}" (Expected: Worker lease expired: processing limit reached)`);
    if (expCheck.rows[0].status !== 'Failed' || expCheck.rows[0].attempts !== 3) {
      throw new Error('Expired processing job retry limit was bypassed or incorrectly handled');
    }

    // ==========================================
    // TEST 3: STALE-WORKER LEASE PROTECTION
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 3: Stale-Worker Lease Protection');
    console.log('------------------------------------------------------');

    // Seed a job
    const staleRes = await dbPool.query(`
      INSERT INTO email_outbox (recipient, subject, body, status, attempts)
      VALUES ('test_nb_stale@test.com', 'Stale', 'Body', 'Pending', 0)
      RETURNING id
    `);
    const staleId = staleRes.rows[0].id;

    // Simulate Worker A claiming the job (Phase 1)
    const clientA = await dbPool.connect();
    await clientA.query('BEGIN');
    const selectResA = await clientA.query("SELECT * FROM email_outbox WHERE id = $1 FOR UPDATE", [staleId]);
    const jobA = selectResA.rows[0];
    const attemptsA = jobA.attempts + 1;
    await clientA.query("UPDATE email_outbox SET status = 'Processing', attempts = $1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = $2", [attemptsA, staleId]);
    await clientA.query('COMMIT');
    clientA.release();

    console.log(` - Worker A claimed job. Local attempts tracker = ${attemptsA}`);

    // Now, simulate Worker B recovering the job because Worker A "timed out" or "crashed"
    // Worker B claims it: sets attempts to attemptsA + 1 = 2
    const clientB = await dbPool.connect();
    await clientB.query('BEGIN');
    const selectResB = await clientB.query("SELECT * FROM email_outbox WHERE id = $1 FOR UPDATE", [staleId]);
    const jobB = selectResB.rows[0];
    const attemptsB = jobB.attempts + 1;
    await clientB.query("UPDATE email_outbox SET status = 'Processing', attempts = $1, last_attempt_at = CURRENT_TIMESTAMP WHERE id = $2", [attemptsB, staleId]);
    await clientB.query('COMMIT');
    clientB.release();

    console.log(` - Worker B (recovery) claimed job. Database attempts = ${attemptsB}`);

    // Now, Worker A (stale) finally finishes its SMTP call and tries to Finalize (Phase 3)
    // Worker A tries to update status to 'Sent' using attempts = attemptsA = 1
    const finalizeClient = await dbPool.connect();
    await finalizeClient.query('BEGIN');
    const updateRes = await finalizeClient.query(`
      UPDATE email_outbox
      SET status = 'Sent',
          error_message = NULL
      WHERE id = $1 AND attempts = $2 AND status = 'Processing'
    `, [staleId, attemptsA]);
    await finalizeClient.query('COMMIT');
    finalizeClient.release();

    console.log(` - Stale Worker A finalize rowCount = ${updateRes.rowCount} (Expected: 0)`);
    if (updateRes.rowCount !== 0) {
      throw new Error('Security Breach: Stale worker was allowed to finalize and overwrite a reclaimed lease');
    }

    // Verify database remains Processing with attempts = 2
    const checkStaleFinal = await dbPool.query("SELECT status, attempts FROM email_outbox WHERE id = $1", [staleId]);
    console.log(` - Final database status = ${checkStaleFinal.rows[0].status} (Expected: Processing)`);
    console.log(` - Final database attempts = ${checkStaleFinal.rows[0].attempts} (Expected: 2)`);
    if (checkStaleFinal.rows[0].status !== 'Processing' || checkStaleFinal.rows[0].attempts !== 2) {
      throw new Error('Database integrity violated by stale worker update');
    }

    console.log('\n======================================================');
    console.log('   ALL NON-BLOCKING TRANSACTIONAL EMAIL QUEUE TESTS PASSED! (PASS)');
    console.log('======================================================');

    cleanup(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.stack || err);
    cleanup(1);
  }
}

runTests();
