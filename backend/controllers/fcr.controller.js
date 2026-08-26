const dbPool = require('../config/db');
const logger = require('../utils/logger');
const PDFDocument = require('pdfkit');

/**
 * Fetch FCR for a complaint
 * GET /api/complaints/:id/fcr
 */
const getFcr = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint and FCR
    const query = `
      SELECT c.*, fcr.id AS fcr_id, fcr.visit_date, fcr.visit_start_time, fcr.visit_end_time,
             fcr.diagnosis, fcr.action_taken, fcr.parts_replaced, fcr.activity_code,
             fcr.suggestions, fcr.customer_feedback, fcr.customer_rating, fcr.status AS fcr_status,
             fcr.customer_confirmed_at
      FROM complaints c
      LEFT JOIN field_call_reports fcr ON c.id = fcr.complaint_id
      WHERE c.id = $1
    `;
    const result = await dbPool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = result.rows[0];

    // Enforce authorization
    const isAdmin = user.role === 'ADMIN';
    const isAssignee = user.role === 'AGENT' && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;
    const isDeptHead = user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id;

    if (!isAdmin && !isAssignee && !isCreator && !isDeptHead) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to view this FCR' });
    }

    // If FCR doesn't exist, return success with null data
    if (!complaint.fcr_id) {
      return res.status(200).json({ success: true, data: null });
    }

    // Prepare response FCR object
    const fcrData = {
      id: complaint.fcr_id,
      complaint_id: complaint.id,
      ticket_number: complaint.ticket_number,
      visit_date: complaint.visit_date,
      visit_start_time: complaint.visit_start_time,
      visit_end_time: complaint.visit_end_time,
      diagnosis: complaint.diagnosis,
      action_taken: complaint.action_taken,
      parts_replaced: complaint.parts_replaced,
      activity_code: complaint.activity_code,
      suggestions: complaint.suggestions,
      customer_feedback: complaint.customer_feedback,
      customer_rating: complaint.customer_rating,
      status: complaint.fcr_status,
      customer_confirmed_at: complaint.customer_confirmed_at
    };

    return res.status(200).json({ success: true, data: fcrData });

  } catch (error) {
    console.error('Get FCR error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve FCR details' });
  }
};

/**
 * Helper to validate visit date and times
 */
const validateFcrTimes = (visit_date, visit_start_time, visit_end_time) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Allow until end of day today

  const inputDate = new Date(visit_date);
  if (inputDate > today) {
    return 'Visit date cannot be in the future';
  }

  // Parse start/end times. We assume standard HH:MM format
  const startParts = visit_start_time.split(':').map(Number);
  const endParts = visit_end_time.split(':').map(Number);

  if (startParts.length < 2 || endParts.length < 2) {
    return 'Invalid time format';
  }

  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];

  if (startMinutes >= endMinutes) {
    return 'Visit start time must be before visit end time';
  }

  return null;
};

/**
 * Create or save FCR as Draft
 * POST /api/complaints/:id/fcr
 */
const createFcrDraft = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    visit_date,
    visit_start_time,
    visit_end_time,
    diagnosis,
    action_taken,
    parts_replaced,
    activity_code,
    suggestions
  } = req.body;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint details
    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: must be the assigned agent
    if (user.role !== 'AGENT' || complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned representative can manage FCR records' });
    }

    // Check if FCR already exists
    const fcrCheck = await dbPool.query('SELECT id FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'FCR record already exists for this complaint. Use PUT to update draft.' });
    }

    // Validate date and times (if provided)
    if (visit_date && visit_start_time && visit_end_time) {
      const timeError = validateFcrTimes(visit_date, visit_start_time, visit_end_time);
      if (timeError) {
        return res.status(400).json({ success: false, message: timeError });
      }
    } else {
      return res.status(400).json({ success: false, message: 'visit_date, visit_start_time, and visit_end_time are required' });
    }

    // Insert FCR draft
    const insertQuery = `
      INSERT INTO field_call_reports (
        complaint_id, visit_date, visit_start_time, visit_end_time,
        diagnosis, action_taken, parts_replaced, activity_code,
        suggestions, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Draft')
      RETURNING *
    `;
    const result = await dbPool.query(insertQuery, [
      id,
      visit_date,
      visit_start_time,
      visit_end_time,
      diagnosis || '',
      action_taken || '',
      parts_replaced || '',
      activity_code || '',
      suggestions || ''
    ]);

    return res.status(201).json({
      success: true,
      message: 'FCR draft saved successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create FCR draft error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save FCR draft' });
  }
};

