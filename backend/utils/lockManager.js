const dbPool = require('../config/db');

const LOCK_ARCHIVE = 100001;
const LOCK_SLA = 100002;

/**
 * Attempt to acquire a session-level Postgres advisory lock.
 * If acquired, the client connection remains checked out from the pool.
 * If not acquired, the client is released immediately.
 *
 * @param {number} lockKey - Unique 64-bit integer representing the lock
 * @returns {Promise<Object|null>} Lock handle containing the client and key, or null
 */
async function tryLock(lockKey) {
  if (!dbPool) return null;

  const client = await dbPool.connect();
  try {
    const res = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockKey]);
    const acquired = res.rows[0]?.acquired;

    if (acquired) {
      return { client, lockKey };
    } else {
      client.release();
      return null;
    }
  } catch (err) {
    client.release();
    throw err;
  }
}

/**
 * Release the Postgres advisory lock and return the client back to the pool.
 *
 * @param {Object} lockHandle - Lock handle containing the client and key
 * @returns {Promise<boolean>} True if unlocked successfully, false if handle is invalid
 */
async function unlock(lockHandle) {
  if (!lockHandle || !lockHandle.client || !lockHandle.lockKey) {
    return false;
  }

  const { client, lockKey } = lockHandle;
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    return true;
  } finally {
    client.release();
  }
}

module.exports = {
  LOCK_ARCHIVE,
  LOCK_SLA,
  tryLock,
  unlock
};
