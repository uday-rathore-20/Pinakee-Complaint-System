const dbPool = require('../config/db');
const notifications = require('./notifications');
const logger = require('./logger');

/**
 * Checks for tickets that have breached their SLA due dates and flags/escalates them.
 */
const checkSlaBreaches = async () => {
  if (!dbPool) return;

  // Step 1: Detect and flag new SLA breaches
  try {
    const query = `
      SELECT c.id, c.ticket_number, c.title, c.department_id, c.due_date, cs.name AS status
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.is_sla_breached = FALSE
        AND cs.name NOT IN ('Resolved', 'Closed', 'On Hold', 'Waiting on Customer')
        AND c.due_date < CURRENT_TIMESTAMP
    `;
    const result = await dbPool.query(query);

    if (result.rows.length > 0) {
      logger.info(`SLA Daemon: Detected ${result.rows.length} new SLA breaches. Processing breaches...`);

      for (const complaint of result.rows) {
        const client = await dbPool.connect();
        try {
          await client.query('BEGIN');

          const checkQuery = `
            SELECT c.is_sla_breached, cs.name AS status
            FROM complaints c
            JOIN complaint_statuses cs ON c.status_id = cs.id
            WHERE c.id = $1 FOR UPDATE
          `;
          const checkRes = await client.query(checkQuery, [complaint.id]);
          if (checkRes.rows.length === 0 || checkRes.rows[0].is_sla_breached || ['Resolved', 'Closed', 'On Hold', 'Waiting on Customer'].includes(checkRes.rows[0].status)) {
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

          await client.query('COMMIT');
          client.release();

          // C. Trigger notifications (outside transaction to avoid delays/timeouts in notifications helper)
          await notifications.notifySlaBreached(complaint, complaint.department_id);

          logger.audit('SLA_BREACH_DETECTED', { complaintId: complaint.id, ticketNumber: complaint.ticket_number });

        } catch (txErr) {
          await client.query('ROLLBACK');
          client.release();
          console.error(`SLA Daemon: Failed to process breach flag for ticket #${complaint.ticket_number}:`, txErr.message);
        }
      }
    }
  } catch (err) {
    console.error('SLA Daemon check breaches error:', err.message);
  }

  // Step 2: Detect and process SLA escalations
  try {
    const escalationQuery = `
      SELECT c.id, c.ticket_number, c.title, c.department_id, c.priority_id, c.assigned_to_id, c.status_id, cp.name AS priority_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      JOIN complaint_priorities cp ON c.priority_id = cp.id
      WHERE c.is_sla_breached = TRUE
        AND c.is_escalated = FALSE
        AND cs.name NOT IN ('Resolved', 'Closed', 'On Hold', 'Waiting on Customer')
    `;
    const escResult = await dbPool.query(escalationQuery);

    if (escResult.rows.length > 0) {
      logger.info(`SLA Daemon: Detected ${escResult.rows.length} un-escalated breached complaints. Processing escalations...`);

      for (const complaint of escResult.rows) {
        const client = await dbPool.connect();
        try {
          await client.query('BEGIN');

          const checkQuery = `
            SELECT c.is_escalated, c.priority_id, c.assigned_to_id, c.status_id, cs.name AS status_name
            FROM complaints c
            JOIN complaint_statuses cs ON c.status_id = cs.id
            WHERE c.id = $1 FOR UPDATE
          `;
          const checkRes = await client.query(checkQuery, [complaint.id]);
          if (checkRes.rows.length === 0 || checkRes.rows[0].is_escalated || ['Resolved', 'Closed', 'On Hold', 'Waiting on Customer'].includes(checkRes.rows[0].status_name)) {
            client.release();
            continue;
          }

          const currentComp = checkRes.rows[0];

          // Determine next priority (Low -> Medium -> High -> Critical)
          let nextPriorityName = 'Critical';
          if (complaint.priority_name === 'Low') nextPriorityName = 'Medium';
          else if (complaint.priority_name === 'Medium') nextPriorityName = 'High';
          else if (complaint.priority_name === 'High') nextPriorityName = 'Critical';

          const priorityDbRes = await client.query('SELECT id FROM complaint_priorities WHERE name = $1', [nextPriorityName]);
          const nextPriorityId = priorityDbRes.rows[0]?.id || currentComp.priority_id;

          // Find active Department Head for this department
          const headRes = await client.query(`
            SELECT u.id, u.email
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE r.name = 'DEPT_HEAD'
              AND u.department_id = $1
              AND u.is_active = TRUE
            LIMIT 1
          `, [complaint.department_id]);

          let managerId = null;
          let managerEmail = null;

          if (headRes.rows.length > 0) {
            managerId = headRes.rows[0].id;
            managerEmail = headRes.rows[0].email;
          } else {
            // Fallback to active Admin
            const adminRes = await client.query(`
              SELECT u.id, u.email
              FROM users u
              JOIN roles r ON u.role_id = r.id
              WHERE r.name = 'ADMIN'
                AND u.is_active = TRUE
              LIMIT 1
            `);
            if (adminRes.rows.length > 0) {
              managerId = adminRes.rows[0].id;
              managerEmail = adminRes.rows[0].email;
            }
          }

          if (!managerId) {
            throw new Error('No active Department Head or Admin found to escalate to.');
          }

          // Get Assigned status ID
          const statusDbRes = await client.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
          const assignedStatusId = statusDbRes.rows[0]?.id || currentComp.status_id;

          // Update complaint (mark is_escalated = true, set escalated_at, increment escalation_level, update priority, assign to manager, change status to Assigned)
          await client.query(`
            UPDATE complaints
            SET is_escalated = TRUE,
                escalated_at = CURRENT_TIMESTAMP,
                escalation_level = escalation_level + 1,
                priority_id = $1,
                assigned_to_id = $2,
                status_id = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
          `, [nextPriorityId, managerId, assignedStatusId, complaint.id]);

          // Get system admin to act as changer in history logs
          const systemAdminRes = await client.query(`
            SELECT u.id
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE r.name = 'ADMIN'
              AND u.is_active = TRUE
            LIMIT 1
          `);
          const systemAdminId = systemAdminRes.rows[0]?.id || null;

          // Record transition in complaint_status_history
          await client.query(`
            INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            complaint.id,
            systemAdminId,
            currentComp.status_id,
            assignedStatusId,
            `SLA Escalation: Priority boosted from ${complaint.priority_name} to ${nextPriorityName}. Reassigned to manager.`
          ]);

          await client.query('COMMIT');
          client.release();

          // Trigger notifications and WebSocket events (outside transaction)
          try {
            // 1. Create in-app notification for the new assignee
            await notifications.createNotification(
              managerId,
              complaint.id,
              'SLA_ESCALATED',
              'Ticket Escalated',
              `Complaint #${complaint.ticket_number} ("${complaint.title}") has breached SLA and has been escalated to you.`
            );

            // 2. Create in-app notification for the ticket creator
            const creatorRes = await dbPool.query('SELECT created_by_id FROM complaints WHERE id = $1', [complaint.id]);
            const creatorId = creatorRes.rows[0]?.created_by_id;
            if (creatorId && creatorId !== managerId) {
              await notifications.createNotification(
                creatorId,
                complaint.id,
                'SLA_ESCALATED',
                'Ticket Escalated',
                `Your complaint #${complaint.ticket_number} has been escalated for manager review.`
              );
            }

            // 3. Send email to the manager
            const managerUserRes = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [managerId]);
            if (managerUserRes.rows.length > 0) {
              const manager = managerUserRes.rows[0];
              await notifications.logEmail(
                manager.email,
                `[PINakee] SLA Escalation Alert: Ticket #${complaint.ticket_number}`,
                `Dear ${manager.first_name},\n\nTicket #${complaint.ticket_number} has breached its SLA and is escalated to you for priority resolution.\n\nBest regards,\nPINakee System Dispatcher`
              );
            }
          } catch (notifErr) {
            console.error(`SLA Daemon: Notification emission failed for ticket #${complaint.ticket_number}:`, notifErr.message);
          }

          logger.audit('SLA_ESCALATED', {
            complaintId: complaint.id,
            ticketNumber: complaint.ticket_number,
            escalatedToId: managerId,
            escalatedToEmail: managerEmail
          });

        } catch (txErr) {
          await client.query('ROLLBACK');
          client.release();
          console.error(`SLA Daemon: Failed to process escalation for ticket #${complaint.ticket_number}:`, txErr.message);
        }
      }
    }
  } catch (err) {
    console.error('SLA Daemon check escalations error:', err.message);
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