/**
 * Update FCR Draft
 * PUT /api/complaints/:id/fcr
 */
const updateFcrDraft = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    visit_date,
    visit_start_time,
    visit_end_time,
    diagnosis,
    action_taken,
    parts_replaced,
    activity_code,
    suggestions
  } = req.body;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint details
    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: must be the assigned agent
    if (user.role !== 'AGENT' || complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned representative can manage FCR records' });
    }

    // Verify FCR exists and is in Draft status
    const fcrCheck = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FCR record not found' });
    }

    const fcr = fcrCheck.rows[0];
    if (fcr.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only FCR records in Draft status can be modified' });
    }

    // Validate times by merging new inputs with existing database records
    if (visit_date || visit_start_time || visit_end_time) {
      const existingDateStr = fcr.visit_date instanceof Date 
        ? fcr.visit_date.toISOString().substring(0, 10) 
        : new Date(fcr.visit_date).toISOString().substring(0, 10);
      
      const mergedDate = visit_date || existingDateStr;
      const mergedStart = visit_start_time || fcr.visit_start_time.substring(0, 5);
      const mergedEnd = visit_end_time || fcr.visit_end_time.substring(0, 5);

      const timeError = validateFcrTimes(mergedDate, mergedStart, mergedEnd);
      if (timeError) {
        return res.status(400).json({ success: false, message: timeError });
      }
    }

    // Update FCR draft
    const updateQuery = `
      UPDATE field_call_reports
      SET visit_date = COALESCE($1, visit_date),
          visit_start_time = COALESCE($2, visit_start_time),
          visit_end_time = COALESCE($3, visit_end_time),
          diagnosis = COALESCE($4, diagnosis),
          action_taken = COALESCE($5, action_taken),
          parts_replaced = COALESCE($6, parts_replaced),
          activity_code = COALESCE($7, activity_code),
          suggestions = COALESCE($8, suggestions)
      WHERE complaint_id = $9
      RETURNING *
    `;
    const result = await dbPool.query(updateQuery, [
      visit_date,
      visit_start_time,
      visit_end_time,
      diagnosis,
      action_taken,
      parts_replaced,
      activity_code,
      suggestions,
      id
    ]);

    return res.status(200).json({
      success: true,
      message: 'FCR draft updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update FCR draft error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update FCR draft' });
  }
};

/**
 * Submit FCR (Transitions ticket status to Resolved)
 * POST /api/complaints/:id/fcr/submit
 */
