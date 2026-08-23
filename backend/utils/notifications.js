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
}

module.exports = new NotificationService();
