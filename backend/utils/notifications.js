/**
 * Decoupled Notification Service Manager
 * Handles formatting email templates and dispatching logs during development.
 * Designed to be easily replaced by SMTP client/Nodemailer in production.
 */
class NotificationService {
  /**
   * Log helper representing email transmission.
   */
  logEmail(to, subject, body) {
    console.log('\n---------------- [NOTIFICATION EMAIL OUTBOX] ----------------');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body:');
    console.log(body);
    console.log('-------------------------------------------------------------\n');

    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(__dirname, '../logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'email_simulator.log');
      const logEntry = `[${new Date().toISOString()}] To: ${to}\nSubject: ${subject}\nBody:\n${body}\n==================================================\n\n`;
      fs.appendFileSync(logPath, logEntry);
    } catch (err) {
      console.error('Failed to write email simulator log:', err.message);
    }
  }

  /**
   * Dispatch notification when a ticket is assigned.
   * @param {Object} complaint - Ticket record details
   * @param {Object} assignee - Assignee user details (first_name, last_name, email)
   */
  async sendAssignmentNotification(complaint, assignee) {
    if (!assignee || !assignee.email) return;

    const subject = `[PINakee] Complaint Ticket Assigned: #${complaint.ticket_number}`;
    const body = `Dear ${assignee.first_name} ${assignee.last_name},

A complaint ticket has been assigned to you.

Ticket Reference: #${complaint.ticket_number}
Title:            ${complaint.title}
Priority:         ${complaint.priority || 'Medium'}

Please log in to the PINakee Dashboard to review details and update the status.

Best regards,
PINakee System Dispatcher`;

    this.logEmail(assignee.email, subject, body);
  }

  /**
   * Dispatch notification when a comment is added to a ticket.
   * @param {Object} complaint - Ticket record details
   * @param {Object} comment - Comment content details
   * @param {Object} recipient - Recipient user details (first_name, last_name, email)
   */
  async sendCommentNotification(complaint, comment, recipient) {
    if (!recipient || !recipient.email) return;

    const subject = `[PINakee] New Comment on Ticket #${complaint.ticket_number}`;
    const body = `Dear ${recipient.first_name} ${recipient.last_name},

A new comment has been posted on ticket #${complaint.ticket_number} ("${complaint.title}").

Commented By: ${comment.author_name}
Comment:      "${comment.comment_text}"

Best regards,
PINakee System Dispatcher`;

    this.logEmail(recipient.email, subject, body);
  }

