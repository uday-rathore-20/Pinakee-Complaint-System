/**
 * Decoupled Notification Service Manager
 * Handles formatting email templates and dispatching logs during development.
 * Designed to be easily replaced by SMTP client/Nodemailer in production.
 */
class NotificationService {
  /**
   * Log helper representing email transmission. Now inserts into email_outbox.
   */
  async logEmail(to, subject, body, txClient = null) {
    const dbPool = require('../config/db');
    if (!dbPool) {
      console.error('Cannot queue email: database pool is not available.');
      return;
    }

    try {
      const queryText = `
        INSERT INTO email_outbox (recipient, subject, body, status, attempts)
        VALUES ($1, $2, $3, 'Pending', 0)
        RETURNING id
      `;
      const queryArgs = [to, subject, body];

      let res;
      if (txClient) {
        res = await txClient.query(queryText, queryArgs);
      } else {
        res = await dbPool.query(queryText, queryArgs);
      }

      const emailId = res.rows[0]?.id;
      // Keep console log debug output or a minimal indicator if needed
    } catch (err) {
      console.error('Failed to queue email into email_outbox:', err.message);
    }
  }

  /**
   * Dispatch notification when a ticket is assigned.
   * @param {Object} complaint - Ticket record details
   * @param {Object} assignee - Assignee user details (first_name, last_name, email)
   */
  async sendAssignmentNotification(complaint, assignee, txClient = null) {
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

    await this.logEmail(assignee.email, subject, body, txClient);
  }

  /**
   * Dispatch notification when a comment is added to a ticket.
   * @param {Object} complaint - Ticket record details
   * @param {Object} comment - Comment content details
   * @param {Object} recipient - Recipient user details (first_name, last_name, email)
   */
  async sendCommentNotification(complaint, comment, recipient, txClient = null) {
    if (!recipient || !recipient.email) return;

    const subject = `[PINakee] New Comment on Ticket #${complaint.ticket_number}`;
    const body = `Dear ${recipient.first_name} ${recipient.last_name},

A new comment has been posted on ticket #${complaint.ticket_number} ("${complaint.title}").

Commented By: ${comment.author_name}
Comment:      "${comment.comment_text}"

Best regards,
PINakee System Dispatcher`;

    await this.logEmail(recipient.email, subject, body, txClient);
  }

  /**
   * Dispatch notification when a ticket transitions to Resolved.
   * @param {Object} complaint - Ticket record details
   * @param {Object} creator - Ticket creator/customer details
   */
  async sendResolutionNotification(complaint, creator, txClient = null) {
    if (!creator || !creator.email) return;

    const subject = `[PINakee] Ticket Resolved: #${complaint.ticket_number}`;
    const body = `Dear ${creator.first_name} ${creator.last_name},

Good news! Your complaint ticket #${complaint.ticket_number} ("${complaint.title}") has been marked as RESOLVED.

Please review the resolution status. If the issue is fully addressed, you may close the ticket or post a confirmation comment.

Best regards,
PINakee Support Team`;

    await this.logEmail(creator.email, subject, body, txClient);
  }
  /**
   * Create an in-app notification entry.
   */
  async createNotification(userId, complaintId, type, title, message, txClient = null) {
    const dbPool = require('../config/db');
    if (!dbPool && !txClient) return null;
    try {
      const queryText = `
        INSERT INTO in_app_notifications (user_id, complaint_id, type, title, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const queryParams = [userId, complaintId || null, type, title, message];

      const res = txClient 
        ? await txClient.query(queryText, queryParams)
        : await dbPool.query(queryText, queryParams);

      const notification = res.rows[0];

      // Emit private WebSocket notification event
      try {
        const { emitNotificationNew } = require('./socket');
        emitNotificationNew(userId, notification);
      } catch (socketErr) {
        // Socket emission non-blocking warning
      }

      return notification;
    } catch (err) {
      console.error('Failed to create in-app notification:', err.message);
      return null;
    }
  }

  /**
   * Send 24-hour resolution confirmation reminder to ticket creator.
   */
  async sendResolutionReminder24h(complaint, creator, txClient = null) {
    if (!creator || !creator.id) return;

    await this.createNotification(
      creator.id,
      complaint.id,
      'SLA_REMINDER_24H',
      'Resolution Confirmation Reminder',
      `Your complaint #${complaint.ticket_number} ("${complaint.title}") was marked as Resolved 24 hours ago. Please review and confirm resolution or reopen if needed.`,
      txClient
    );

    if (creator.email) {
      const subject = `[PINakee] Reminder: Please Confirm Resolution for Ticket #${complaint.ticket_number}`;
      const body = `Dear ${creator.first_name || 'Valued Customer'} ${creator.last_name || ''},

Your service complaint ticket #${complaint.ticket_number} ("${complaint.title}") was marked as RESOLVED by our field engineering team 24 hours ago.

Please log in to the PINakee portal to:
1. Confirm the resolution and rate the service experience, OR
2. Reopen the complaint if the issue persists.

Note: Tickets with no customer response are automatically closed 72 hours after service resolution.

Best regards,
PINakee Customer Support`;
      await this.logEmail(creator.email, subject, body, txClient);
    }
  }

