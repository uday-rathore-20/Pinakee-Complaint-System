const fs = require('fs');
const path = require('path');
const dbPool = require('../config/db');
const logger = require('./logger');

let workerIntervalId = null;
let isProcessing = false;

/**
 * Dispatch the email using either the simulator (dev/test) or SMTP (production).
 */
async function sendEmail(recipient, subject, body) {
  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || !process.env.SMTP_HOST;

  if (isDevOrTest) {
    if (recipient === 'fail_me@test.com') {
      return { success: false, error: 'SIMULATED_EMAIL_DISPATCH_FAILURE' };
    }

    // 1. Dev/Test mode: Write to simulator log
    const logDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'email_simulator.log');
    const logEntry = `[${new Date().toISOString()}] To: ${recipient}\nSubject: ${subject}\nBody:\n${body}\n==================================================\n\n`;
    fs.appendFileSync(logPath, logEntry);

    // Also write to stdout to help verify tests
    console.log(`[SIMULATOR EMAIL SENT] To: ${recipient} | Subject: ${subject}`);
    return { success: true };
  } else {
    // 2. Production mode: SMTP Nodemailer dispatch
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"PINakee System" <noreply@pinakee.com>',
        to: recipient,
        subject: subject,
        text: body,
      });

      return { success: true };
    } catch (smtpErr) {
      return { success: false, error: smtpErr.message };
    }
  }
}

/**
 * Process a single email job from the queue using row-locks.
 */
async function processNextJob() {
  if (!dbPool) return false;

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // Select the next job and lock the row, skipping already locked ones
    const selectQuery = `
      SELECT id, recipient, subject, body, attempts
      FROM email_outbox
      WHERE status = 'Pending' OR (status = 'Failed' AND attempts < 3 AND (last_attempt_at IS NULL OR last_attempt_at < CURRENT_TIMESTAMP - INTERVAL '10 seconds'))
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const selectRes = await client.query(selectQuery);

    if (selectRes.rows.length === 0) {
      await client.query('COMMIT');
      return false; // No jobs to process
    }

    const job = selectRes.rows[0];
    const newAttempts = job.attempts + 1;

    // Attempt to dispatch
    const result = await sendEmail(job.recipient, job.subject, job.body);

    if (result.success) {
      // Mark as Sent
      await client.query(`
        UPDATE email_outbox
        SET status = 'Sent',
            attempts = $1,
            last_attempt_at = CURRENT_TIMESTAMP,
            error_message = NULL
        WHERE id = $2
      `, [newAttempts, job.id]);
    } else {
      // Mark as Failed
      await client.query(`
        UPDATE email_outbox
        SET status = 'Failed',
            attempts = $1,
            last_attempt_at = CURRENT_TIMESTAMP,
            error_message = $2
        WHERE id = $3
      `, [newAttempts, result.error, job.id]);
    }

    await client.query('COMMIT');
    return true; // Processed a job, check if more are available
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Email Worker: Error processing email job:', err.message);
    return false;
  } finally {
    client.release();
  }
}

/**
 * Poll the queue and process jobs until empty.
 */
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let hasMore = true;
    while (hasMore) {
      hasMore = await processNextJob();
    }
  } catch (err) {
    console.error('Email Worker: Queue processing failed:', err.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the background worker.
 */
function start(intervalMs = 15000) {
  if (workerIntervalId) {
    console.log('Email Worker: Already running.');
    return;
  }

  console.log(`Email Worker: Initialized (Polling interval: ${intervalMs}ms)`);
  workerIntervalId = setInterval(() => {
    processQueue().catch(err => {
      console.error('Email Worker: Interval poll error:', err.message);
    });
  }, intervalMs);
}

/**
 * Stop the background worker.
 */
function stop() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
    console.log('Email Worker: Stopped successfully.');
  }
}

module.exports = {
  start,
  stop,
  processQueue,
};