  /**
   * Dispatch notification when a ticket transitions to Resolved.
   * @param {Object} complaint - Ticket record details
   * @param {Object} creator - Ticket creator/customer details
   */
  async sendResolutionNotification(complaint, creator) {
    if (!creator || !creator.email) return;

    const subject = `[PINakee] Ticket Resolved: #${complaint.ticket_number}`;
    const body = `Dear ${creator.first_name} ${creator.last_name},

Good news! Your complaint ticket #${complaint.ticket_number} ("${complaint.title}") has been marked as RESOLVED.

Please review the resolution status. If the issue is fully addressed, you may close the ticket or post a confirmation comment.

Best regards,
PINakee Support Team`;

    this.logEmail(creator.email, subject, body);
  }
  /**
   * Create an in-app notification entry.
   */
  async createNotification(userId, complaintId, type, title, message) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      await dbPool.query(`
        INSERT INTO in_app_notifications (user_id, complaint_id, type, title, message)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, complaintId || null, type, title, message]);
    } catch (err) {
      console.error('Failed to create in-app notification:', err.message);
    }
  }

  /**
   * Notify admins when a complaint is created.
   */
  async notifyComplaintCreated(complaint) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const adminsResult = await dbPool.query("SELECT id FROM users WHERE role_id = 1 AND is_active = true");
      for (const admin of adminsResult.rows) {
        await this.createNotification(
          admin.id,
          complaint.id,
          'COMPLAINT_CREATED',
          'New Complaint Created',
          `A new complaint #${complaint.ticket_number} ("${complaint.title}") has been registered.`
        );
      }
    } catch (err) {
      console.error('Failed to notify complaint created:', err.message);
    }
  }

  /**
   * Notify assigned agent when a complaint is assigned.
   */
  async notifyComplaintAssigned(complaint, assigneeId) {
    if (!assigneeId) return;
    await this.createNotification(
      assigneeId,
      complaint.id,
      'COMPLAINT_ASSIGNED',
      'Complaint Assigned',
      `You have been assigned to complaint #${complaint.ticket_number} ("${complaint.title}").`
    );
  }

  /**
   * Notify relevant parties when status changes.
   */
  async notifyStatusChanged(complaint, oldStatus, newStatus) {
    // Notify customer if status resolves
    if (newStatus === 'Resolved') {
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'STATUS_RESOLVED',
        'Complaint Resolved',
        `Your complaint #${complaint.ticket_number} has been marked as Resolved.`
      );
    }
    // Notify customer if status closes
    if (newStatus === 'Closed') {
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'STATUS_CLOSED',
        'Complaint Closed',
        `Your complaint #${complaint.ticket_number} has been marked as Closed.`
      );
    }
    // Notify admins and department heads if marked in progress
    if (newStatus === 'In Progress') {
      const dbPool = require('../config/db');
      if (dbPool) {
        const receivers = [];
        const adminRes = await dbPool.query('SELECT id FROM users WHERE role_id = 1 AND is_active = true');
        receivers.push(...adminRes.rows.map(r => r.id));
        if (complaint.department_id) {
          const headRes = await dbPool.query('SELECT id FROM users WHERE role_id = 2 AND department_id = $1 AND is_active = true', [complaint.department_id]);
          receivers.push(...headRes.rows.map(r => r.id));
        }
        const uniqueIds = [...new Set(receivers)];
        for (const rId of uniqueIds) {
          await this.createNotification(
            rId,
            complaint.id,
            'STATUS_IN_PROGRESS',
            'Complaint In Progress',
            `Complaint #${complaint.ticket_number} ("${complaint.title}") is now In Progress.`
          );
        }
      }
    }
  }

  /**
   * Notify customer when FCR is submitted.
   */
  async notifyFcrSubmitted(complaint) {
    await this.createNotification(
      complaint.created_by_id,
      complaint.id,
      'FCR_SUBMITTED',
      'Service Call Report Submitted',
      `An Engineer has submitted the Service Call Report for complaint #${complaint.ticket_number}. Please review and confirm resolution.`
    );
  }

  /**
   * Notify internal staff when FCR is finalized/confirmed by customer.
   */
  async notifyFcrFinalized(complaint) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const receivers = [];
      if (complaint.assigned_to_id) {
        receivers.push(complaint.assigned_to_id);
      }
      const adminRes = await dbPool.query('SELECT id FROM users WHERE role_id = 1 AND is_active = true');
      receivers.push(...adminRes.rows.map(r => r.id));
      if (complaint.department_id) {
        const headRes = await dbPool.query('SELECT id FROM users WHERE role_id = 2 AND department_id = $1 AND is_active = true', [complaint.department_id]);
        receivers.push(...headRes.rows.map(r => r.id));
      }
      const uniqueIds = [...new Set(receivers)];
      for (const rId of uniqueIds) {
        await this.createNotification(
          rId,
          complaint.id,
          'FCR_FINALIZED',
          'Service Call Report Finalized',
          `Customer has confirmed and finalized the Service Call Report for complaint #${complaint.ticket_number}.`
        );
      }
    } catch (err) {
      console.error('Failed to notify FCR finalized:', err.message);
    }
  }

  /**
   * Dispatch SLA breach notification.
   */
  async sendSlaBreachedEmail(complaint, recipient) {
    if (!recipient || !recipient.email) return;

    const subject = `[PINakee] [URGENT] SLA BREACHED: Ticket #${complaint.ticket_number}`;
    const body = `Dear ${recipient.first_name} ${recipient.last_name},

A complaint ticket has breached its Service Level Agreement (SLA) resolution window.

Ticket Reference: #${complaint.ticket_number}
Title:            ${complaint.title}
Due Date:         ${complaint.due_date}

Please check the system immediately to investigate the delay.

Best regards,
PINakee SLA Escalation Monitor`;

    this.logEmail(recipient.email, subject, body);
  }

  /**
   * Notify department heads or admins when an SLA is breached.
   */
  async notifySlaBreached(complaint, deptId) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const receivers = [];
      // 1. Get Dept Head for the department
      if (deptId) {
        const headRes = await dbPool.query(
          'SELECT u.id, u.first_name, u.last_name, u.email FROM users u' +
          ' JOIN roles r ON u.role_id = r.id' +
          ' WHERE r.name = \'DEPT_HEAD\' AND u.department_id = $1 AND u.is_active = true',
          [deptId]
        );
        receivers.push(...headRes.rows);
      }

      // 2. If no department or no dept head, notify admins
      if (receivers.length === 0) {
        const adminRes = await dbPool.query(
          'SELECT u.id, u.first_name, u.last_name, u.email FROM users u' +
          ' JOIN roles r ON u.role_id = r.id' +
          ' WHERE r.name = \'ADMIN\' AND u.is_active = true'
        );
        receivers.push(...adminRes.rows);
      }

      // De-duplicate receivers by user id
      const uniqueReceivers = [];
      const seenIds = new Set();
      for (const r of receivers) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          uniqueReceivers.push(r);
        }
      }

      for (const receiver of uniqueReceivers) {
        // Create in-app notification
        await this.createNotification(
          receiver.id,
          complaint.id,
          'SLA_BREACHED',
          'SLA Deadline Breached',
          `Complaint #${complaint.ticket_number} ("${complaint.title}") has breached its SLA deadline.`
        );

        // Send email outbox log
        await this.sendSlaBreachedEmail(complaint, receiver);
      }
    } catch (err) {
      console.error('Failed to notify SLA breached:', err.message);
    }
  }
}

module.exports = new NotificationService();