const submitFcr = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint details
    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: must be the assigned agent
    if (user.role !== 'AGENT' || complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned representative can manage FCR records' });
    }

    // Fetch FCR Details
    const fcrCheck = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FCR record not found. Please save a draft first.' });
    }

    const fcr = fcrCheck.rows[0];
    if (fcr.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'FCR record has already been submitted' });
    }

    // Check mandatory fields for submission
    if (!fcr.diagnosis.trim() || !fcr.action_taken.trim() || !fcr.activity_code.trim()) {
      return res.status(400).json({ success: false, message: 'Diagnosis, Action Taken, and Activity Code are mandatory for FCR submission' });
    }

    // Check parent complaint status (must be Assigned or In Progress)
    const activeStatuses = await dbPool.query("SELECT id FROM complaint_statuses WHERE name IN ('Assigned', 'In Progress')");
    const activeStatusIds = activeStatuses.rows.map(s => s.id);
    if (!activeStatusIds.includes(complaint.status_id)) {
      return res.status(400).json({ success: false, message: 'Tickets can only resolve if their status is currently Assigned or In Progress' });
    }

    // Retrieve Resolved status ID
    const resolvedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Resolved'");
    const resolvedStatusId = resolvedStatusResult.rows[0]?.id;

    if (!resolvedStatusId) {
      return res.status(500).json({ success: false, message: 'Resolved status metadata is missing in the database' });
    }

    // Execute state transitions
    await dbPool.query("UPDATE field_call_reports SET status = 'Submitted' WHERE complaint_id = $1", [id]);
    await dbPool.query("UPDATE complaints SET status_id = $1 WHERE id = $2", [resolvedStatusId, id]);

    // Log in status history audit
    const auditRemark = 'FCR submitted. Ticket resolved.';
    await dbPool.query(`
      INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user.id, complaint.status_id, resolvedStatusId, auditRemark]);

    logger.audit('COMPLAINT_RESOLVED', { complaintId: id, ticketNumber: complaint.ticket_number }, user, req.ip);

    const notifications = require('../utils/notifications');
    notifications.notifyFcrSubmitted(complaint).catch(err => console.error('Failed to trigger FCR submitted in-app notification:', err));
    notifications.notifyStatusChanged(complaint, 'In Progress', 'Resolved').catch(err => console.error('Failed to trigger Resolved status in-app notification:', err));

    // Send email notification to creator
    const creatorResult = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [complaint.created_by_id]);
    if (creatorResult.rows.length > 0) {
      const creatorUser = creatorResult.rows[0];
      notifications.sendResolutionNotification({
        ticket_number: complaint.ticket_number,
        title: complaint.title
      }, creatorUser).catch(err => console.error('Failed to notify creator of resolution:', err));
    }

    return res.status(200).json({
      success: true,
      message: 'FCR submitted successfully and ticket marked as Resolved'
    });

  } catch (error) {
    console.error('Submit FCR error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit FCR' });
  }
};

/**
 * Customer Confirm FCR (Finalize FCR -> Transitions ticket status to Closed)
 * POST /api/complaints/:id/fcr/confirm
 */
const confirmFcr = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const { customer_feedback, customer_rating } = req.body;

  if (customer_rating === undefined || customer_rating === null) {
    return res.status(400).json({ success: false, message: 'customer_rating is required for confirmation' });
  }

  const rating = parseInt(customer_rating);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5 stars' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint details
    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: must be the creator (Customer) of the complaint
    if (complaint.created_by_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the ticket creator can sign off and finalize' });
    }

    // Retrieve FCR details
    const fcrCheck = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'FCR record not found' });
    }

    const fcr = fcrCheck.rows[0];
    if (fcr.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Sign-off is only allowed on Submitted FCR records' });
    }

    // Retrieve Closed status ID
    const closedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedStatusId = resolvedStatusId = closedStatusResult.rows[0]?.id;

    if (!closedStatusId) {
      return res.status(500).json({ success: false, message: 'Closed status metadata is missing in the database' });
    }

    // Execute transitions
    const finalizeQuery = `
      UPDATE field_call_reports
      SET status = 'Finalized',
          customer_feedback = $1,
          customer_rating = $2,
          customer_confirmed_at = CURRENT_TIMESTAMP
      WHERE complaint_id = $3
    `;
    await dbPool.query(finalizeQuery, [customer_feedback || '', rating, id]);
    await dbPool.query("UPDATE complaints SET status_id = $1 WHERE id = $2", [closedStatusId, id]);

    // Log history
    const auditRemark = `Ticket confirmed and closed by customer (Rating: ${rating}/5)`;
    await dbPool.query(`
      INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user.id, complaint.status_id, closedStatusId, auditRemark]);

    logger.audit('COMPLAINT_CLOSED', { complaintId: id, ticketNumber: complaint.ticket_number }, user, req.ip);

    const notifications = require('../utils/notifications');
    notifications.notifyFcrFinalized(complaint).catch(err => console.error('Failed to trigger FCR finalized in-app notification:', err));
    notifications.notifyStatusChanged(complaint, 'Resolved', 'Closed').catch(err => console.error('Failed to trigger Closed status in-app notification:', err));

    return res.status(200).json({
      success: true,
      message: 'FCR finalized and ticket successfully closed'
    });

  } catch (error) {
    console.error('Confirm FCR error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to finalize FCR sign-off' });
  }
};

/**
 * Generate FCR PDF report
 * GET /api/complaints/:id/fcr/pdf
 */
