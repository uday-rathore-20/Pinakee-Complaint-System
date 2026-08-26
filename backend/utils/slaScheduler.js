const dbPool = require('../config/db');
const notifications = require('./notifications');
const logger = require('./logger');

/**
 * Checks for tickets that have breached their SLA due dates and flags/escalates them.
 */
const checkSlaBreaches = async () => {
  if (!dbPool) return;

  try {
    // 1. Find all complaints that are past due, not resolved/closed, and not flagged as breached yet
    const query = `
      SELECT c.id, c.ticket_number, c.title, c.department_id, c.due_date, cs.name AS status
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.is_sla_breached = FALSE
        AND cs.name NOT IN ('Resolved', 'Closed')
        AND c.due_date < CURRENT_TIMESTAMP
    `;
    const result = await dbPool.query(query);

    if (result.rows.length === 0) return;

    logger.info(`SLA Daemon: Detected ${result.rows.length} new SLA breaches. Processing escalations...`);

    for (const complaint of result.rows) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');

        // Double check status and breach flag inside transaction (prevent race conditions)
        const checkQuery = `
          SELECT c.is_sla_breached, cs.name AS status
          FROM complaints c
          JOIN complaint_statuses cs ON c.status_id = cs.id
          WHERE c.id = $1 FOR UPDATE
        `;
        const checkRes = await client.query(checkQuery, [complaint.id]);
        if (checkRes.rows.length === 0 || checkRes.rows[0].is_sla_breached || ['Resolved', 'Closed'].includes(checkRes.rows[0].status)) {
          client.release();
          continue;
        }

        // A. Flag ticket as breached
        await client.query('UPDATE complaints SET is_sla_breached = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [complaint.id]);

        // B. Add internal comment log for auditing
        const auditComment = 'SLA Breach: Ticket has exceeded the resolution time limit.';
        await client.query(`
          INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
          SELECT $1, u.id, $2, TRUE
          FROM users u
          JOIN roles r ON u.role_id = r.id
          WHERE r.name = 'ADMIN'
          LIMIT 1
        `, [complaint.id, auditComment]);

        // C. Commit the transaction
        await client.query('COMMIT');
        client.release();

        // D. Trigger notifications (outside transaction to avoid delays/timeouts in notifications helper)
        await notifications.notifySlaBreached(complaint, complaint.department_id);

        logger.audit('SLA_BREACH_DETECTED', { complaintId: complaint.id, ticketNumber: complaint.ticket_number });

      } catch (txErr) {
        await client.query('ROLLBACK');
        client.release();
        console.error(`SLA Daemon: Failed to process escalation for ticket #${complaint.ticket_number}:`, txErr.message);
      }
    }
  } catch (err) {
    console.error('SLA Daemon check error:', err.message);
  }
};

/**
 * Starts the SLA background monitoring interval.
 * @param {number} intervalMs - Frequency of checks (defaults to 1 minute / 60000ms)
 */
const startSlaScheduler = (intervalMs = 60000) => {
  logger.info(`SLA Daemon initialized (Check interval: ${intervalMs}ms)`);
  // Run immediately on boot
  checkSlaBreaches();
  // Set repeating timer
  const intervalId = setInterval(checkSlaBreaches, intervalMs);

  return intervalId;
};

module.exports = {
  checkSlaBreaches,
  startSlaScheduler
};