  /**
   * Send 48-hour resolution confirmation reminder to ticket creator.
   */
  async sendResolutionReminder48h(complaint, creator, txClient = null) {
    if (!creator || !creator.id) return;

    await this.createNotification(
      creator.id,
      complaint.id,
      'SLA_REMINDER_48H',
      'Second Reminder: Confirm Service Resolution',
      `Second Reminder: Complaint #${complaint.ticket_number} is awaiting confirmation and will automatically close in 24 hours if no action is taken.`,
      txClient
    );

    if (creator.email) {
      const subject = `[PINakee] [URGENT] Second Reminder: Ticket #${complaint.ticket_number} will auto-close in 24 hours`;
      const body = `Dear ${creator.first_name || 'Valued Customer'} ${creator.last_name || ''},

This is a second reminder regarding your complaint ticket #${complaint.ticket_number} ("${complaint.title}").

Our engineering team completed service resolution 48 hours ago. Please confirm whether the issue is resolved to your satisfaction.

If no response or reopen is received within the next 24 hours, this ticket will be automatically closed by the system.

Best regards,
PINakee Customer Support`;
      await this.logEmail(creator.email, subject, body, txClient);
    }
  }

  /**
   * Notify customer when a complaint is automatically closed by the system after 72 hours.
   */
  async notifyAutoClosed(complaint, creator, txClient = null) {
    if (!creator || !creator.id) return;

    await this.createNotification(
      creator.id,
      complaint.id,
      'STATUS_CLOSED',
      'Complaint Auto-Closed',
      `Your complaint #${complaint.ticket_number} ("${complaint.title}") has been automatically closed after 72 hours of customer inactivity following service resolution.`,
      txClient
    );

    if (creator.email) {
      const subject = `[PINakee] Ticket Auto-Closed: #${complaint.ticket_number}`;
      const body = `Dear ${creator.first_name || 'Valued Customer'} ${creator.last_name || ''},

Your complaint ticket #${complaint.ticket_number} ("${complaint.title}") has been automatically closed after 72 hours without response following resolution.

Thank you for choosing PINakee Service Management. If you require further assistance, you may log a new service complaint at any time.

Best regards,
PINakee Support Team`;
      await this.logEmail(creator.email, subject, body, txClient);
    }
  }

  /**
   * Notify admins when a complaint is created.
   */
  async notifyComplaintCreated(complaint) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const adminsResult = await dbPool.query("SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'ADMIN' AND u.is_active = true");
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
      'Complaint Assigned - Claim Required',
      `New complaint #${complaint.ticket_number} ("${complaint.title}") assigned to you. Please claim the ticket to begin work.`
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
  async sendSlaBreachedEmail(complaint, recipient, txClient = null) {
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

    await this.logEmail(recipient.email, subject, body, txClient);
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

  /**
   * Notify Customer and Admins when Engineer accepts the complaint.
   */
  async notifyComplaintAccepted(complaint, engineerName) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      // Notify customer
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'COMPLAINT_ACCEPTED',
        'Service Ticket Accepted',
        `Engineer ${engineerName || 'assigned'} has accepted your complaint #${complaint.ticket_number}.`
      );