const downloadFcrPdf = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint and FCR
    const query = `
      SELECT c.*, fcr.id AS fcr_id, fcr.visit_date, fcr.visit_start_time, fcr.visit_end_time,
             fcr.diagnosis, fcr.action_taken, fcr.parts_replaced, fcr.activity_code,
             fcr.suggestions, fcr.customer_feedback, fcr.customer_rating, fcr.status AS fcr_status,
             fcr.customer_confirmed_at, cc.name AS category, cp.name AS priority,
             dept.name AS department, u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name
      FROM complaints c
      LEFT JOIN field_call_reports fcr ON c.id = fcr.complaint_id
      JOIN complaint_categories cc ON c.category_id = cc.id
      JOIN complaint_priorities cp ON c.priority_id = cp.id
      LEFT JOIN departments dept ON c.department_id = dept.id
      LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
      WHERE c.id = $1
    `;
    const result = await dbPool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = result.rows[0];

    // Enforce authorization
    const isAdmin = user.role === 'ADMIN';
    const isAssignee = user.role === 'AGENT' && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;
    const isDeptHead = user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id;

    if (!isAdmin && !isAssignee && !isCreator && !isDeptHead) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to access this PDF' });
    }

    if (!complaint.fcr_id) {
      return res.status(404).json({ success: false, message: 'No FCR record exists for this complaint yet' });
    }

    const fcr = {
      id: complaint.fcr_id,
      visit_date: complaint.visit_date,
      visit_start_time: complaint.visit_start_time,
      visit_end_time: complaint.visit_end_time,
      diagnosis: complaint.diagnosis,
      action_taken: complaint.action_taken,
      parts_replaced: complaint.parts_replaced,
      activity_code: complaint.activity_code,
      suggestions: complaint.suggestions,
      customer_feedback: complaint.customer_feedback,
      customer_rating: complaint.customer_rating,
      status: complaint.fcr_status,
      customer_confirmed_at: complaint.customer_confirmed_at
    };

    if (fcr.status !== 'Submitted' && fcr.status !== 'Finalized') {
      return res.status(400).json({ success: false, message: 'FCR reports can only be printed/downloaded after submission' });
    }

    // Set response headers to stream PDF binary
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fcr_ticket_${complaint.ticket_number}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });

    // Stream PDF directly to HTTP response
    doc.pipe(res);

    // Header title
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e293b').text('PINakee Support Systems', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Digital Field Service Outpost', { align: 'center' });
    doc.moveDown(1.5);

    // Title banner
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f766e').text('FIELD CALL REPORT (FCR)', { align: 'center' });
    doc.moveDown(1);

    // Draw line divider
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Section 1: Ticket Metadata
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('1. Service Call Reference');
    doc.moveDown(0.4);
    doc.fontSize(9).font('Helvetica').fillColor('#334155');
    doc.text(`Ticket Number:    #${complaint.ticket_number}`);
    doc.text(`Title / Issue:    ${complaint.title}`);
    doc.text(`Category:         ${complaint.category}`);
    doc.text(`Priority Level:   ${complaint.priority}`);
    doc.text(`Department:       ${complaint.department || 'General'}`);
    doc.moveDown(1);

    // Section 2: Timing
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('2. Visit & Call Timing');
    doc.moveDown(0.4);
    doc.fontSize(9).text(`Visit Date:       ${new Date(fcr.visit_date).toLocaleDateString()}`);
    doc.text(`Start Time:       ${fcr.visit_start_time}`);
    doc.text(`End Time:         ${fcr.visit_end_time}`);
    doc.moveDown(1);

    // Section 3: Diagnosis
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('3. Diagnostics, Findings & Actions');
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Problem Reported:');
    doc.font('Helvetica').text(complaint.description);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Diagnosis / Findings:');
    doc.font('Helvetica').text(fcr.diagnosis);
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Action Taken:');
    doc.font('Helvetica').text(fcr.action_taken);
    doc.moveDown(1);

    // Section 4: Parts & Activity Code
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('4. Parts, Replacements & Activity');
    doc.moveDown(0.4);
    doc.font('Helvetica').text(`Activity Code:    ${fcr.activity_code}`);
    doc.text(`Parts Replaced:   ${fcr.parts_replaced || 'None'}`);
    doc.text(`Recommendations:  ${fcr.suggestions || 'None'}`);
    doc.moveDown(1);

    // Section 5: Sign-off Info
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1e293b').text('5. Customer Feedback & Confirmation');
    doc.moveDown(0.4);
    doc.font('Helvetica').text(`FCR Status:       ${fcr.status}`);
    if (fcr.status === 'Finalized') {
      doc.text(`Confirmed At:     ${new Date(fcr.customer_confirmed_at).toLocaleString()}`);
      doc.text(`Customer Rating:  ${fcr.customer_rating} / 5 Stars`);
      doc.text(`Feedback Details: "${fcr.customer_feedback || 'No comments left'}"`);
    } else {
      doc.text('Customer Confirmation Status: Awaiting Customer sign-off.');
    }
    doc.moveDown(2);

    // Signatures
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1.5);
    
    const ySign = doc.y;
    doc.fontSize(9).text('_________________________________', 50, ySign);
    const assigneeName = complaint.assignee_first_name ? `${complaint.assignee_first_name} ${complaint.assignee_last_name}` : 'Assigned Agent';
    doc.text(`Engineer Signature (${assigneeName})`, 50, ySign + 15);

    doc.text('_________________________________', 350, ySign);
    doc.text('Customer Signature (Sign-off)', 350, ySign + 15);

    doc.end();

  } catch (error) {
    console.error('Download FCR PDF error:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate FCR PDF document' });
    }
  }
};

module.exports = {
  getFcr,
  createFcrDraft,
  updateFcrDraft,
  submitFcr,
  confirmFcr,
  downloadFcrPdf
};
