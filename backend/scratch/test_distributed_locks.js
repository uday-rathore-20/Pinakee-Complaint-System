const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');
const lockManager = require('../utils/lockManager');

const baseUrl = 'http://localhost:5097';
let serverProcess = null;
let dbPool = null;

function cleanup(exitCode) {
  console.log('Cleaning up database settings test records...');
  if (dbPool) {
    dbPool.end().then(() => {
      console.log('Database clean completed.');
      if (serverProcess) {
        console.log('Terminating test server process...');
        serverProcess.kill();
      }
      process.exit(exitCode);
    });
  } else {
    if (serverProcess) serverProcess.kill();
    process.exit(exitCode);
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting test backend server on port 5097...');
    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: '5097',
        NODE_ENV: 'test'
      }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Server is running on port 5097')) {
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

    // Ensure lockManager is using the initialized pool by requiring it after dotenv
    console.log('Lock keys defined:');
    console.log(` - LOCK_ARCHIVE = ${lockManager.LOCK_ARCHIVE}`);
    console.log(` - LOCK_SLA = ${lockManager.LOCK_SLA}`);

    // ==========================================
    // TEST 1: MUTUAL EXCLUSION
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 1: Mutual Exclusion');
    console.log('------------------------------------------------------');

    const handleA = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    console.log(' - Connection A tryLock LOCK_ARCHIVE: acquired =', !!handleA);
    if (!handleA) {
      throw new Error('Connection A failed to acquire LOCK_ARCHIVE on first attempt');
    }

    const handleB = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    console.log(' - Connection B tryLock LOCK_ARCHIVE: acquired =', !!handleB);
    if (handleB) {
      throw new Error('Connection B acquired LOCK_ARCHIVE while Connection A was still holding it');
    }

    const unlockedA = await lockManager.unlock(handleA);
    console.log(' - Connection A unlocked: success =', unlockedA);
    if (!unlockedA) {
      throw new Error('Failed to unlock Connection A');
    }

    const handleB2 = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    console.log(' - Connection B tryLock LOCK_ARCHIVE again: acquired =', !!handleB2);
    if (!handleB2) {
      throw new Error('Connection B failed to acquire LOCK_ARCHIVE after Connection A released it');
    }

    await lockManager.unlock(handleB2);

    // ==========================================
    // TEST 2: SAME-CONNECTION OWNERSHIP
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 2: Same-Connection Ownership');
    console.log('------------------------------------------------------');

    const handleC = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);

    // Attempting to release C's lock with a different client/connection should fail
    const dummyClient = await dbPool.connect();
    try {
      const res = await dummyClient.query('SELECT pg_advisory_unlock($1) AS released', [lockManager.LOCK_ARCHIVE]);
      console.log(' - Dummy connection pg_advisory_unlock: released =', res.rows[0].released);
      if (res.rows[0].released !== false) {
        throw new Error('Dummy connection was allowed to release another connection\'s advisory lock');
      }
    } finally {
      dummyClient.release();
    }

    // Verify lock is still held
    const handleD = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    console.log(' - Verification tryLock by another connection: acquired =', !!handleD);
    if (handleD) {
      throw new Error('Lock was lost after dummy unlock attempt');
    }

    await lockManager.unlock(handleC);

    // ==========================================
    // TEST 3: CONNECTION-DROP RELEASE
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 3: Connection-Drop Release');
    console.log('------------------------------------------------------');

    const handleE = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    const clientE = handleE.client;
    clientE.on('error', () => {});

    // Fetch PID for clientE
    const pidRes = await clientE.query('SELECT pg_backend_pid() AS pid');
    const pid = pidRes.rows[0].pid;
    console.log(` - Client E backend pid = ${pid}`);

    // Terminate E's session using the main test pool
    console.log(' - Terminating Client E backend process...');
    await dbPool.query('SELECT pg_terminate_backend($1)', [pid]);

    // Give database engine 100ms to process termination
    await new Promise(r => setTimeout(r, 100));

    // Try to acquire lock now -> should succeed immediately since connection drop automatically clears advisory locks
    const handleF = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    console.log(' - Connection F tryLock after Client E terminated: acquired =', !!handleF);
    if (!handleF) {
      throw new Error('Lock was not automatically released after Client E connection was terminated');
    }

    await lockManager.unlock(handleF);

    // ==========================================
    // TEST 4: SLA LOCK MUTUAL EXCLUSION
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 4: SLA Lock Mutual Exclusion');
    console.log('------------------------------------------------------');

    const handleSlaA = await lockManager.tryLock(lockManager.LOCK_SLA);
    console.log(' - Connection A tryLock LOCK_SLA: acquired =', !!handleSlaA);
    if (!handleSlaA) {
      throw new Error('Connection A failed to acquire LOCK_SLA');
    }

    const handleSlaB = await lockManager.tryLock(lockManager.LOCK_SLA);
    console.log(' - Connection B tryLock LOCK_SLA: acquired =', !!handleSlaB);
    if (handleSlaB) {
      throw new Error('Connection B acquired LOCK_SLA while Connection A was still holding it');
    }

    await lockManager.unlock(handleSlaA);

    // ==========================================
    // TEST 5: LOCK ISOLATION
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 5: Lock Isolation');
    console.log('------------------------------------------------------');

    const handleIsoArchive = await lockManager.tryLock(lockManager.LOCK_ARCHIVE);
    const handleIsoSla = await lockManager.tryLock(lockManager.LOCK_SLA);

    console.log(' - Acquired LOCK_ARCHIVE:', !!handleIsoArchive);
    console.log(' - Acquired LOCK_SLA:', !!handleIsoSla);

    if (!handleIsoArchive || !handleIsoSla) {
      throw new Error('Lock isolation failed: LOCK_ARCHIVE and LOCK_SLA could not be held simultaneously');
    }

    await lockManager.unlock(handleIsoArchive);
    await lockManager.unlock(handleIsoSla);

    // ==========================================
    // TEST 6: ERROR CLEANUP & DUMMY HANDLES
    // ==========================================
    console.log('\n------------------------------------------------------');
    console.log('Test 6: Error Cleanup & Dummy Handles');
    console.log('------------------------------------------------------');

    const invalidUnlock = await lockManager.unlock(null);
    console.log(' - Unlock with null handle returned:', invalidUnlock);
    if (invalidUnlock !== false) {
      throw new Error('Unlock did not handle null parameters safely');
    }

    const emptyUnlock = await lockManager.unlock({});
    console.log(' - Unlock with empty object returned:', emptyUnlock);
    if (emptyUnlock !== false) {
      throw new Error('Unlock did not handle empty objects safely');
    }

    console.log('\n======================================================');
    console.log('   ALL DISTRIBUTED LOCK SYNCHRONIZATION TESTS PASSED! (PASS)');
    console.log('======================================================');

    cleanup(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.stack || err);
    cleanup(1);
  }
}

runTests();