      // Notify admins
      const adminRes = await dbPool.query(
        'SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = \'ADMIN\' AND u.is_active = true'
      );
      for (const a of adminRes.rows) {
        await this.createNotification(
          a.id,
          complaint.id,
          'COMPLAINT_ACCEPTED',
          'Engineer Accepted Complaint',
          `Engineer ${engineerName || ''} accepted ticket #${complaint.ticket_number}.`
        );
      }
    } catch (err) {
      console.error('Failed to notify complaint accepted:', err.message);
    }
  }

  /**
   * Notify Customer when work begins (In Progress).
   */
  async notifyWorkStarted(complaint) {
    try {
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'WORK_STARTED',
        'Work In Progress',
        `Engineer has commenced active work on complaint #${complaint.ticket_number}.`
      );
    } catch (err) {
      console.error('Failed to notify work started:', err.message);
    }
  }

  /**
   * Notify Customer and Admins when complaint is put on hold.
   */
  async notifyComplaintOnHold(complaint, reason) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'COMPLAINT_ON_HOLD',
        'Complaint Placed On Hold',
        `Complaint #${complaint.ticket_number} is on hold. Reason: ${reason}`
      );

      const adminRes = await dbPool.query(
        'SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = \'ADMIN\' AND u.is_active = true'
      );
      for (const a of adminRes.rows) {
        await this.createNotification(
          a.id,
          complaint.id,
          'COMPLAINT_ON_HOLD',
          'Complaint Placed On Hold',
          `Ticket #${complaint.ticket_number} was placed on hold. Reason: ${reason}`
        );
      }
    } catch (err) {
      console.error('Failed to notify complaint on hold:', err.message);
    }
  }

  /**
   * Notify Customer when complaint is resumed.
   */
  async notifyComplaintResumed(complaint) {
    try {
      await this.createNotification(
        complaint.created_by_id,
        complaint.id,
        'COMPLAINT_RESUMED',
        'Complaint Resumed',
        `Work has resumed on complaint #${complaint.ticket_number}.`
      );
    } catch (err) {
      console.error('Failed to notify complaint resumed:', err.message);
    }
  }

  /**
   * Notify Admins when Customer reopens a complaint.
   */
  async notifyComplaintReopened(complaint, reason, customerName) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const adminRes = await dbPool.query(
        'SELECT u.id, u.first_name, u.last_name, u.email FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = \'ADMIN\' AND u.is_active = true'
      );
      for (const admin of adminRes.rows) {
        await this.createNotification(
          admin.id,
          complaint.id,
          'COMPLAINT_REOPENED',
          'Customer Reopened Complaint — Admin Review Required',
          `Customer ${customerName || ''} reopened ticket #${complaint.ticket_number}. Reason: "${reason}"`
        );

        // Queue email notification
        const subject = `[PINakee] [ACTION REQUIRED] Customer Reopened Ticket #${complaint.ticket_number}`;
        const body = `Dear ${admin.first_name} ${admin.last_name},

Customer ${customerName || 'The customer'} has rejected the resolution for complaint #${complaint.ticket_number} and reopened the ticket.

Customer Reason / Remarks:
"${reason}"

The ticket has been placed in "Admin Review". Please review the complaint history and assign an engineer.

Best regards,
PINakee Service Dispatcher`;
        await this.logEmail(admin.email, subject, body);
      }
    } catch (err) {
      console.error('Failed to notify complaint reopened:', err.message);
    }
  }

  /**
   * Notify Admins and Engineer when a complaint is cancelled.
   */
  async notifyComplaintCancelled(complaint, reason) {
    const dbPool = require('../config/db');
    if (!dbPool) return;
    try {
      const adminRes = await dbPool.query(
        'SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = \'ADMIN\' AND u.is_active = true'
      );
      for (const a of adminRes.rows) {
        await this.createNotification(
          a.id,
          complaint.id,
          'COMPLAINT_CANCELLED',
          'Complaint Cancelled',
          `Ticket #${complaint.ticket_number} was cancelled. ${reason ? `Reason: ${reason}` : ''}`
        );
      }
    } catch (err) {
      console.error('Failed to notify complaint cancelled:', err.message);
    }
  }
}

module.exports = new NotificationService();
