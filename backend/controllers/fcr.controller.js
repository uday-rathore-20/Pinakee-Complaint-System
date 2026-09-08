const dbPool = require('../config/db');
const logger = require('../utils/logger');
const PDFDocument = require('pdfkit');

/**
 * Generate sequential FCR Number: FCR-YYYY-MM-XXXX
 */
const generateFcrNumber = async (client) => {
  const seqRes = await client.query("SELECT nextval('fcr_number_seq') AS seq");
  const seq = seqRes.rows[0].seq;
  const now = new Date();
  const yearMonth = now.toISOString().substring(0, 7); // YYYY-MM
  return `FCR-${yearMonth}-${String(seq).padStart(4, '0')}`;
};

/**
 * Helper to validate visit date and times
 */
const validateFcrTimes = (visit_date, visit_start_time, visit_end_time) => {
  if (!visit_date || !visit_start_time || !visit_end_time) return null;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const inputDate = new Date(visit_date);
  if (inputDate > today) {
    return 'Visit date cannot be in the future';
  }

  const startParts = String(visit_start_time).split(':').map(Number);
  const endParts = String(visit_end_time).split(':').map(Number);

  if (startParts.length < 2 || endParts.length < 2) {
    return 'Invalid time format. Please use HH:MM';
  }

  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];

  if (startMinutes >= endMinutes) {
    return 'Visit start time must be before visit end time';
  }

  return null;
};

/**
 * Fetch complete Digital FCR / Service Report for a complaint
 * GET /api/complaints/:id/fcr (or /api/complaints/:id/service-report)
 */
const getFcr = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint metadata
    const compQuery = `
      SELECT c.*,
             cs.name AS status_name,
             cp.name AS priority_name,
             cc.name AS category_name,
             dept.name AS department_name,
             u_creator.first_name AS creator_first_name,
             u_creator.last_name AS creator_last_name,
             u_creator.email AS creator_email,
             u_assignee.first_name AS assignee_first_name,
             u_assignee.last_name AS assignee_last_name,
             u_assignee.email AS assignee_email
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      JOIN complaint_priorities cp ON c.priority_id = cp.id
      LEFT JOIN complaint_categories cc ON c.category_id = cc.id
      LEFT JOIN departments dept ON c.department_id = dept.id
      LEFT JOIN users u_creator ON c.created_by_id = u_creator.id
      LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
      WHERE c.id = $1
    `;
    const compResult = await dbPool.query(compQuery, [id]);

    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compResult.rows[0];

    // Authorization checks
    const isAdmin = user.role === 'ADMIN';
    const isAssignee = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;
    const isDeptHead = user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id;

    if (!isAdmin && !isAssignee && !isCreator && !isDeptHead) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to view this Service Report' });
    }

    // 2. Fetch Customer Info
    const custRes = await dbPool.query(`
      SELECT cp.*, u.first_name, u.last_name, u.email,
             csl.location_name, csl.location_code, csl.address AS service_address,
             csl.city AS service_city, csl.state AS service_state, csl.pincode AS service_pincode,
             csl.contact_number AS location_contact_number
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      LEFT JOIN customer_service_locations csl ON csl.id = $2
      WHERE u.id = $1
    `, [complaint.created_by_id, complaint.service_location_id || null]);

    const custRow = custRes.rows[0] || {};
    const customer = {
      id: complaint.created_by_id,
      customer_code: custRow.customer_code || `CUST-${String(complaint.created_by_id).padStart(4, '0')}`,
      first_name: custRow.first_name || complaint.creator_first_name,
      last_name: custRow.last_name || complaint.creator_last_name,
      name: `${custRow.first_name || complaint.creator_first_name || ''} ${custRow.last_name || complaint.creator_last_name || ''}`.trim(),
      company_name: custRow.company_name || 'Individual Customer',
      customer_type: custRow.customer_type || 'Individual',
      email: custRow.email || complaint.creator_email,
      phone: custRow.location_contact_number || custRow.alternate_mobile || '',
      address: custRow.service_address || custRow.address_line1 || complaint.service_address_snapshot || '',
      city: custRow.service_city || custRow.city || '',
      state: custRow.service_state || custRow.state || '',
      pincode: custRow.service_pincode || custRow.pincode || '',
      location_name: custRow.location_name || 'Primary Site',
      location_code: custRow.location_code || ''
    };

    // 3. Fetch Engineer Info
    let engineer = null;
    if (complaint.assigned_to_id) {
      const engRes = await dbPool.query(`
        SELECT ep.*, u.first_name, u.last_name, u.email
        FROM users u
        LEFT JOIN engineer_profiles ep ON u.id = ep.user_id
        WHERE u.id = $1
      `, [complaint.assigned_to_id]);
      const engRow = engRes.rows[0] || {};
      engineer = {
        id: complaint.assigned_to_id,
        engineer_code: engRow.engineer_code || `ENG-${String(complaint.assigned_to_id).padStart(4, '0')}`,
        employee_id: engRow.employee_id || '',
        first_name: engRow.first_name || complaint.assignee_first_name,
        last_name: engRow.last_name || complaint.assignee_last_name,
        name: `${engRow.first_name || complaint.assignee_first_name || ''} ${engRow.last_name || complaint.assignee_last_name || ''}`.trim(),
        official_mobile: engRow.official_mobile || engRow.alternate_mobile || '',
        official_email: engRow.official_email || engRow.email || complaint.assignee_email || '',
        designation: engRow.designation || 'Field Service Engineer'
      };
    }

    // 4. Fetch FCR Record
    const fcrRes = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    const fcrRow = fcrRes.rows[0] || null;

    // 5. Fetch Devices
    const devicesRes = await dbPool.query(
      'SELECT * FROM service_report_devices WHERE complaint_id = $1 ORDER BY id ASC',
      [id]
    );

    // 6. Fetch Parts
    const partsRes = await dbPool.query(
      'SELECT * FROM service_report_parts WHERE complaint_id = $1 ORDER BY id ASC',
      [id]
    );

    // 7. Fetch Attachments
    const attachRes = await dbPool.query(`
      SELECT ca.id, ca.file_name, ca.file_size, ca.mime_type, ca.created_at,
             u.first_name, u.last_name, r.name AS role
      FROM complaint_attachments ca
      LEFT JOIN users u ON ca.uploaded_by_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE ca.complaint_id = $1
      ORDER BY ca.created_at DESC
    `, [id]);

    // 8. Derive Workflow Timestamps from Status History
    const historyRes = await dbPool.query(`
      SELECT csh.*, cs_new.name AS new_status_name
      FROM complaint_status_history csh
      JOIN complaint_statuses cs_new ON csh.new_status_id = cs_new.id
      WHERE csh.complaint_id = $1
      ORDER BY csh.changed_at ASC
    `, [id]);

    let reachedSiteTime = null;
    let workStartTime = null;
    let workCloseTime = null;
    let callCloseTime = null;

    historyRes.rows.forEach(h => {
      if (h.new_status_name === 'Accepted' && !reachedSiteTime) reachedSiteTime = h.changed_at;
      if (h.new_status_name === 'In Progress' && !workStartTime) workStartTime = h.changed_at;
      if (h.new_status_name === 'Resolved' && !workCloseTime) workCloseTime = h.changed_at;
      if (h.new_status_name === 'Closed' && !callCloseTime) callCloseTime = h.changed_at;
    });

    // Fetch reassignment requests history
    const reassignRes = await dbPool.query(`
      SELECT crr.*, 
             u_req.first_name AS requester_first_name, u_req.last_name AS requester_last_name,
             u_eng.first_name AS engineer_first_name, u_eng.last_name AS engineer_last_name,
             u_new.first_name AS new_engineer_first_name, u_new.last_name AS new_engineer_last_name,
             u_dec.first_name AS decider_first_name, u_dec.last_name AS decider_last_name
      FROM complaint_reassignment_requests crr
      LEFT JOIN users u_req ON crr.requested_by_id = u_req.id
      LEFT JOIN users u_eng ON crr.assigned_engineer_id = u_eng.id
      LEFT JOIN users u_new ON crr.new_engineer_id = u_new.id
      LEFT JOIN users u_dec ON crr.decided_by_id = u_dec.id
      WHERE crr.complaint_id = $1
      ORDER BY crr.requested_at DESC
    `, [id]);

    // If FCR doesn't exist yet, return template pre-populated from complaint
    if (!fcrRow) {
      const todayStr = new Date().toISOString().substring(0, 10);
      return res.status(200).json({
        success: true,
        data: {
          fcr: {
            id: null,
            complaint_id: complaint.id,
            ticket_number: complaint.ticket_number,
            fcr_number: null,
            call_type: 'Breakdown',
            problem_reported: complaint.description || '',
            diagnosis: '',
            diagnosed_problem: '',
            action_taken: '',
            resolution: '',
            suggestions: '',
            suggestion_to_client: '',
            engineer_remarks: '',
            client_remarks: '',
            parts_replaced: '',
            activity_code: 'ACT-01',
            delay_code: '',
            error_code: '',
            ip_address: '',
            subnet_mask: '',
            gateway: '',
            preferred_dns: '',
            alternate_dns: '',
            visit_date: todayStr,
            visit_start_time: '09:00',
            visit_end_time: '10:00',
            call_start_time: complaint.created_at,
            travel_start_time: null,
            reached_site_time: reachedSiteTime,
            work_start_time: workStartTime,
            work_close_time: workCloseTime,
            call_close_time: callCloseTime,
            status: 'Draft',
            customer_sign_name: customer.name,
            engineer_sign_name: engineer ? engineer.name : '',
            customer_feedback: '',
            customer_rating: null,
            customer_confirmed_at: null
          },
          customer,
          engineer,
          complaint: {
            id: complaint.id,
            ticket_number: complaint.ticket_number,
            title: complaint.title,
            description: complaint.description,
            priority: complaint.priority_name,
            category: complaint.category_name,
            department: complaint.department_name,
            status: complaint.status_name,
            created_at: complaint.created_at,
            due_date: complaint.due_date
          },
          devices: devicesRes.rows,
          parts: partsRes.rows,
          attachments: attachRes.rows,
          reassignmentRequests: reassignRes.rows
        }
      });
    }

    // Prepare full FCR response object
    const fcrData = {
      id: fcrRow.id,
      complaint_id: complaint.id,
      ticket_number: complaint.ticket_number,
      fcr_number: fcrRow.fcr_number,
      call_type: fcrRow.call_type || 'Breakdown',
      problem_reported: fcrRow.problem_reported || complaint.description || '',
      diagnosis: fcrRow.diagnosed_problem || fcrRow.diagnosis || '',
      diagnosed_problem: fcrRow.diagnosed_problem || fcrRow.diagnosis || '',
      action_taken: fcrRow.action_taken || '',
      resolution: fcrRow.resolution || '',
      suggestions: fcrRow.suggestion_to_client || fcrRow.suggestions || '',
      suggestion_to_client: fcrRow.suggestion_to_client || fcrRow.suggestions || '',
      engineer_remarks: fcrRow.engineer_remarks || '',
      client_remarks: fcrRow.client_remarks || '',
      parts_replaced: fcrRow.parts_replaced || '',
      activity_code: fcrRow.activity_code || 'ACT-01',
      delay_code: fcrRow.delay_code || '',
      error_code: fcrRow.error_code || '',
      ip_address: fcrRow.ip_address || '',
      subnet_mask: fcrRow.subnet_mask || '',
      gateway: fcrRow.gateway || '',
      preferred_dns: fcrRow.preferred_dns || '',
      alternate_dns: fcrRow.alternate_dns || '',
      visit_date: fcrRow.visit_date,
      visit_start_time: fcrRow.visit_start_time,
      visit_end_time: fcrRow.visit_end_time,
      call_start_time: fcrRow.call_start_time || complaint.created_at,
      travel_start_time: fcrRow.travel_start_time || null,
      reached_site_time: fcrRow.reached_site_time || reachedSiteTime,
      work_start_time: fcrRow.work_start_time || workStartTime,
      work_close_time: fcrRow.work_close_time || workCloseTime,
      call_close_time: fcrRow.call_close_time || callCloseTime,
      status: fcrRow.status,
      customer_sign_name: fcrRow.customer_sign_name || customer.name,
      customer_signature_data: fcrRow.customer_signature_data || '',
      engineer_sign_name: fcrRow.engineer_sign_name || (engineer ? engineer.name : ''),
      engineer_signature_data: fcrRow.engineer_signature_data || '',
      customer_feedback: fcrRow.customer_feedback,
      customer_rating: fcrRow.customer_rating,
      customer_confirmed_at: fcrRow.customer_confirmed_at,
      auto_closed_at: fcrRow.auto_closed_at || null,
      reminder_24h_sent_at: fcrRow.reminder_24h_sent_at || null,
      reminder_48h_sent_at: fcrRow.reminder_48h_sent_at || null,
      created_at: fcrRow.created_at,
      updated_at: fcrRow.updated_at
    };

    return res.status(200).json({
      success: true,
      data: {
        fcr: fcrData,
        customer,
        engineer,
        complaint: {
          id: complaint.id,
          ticket_number: complaint.ticket_number,
          title: complaint.title,
          description: complaint.description,
          priority: complaint.priority_name,
          category: complaint.category_name,
          department: complaint.department_name,
          status: complaint.status_name,
          created_at: complaint.created_at,
          due_date: complaint.due_date
        },
        devices: devicesRes.rows,
        parts: partsRes.rows,
        attachments: attachRes.rows,
        reassignmentRequests: reassignRes.rows
      }
    });

  } catch (error) {
    console.error('Get FCR error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to retrieve Service Report details: ${error.message}` });
  }
};

/**
 * Save FCR Draft (Handles creating new draft or updating existing draft)
 * POST /api/complaints/:id/fcr and PUT /api/complaints/:id/fcr
 */
const saveFcrDraft = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    visit_date,
    visit_start_time,
    visit_end_time,
    call_type,
    problem_reported,
    diagnosis,
    diagnosed_problem,
    action_taken,
    resolution,
    suggestions,
    suggestion_to_client,
    engineer_remarks,
    client_remarks,
    parts_replaced,
    activity_code,
    delay_code,
    error_code,
    ip_address,
    subnet_mask,
    gateway,
    preferred_dns,
    alternate_dns,
    devices,
    parts
  } = req.body;

  // Authorization: Only Assigned Engineer or Admin can save FCR drafts
  if (user.role === 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Customers cannot edit technical or service report fields'
    });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint
    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: If engineer, must be the assigned engineer
    if ((user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id !== user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only the assigned field engineer or an administrator can manage Service Reports'
      });
    }

    // Validate times if provided
    if (visit_date && visit_start_time && visit_end_time) {
      const timeError = validateFcrTimes(visit_date, visit_start_time, visit_end_time);
      if (timeError) {
        return res.status(400).json({ success: false, message: timeError });
      }
    }

    const diagVal = diagnosed_problem || diagnosis || '';
    const suggVal = suggestion_to_client || suggestions || '';
    const todayStr = new Date().toISOString().substring(0, 10);
    const vDate = visit_date || todayStr;
    const vStart = visit_start_time || '09:00';
    const vEnd = visit_end_time || '10:00';

    const client = await dbPool.connect();
    let savedFcr = null;

    try {
      await client.query('BEGIN');

      // Check if FCR already exists
      const fcrCheck = await client.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);

      if (fcrCheck.rows.length === 0) {
        // Create new FCR draft with auto-generated FCR number
        const newFcrNumber = await generateFcrNumber(client);

        const insertQuery = `
          INSERT INTO field_call_reports (
            complaint_id, fcr_number, call_type, problem_reported,
            visit_date, visit_start_time, visit_end_time,
            diagnosed_problem, diagnosis, action_taken, resolution,
            suggestion_to_client, suggestions, engineer_remarks, client_remarks,
            parts_replaced, activity_code, delay_code, error_code,
            ip_address, subnet_mask, gateway, preferred_dns, alternate_dns,
            call_start_time, status
          )
          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $8, $9, $10,
            $11, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, $20, $21, $22,
            $23, 'Draft'
          )
          RETURNING *
        `;
        const insertRes = await client.query(insertQuery, [
          id,
          newFcrNumber,
          call_type || 'Breakdown',
          problem_reported || complaint.description || '',
          vDate,
          vStart,
          vEnd,
          diagVal,
          action_taken || '',
          resolution || '',
          suggVal,
          engineer_remarks || '',
          client_remarks || '',
          parts_replaced || '',
          activity_code || 'ACT-01',
          delay_code || '',
          error_code || '',
          ip_address || '',
          subnet_mask || '',
          gateway || '',
          preferred_dns || '',
          alternate_dns || '',
          complaint.created_at
        ]);
        savedFcr = insertRes.rows[0];

      } else {
        // Update existing FCR draft
        const existingFcr = fcrCheck.rows[0];
        if (existingFcr.status !== 'Draft' && user.role !== 'ADMIN') {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ success: false, message: 'Only Service Reports in Draft status can be modified' });
        }

        // Ensure FCR number exists
        let fcrNum = existingFcr.fcr_number;
        if (!fcrNum) {
          fcrNum = await generateFcrNumber(client);
        }

        const updateQuery = `
          UPDATE field_call_reports
          SET fcr_number = COALESCE($1, fcr_number),
              call_type = COALESCE($2, call_type),
              problem_reported = COALESCE($3, problem_reported),
              visit_date = COALESCE($4, visit_date),
              visit_start_time = COALESCE($5, visit_start_time),
              visit_end_time = COALESCE($6, visit_end_time),
              diagnosed_problem = COALESCE($7, diagnosed_problem),
              diagnosis = COALESCE($7, diagnosis),
              action_taken = COALESCE($8, action_taken),
              resolution = COALESCE($9, resolution),
              suggestion_to_client = COALESCE($10, suggestion_to_client),
              suggestions = COALESCE($10, suggestions),
              engineer_remarks = COALESCE($11, engineer_remarks),
              client_remarks = COALESCE($12, client_remarks),
              parts_replaced = COALESCE($13, parts_replaced),
              activity_code = COALESCE($14, activity_code),
              delay_code = COALESCE($15, delay_code),
              error_code = COALESCE($16, error_code),
              ip_address = COALESCE($17, ip_address),
              subnet_mask = COALESCE($18, subnet_mask),
              gateway = COALESCE($19, gateway),
              preferred_dns = COALESCE($20, preferred_dns),
              alternate_dns = COALESCE($21, alternate_dns),
              updated_at = CURRENT_TIMESTAMP
          WHERE complaint_id = $22
          RETURNING *
        `;
        const updateRes = await client.query(updateQuery, [
          fcrNum,
          call_type,
          problem_reported,
          visit_date,
          visit_start_time,
          visit_end_time,
          diagVal || null,
          action_taken || null,
          resolution || null,
          suggVal || null,
          engineer_remarks,
          client_remarks,
          parts_replaced,
          activity_code,
          delay_code,
          error_code,
          ip_address,
          subnet_mask,
          gateway,
          preferred_dns,
          alternate_dns,
          id
        ]);
        savedFcr = updateRes.rows[0];
      }

      // Handle Child Devices (if passed as array)
      if (Array.isArray(devices)) {
        await client.query('DELETE FROM service_report_devices WHERE service_report_id = $1', [savedFcr.id]);
        for (const dev of devices) {
          if (dev.product_name && dev.product_name.trim()) {
            await client.query(`
              INSERT INTO service_report_devices (
                service_report_id, complaint_id, product_name, device_category,
                model, verified_model, serial_number, verified_serial_number,
                connected_device_serial_number, customer_machine_id, site_id,
                location_branch, line_site_side_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            `, [
              savedFcr.id,
              id,
              dev.product_name.trim(),
              dev.device_category || null,
              dev.model || null,
              dev.verified_model || dev.model || null,
              dev.serial_number || null,
              dev.verified_serial_number || dev.serial_number || null,
              dev.connected_device_serial_number || null,
              dev.customer_machine_id || null,
              dev.site_id || null,
              dev.location_branch || null,
              dev.line_site_side_id || null
            ]);
          }
        }
      }

      // Handle Child Parts (if passed as array)
      if (Array.isArray(parts)) {
        await client.query('DELETE FROM service_report_parts WHERE service_report_id = $1', [savedFcr.id]);
        for (const pt of parts) {
          if (pt.part_name && pt.part_name.trim()) {
            await client.query(`
              INSERT INTO service_report_parts (
                service_report_id, complaint_id, part_name,
                old_serial_number, new_serial_number, quantity, remarks
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              savedFcr.id,
              id,
              pt.part_name.trim(),
              pt.old_serial_number || null,
              pt.new_serial_number || null,
              pt.quantity || 1,
              pt.remarks || null
            ]);
          }
        }
      }

      await client.query('COMMIT');
      client.release();

    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('FCR_DRAFT_SAVED', { complaintId: id, fcrNumber: savedFcr.fcr_number }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Service Report draft saved successfully',
      data: savedFcr
    });

  } catch (error) {
    console.error('Save FCR draft error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to save Service Report draft' });
  }
};

/**
 * Submit FCR (Strict Transition: Complaint MUST be In Progress -> Transitions to Resolved)
 * POST /api/complaints/:id/fcr/submit
 */
const submitFcr = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    diagnosed_problem,
    diagnosis,
    action_taken,
    resolution,
    suggestion_to_client,
    suggestions,
    activity_code
  } = req.body || {};

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint with current status
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Authorization: Must be assigned engineer or admin
    if (user.role === 'CUSTOMER') {
      return res.status(403).json({ success: false, message: 'Forbidden: Customers cannot submit Service Reports' });
    }
    if ((user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned field engineer can resolve this complaint' });
    }

    // 2. Strict Workflow Check: Complaint MUST be in 'In Progress' status
    if (complaint.status_name === 'Accepted') {
      return res.status(400).json({
        success: false,
        message: "Cannot resolve ticket from 'Accepted' status. The engineer must commence work ('In Progress') first."
      });
    }

    if (complaint.status_name !== 'In Progress') {
      return res.status(400).json({
        success: false,
        message: `Tickets can only be resolved when currently 'In Progress'. Current status: ${complaint.status_name}`
      });
    }

    // 3. Validate Mandatory Resolution Fields
    const finalDiag = (diagnosed_problem || diagnosis || '').trim();
    const finalAction = (action_taken || '').trim();
    const finalResolution = (resolution || '').trim();
    const finalActivity = (activity_code || 'ACT-01').trim();
    const finalSugg = (suggestion_to_client || suggestions || '').trim();

    // 4. Fetch or Create FCR Record inside Transaction
    const client = await dbPool.connect();
    let fcr = null;

    try {
      await client.query('BEGIN');

      const fcrCheck = await client.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
      
      const effectiveDiag = finalDiag || (fcrCheck.rows[0]?.diagnosed_problem || fcrCheck.rows[0]?.diagnosis || '').trim();
      const effectiveAction = finalAction || (fcrCheck.rows[0]?.action_taken || '').trim();
      const effectiveResolution = finalResolution || (fcrCheck.rows[0]?.resolution || '').trim();
      const effectiveActivity = finalActivity || (fcrCheck.rows[0]?.activity_code || 'ACT-01').trim();
      const effectiveSugg = finalSugg || (fcrCheck.rows[0]?.suggestion_to_client || fcrCheck.rows[0]?.suggestions || '').trim();

      if (!effectiveDiag) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ success: false, message: 'Diagnosed Problem is mandatory before submitting service resolution' });
      }

      if (!effectiveAction) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ success: false, message: 'Action Taken is mandatory before submitting service resolution' });
      }

      if (!effectiveResolution) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ success: false, message: 'Resolution / Solution is mandatory before submitting service resolution' });
      }

      // 4b. Mandatory Photo Evidence Validation for High / Critical priority complaints
      const priorityRes = await client.query('SELECT name FROM complaint_priorities WHERE id = $1', [complaint.priority_id]);
      const priorityName = priorityRes.rows[0]?.name;

      if (priorityName === 'High' || priorityName === 'Critical') {
        const evidenceRes = await client.query(`
          SELECT DISTINCT evidence_stage
          FROM complaint_attachments
          WHERE complaint_id = $1
            AND mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/jpg')
            AND evidence_stage IN ('BEFORE', 'DURING', 'AFTER')
        `, [id]);

        const stages = evidenceRes.rows.map(r => r.evidence_stage);
        const hasBefore = stages.includes('BEFORE');
        const hasDuring = stages.includes('DURING');
        const hasAfter = stages.includes('AFTER');

        if (!hasBefore || !hasDuring || !hasAfter) {
          await client.query('ROLLBACK');
          client.release();
          const missing = [];
          if (!hasBefore) missing.push('BEFORE');
          if (!hasDuring) missing.push('DURING');
          if (!hasAfter) missing.push('AFTER');
          return res.status(400).json({
            success: false,
            message: `High and Critical priority complaints require verified Before, During, and After photo evidence (image/jpeg, image/png, image/webp) before resolution. Missing stages: ${missing.join(', ')}`
          });
        }
      }

      if (fcrCheck.rows.length === 0) {
        const newFcrNum = await generateFcrNumber(client);
        const todayStr = new Date().toISOString().substring(0, 10);
        const insertRes = await client.query(`
          INSERT INTO field_call_reports (
            complaint_id, fcr_number, visit_date, visit_start_time, visit_end_time,
            call_type, problem_reported, diagnosed_problem, diagnosis, action_taken,
            resolution, suggestion_to_client, suggestions, activity_code, status,
            call_start_time, work_close_time
          )
          VALUES ($1, $2, $3, '09:00', '10:00', 'Breakdown', $4, $5, $5, $6, $7, $8, $8, $9, 'Submitted', $10, CURRENT_TIMESTAMP)
          RETURNING *
        `, [
          id, newFcrNum, todayStr, complaint.description || '',
          effectiveDiag, effectiveAction, effectiveResolution, effectiveSugg, effectiveActivity,
          complaint.created_at
        ]);
        fcr = insertRes.rows[0];
      } else {
        fcr = fcrCheck.rows[0];

        // Check if already submitted
        if (fcr.status === 'Submitted' || fcr.status === 'Finalized') {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ success: false, message: 'Service Report has already been submitted' });
        }

        // Update FCR status to Submitted
        const updateFcrRes = await client.query(`
          UPDATE field_call_reports
          SET status = 'Submitted',
              diagnosed_problem = $1,
              diagnosis = $1,
              action_taken = $2,
              resolution = $3,
              suggestion_to_client = $4,
              suggestions = $4,
              activity_code = $5,
              work_close_time = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE complaint_id = $6
          RETURNING *
        `, [effectiveDiag, effectiveAction, effectiveResolution, effectiveSugg, effectiveActivity, id]);
        fcr = updateFcrRes.rows[0];
      }

      // 5. Fetch Resolved Status ID
      const resolvedStatusRes = await client.query("SELECT id FROM complaint_statuses WHERE name = 'Resolved'");
      const resolvedStatusId = resolvedStatusRes.rows[0]?.id;

      if (!resolvedStatusId) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(500).json({ success: false, message: 'Resolved status metadata is missing in database' });
      }

      // B. Update Complaint status to Resolved
      await client.query(`
        UPDATE complaints
        SET status_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [resolvedStatusId, id]);

      // C. Record Status History
      const auditRemark = `FCR submitted (${fcr.fcr_number || 'FCR'}). Service resolution completed.`;
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, resolvedStatusId, auditRemark]);

      await client.query('COMMIT');
      client.release();

    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('COMPLAINT_RESOLVED', { complaintId: id, ticketNumber: complaint.ticket_number, fcrNumber: fcr.fcr_number }, user, req.ip);

    // Notifications
    try {
      const notifications = require('../utils/notifications');
      if (typeof notifications.notifyStatusChanged === 'function') {
        notifications.notifyStatusChanged(complaint, 'In Progress', 'Resolved').catch(err => console.error('Failed to notify status resolved:', err));
      }
    } catch (notifErr) {
      console.error('Notification dispatch warning:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Service Report submitted successfully and complaint marked as Resolved'
    });

  } catch (error) {
    console.error('Submit FCR error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to submit Service Report: ${error.message}` });
  }
};

/**
 * Customer Confirm FCR (Transitions Resolved -> Closed)
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

    // Fetch complaint
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Authorization: Must be customer creator or admin
    if (user.role === 'CUSTOMER' && complaint.created_by_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the ticket creator can sign off and finalize' });
    }

    // Verify FCR exists and is Submitted
    const fcrCheck = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service Report record not found' });
    }

    const fcr = fcrCheck.rows[0];
    if (fcr.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: 'Sign-off is only allowed on Submitted Service Reports' });
    }

    // Retrieve Closed status ID
    const closedStatusRes = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedStatusId = closedStatusRes.rows[0]?.id;

    if (!closedStatusId) {
      return res.status(500).json({ success: false, message: 'Closed status metadata is missing in database' });
    }

    const customerSignName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Customer Sign-off';

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      await client.query(`
        UPDATE field_call_reports
        SET status = 'Finalized',
            customer_feedback = $1,
            customer_rating = $2,
            customer_sign_name = $3,
            customer_confirmed_at = CURRENT_TIMESTAMP,
            call_close_time = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE complaint_id = $4
      `, [customer_feedback || '', rating, customerSignName, id]);

      await client.query(`
        UPDATE complaints
        SET status_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [closedStatusId, id]);

      // Propagate rating into CSAT feedback store
      await client.query(`
        INSERT INTO complaint_feedback (complaint_id, rating, comments)
        VALUES ($1, $2, $3)
        ON CONFLICT (complaint_id) DO UPDATE
        SET rating = EXCLUDED.rating, comments = EXCLUDED.comments
      `, [id, rating, customer_feedback || '']);

      const auditRemark = `Ticket confirmed and closed by customer (Rating: ${rating}/5)`;
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, closedStatusId, auditRemark]);

      await client.query('COMMIT');
      client.release();

    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('COMPLAINT_CLOSED', { complaintId: id, ticketNumber: complaint.ticket_number, rating }, user, req.ip);

    try {
      const notifications = require('../utils/notifications');
      if (typeof notifications.notifyStatusChanged === 'function') {
        notifications.notifyStatusChanged(complaint, 'Resolved', 'Closed').catch(err => console.error('Failed to notify status closed:', err));
      }
    } catch (notifErr) {
      console.error('Notification dispatch warning:', notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Service Report finalized and complaint successfully closed'
    });

  } catch (error) {
    console.error('Confirm FCR error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to finalize Service Report sign-off' });
  }
};

/**
 * Add Part Replaced
 * POST /api/complaints/:id/fcr/parts
 */
const addPart = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const { part_name, old_serial_number, new_serial_number, quantity, remarks } = req.body;

  if (!part_name || !part_name.trim()) {
    return res.status(400).json({ success: false, message: 'Part name / description is required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint and FCR
    const fcrRes = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    let fcrId = fcrRes.rows[0]?.id;

    if (!fcrId) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const newFcrNum = await generateFcrNumber(client);
        const todayStr = new Date().toISOString().substring(0, 10);
        const insRes = await client.query(`
          INSERT INTO field_call_reports (complaint_id, fcr_number, visit_date, visit_start_time, visit_end_time, status)
          VALUES ($1, $2, $3, '09:00', '10:00', 'Draft')
          RETURNING id
        `, [id, newFcrNum, todayStr]);
        fcrId = insRes.rows[0].id;
        await client.query('COMMIT');
        client.release();
      } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        throw err;
      }
    }

    const insertRes = await dbPool.query(`
      INSERT INTO service_report_parts (
        service_report_id, complaint_id, part_name,
        old_serial_number, new_serial_number, quantity, remarks
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      fcrId,
      id,
      part_name.trim(),
      old_serial_number || null,
      new_serial_number || null,
      parseInt(quantity, 10) || 1,
      remarks || null
    ]);

    logger.audit('PART_ADDED', { complaintId: id, partId: insertRes.rows[0].id, partName: part_name.trim() }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Part added successfully',
      data: insertRes.rows[0]
    });

  } catch (error) {
    console.error('Add part error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add part' });
  }
};

/**
 * Update Part Replaced
 * PUT /api/complaints/:id/fcr/parts/:partId
 */
const updatePart = async (req, res) => {
  const { id, partId } = req.params;
  const user = req.user;
  const { part_name, old_serial_number, new_serial_number, quantity, remarks } = req.body;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const updateRes = await dbPool.query(`
      UPDATE service_report_parts
      SET part_name = COALESCE($1, part_name),
          old_serial_number = COALESCE($2, old_serial_number),
          new_serial_number = COALESCE($3, new_serial_number),
          quantity = COALESCE($4, quantity),
          remarks = COALESCE($5, remarks),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND complaint_id = $7
      RETURNING *
    `, [
      part_name ? part_name.trim() : null,
      old_serial_number,
      new_serial_number,
      quantity ? parseInt(quantity, 10) : null,
      remarks,
      partId,
      id
    ]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Part record not found' });
    }

    logger.audit('PART_UPDATED', { complaintId: id, partId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Part updated successfully',
      data: updateRes.rows[0]
    });

  } catch (error) {
    console.error('Update part error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update part' });
  }
};

/**
 * Delete Part Replaced
 * DELETE /api/complaints/:id/fcr/parts/:partId
 */
const deletePart = async (req, res) => {
  const { id, partId } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const delRes = await dbPool.query(
      'DELETE FROM service_report_parts WHERE id = $1 AND complaint_id = $2 RETURNING *',
      [partId, id]
    );

    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Part record not found' });
    }

    logger.audit('PART_DELETED', { complaintId: id, partId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Part removed successfully'
    });

  } catch (error) {
    console.error('Delete part error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete part' });
  }
};

/**
 * Add Equipment / Device
 * POST /api/complaints/:id/fcr/devices
 */
const addDevice = async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    product_name,
    device_category,
    model,
    verified_model,
    serial_number,
    verified_serial_number,
    connected_device_serial_number,
    customer_machine_id,
    site_id,
    location_branch,
    line_site_side_id
  } = req.body;

  if (!product_name || !product_name.trim()) {
    return res.status(400).json({ success: false, message: 'Product / device name is required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch or create FCR
    const fcrRes = await dbPool.query('SELECT id FROM field_call_reports WHERE complaint_id = $1', [id]);
    let fcrId = fcrRes.rows[0]?.id;

    if (!fcrId) {
      const client = await dbPool.connect();
      try {
        await client.query('BEGIN');
        const newFcrNum = await generateFcrNumber(client);
        const todayStr = new Date().toISOString().substring(0, 10);
        const insRes = await client.query(`
          INSERT INTO field_call_reports (complaint_id, fcr_number, visit_date, visit_start_time, visit_end_time, status)
          VALUES ($1, $2, $3, '09:00', '10:00', 'Draft')
          RETURNING id
        `, [id, newFcrNum, todayStr]);
        fcrId = insRes.rows[0].id;
        await client.query('COMMIT');
        client.release();
      } catch (err) {
        await client.query('ROLLBACK');
        client.release();
        throw err;
      }
    }

    const insertRes = await dbPool.query(`
      INSERT INTO service_report_devices (
        service_report_id, complaint_id, product_name, device_category,
        model, verified_model, serial_number, verified_serial_number,
        connected_device_serial_number, customer_machine_id, site_id,
        location_branch, line_site_side_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      fcrId,
      id,
      product_name.trim(),
      device_category || null,
      model || null,
      verified_model || model || null,
      serial_number || null,
      verified_serial_number || serial_number || null,
      connected_device_serial_number || null,
      customer_machine_id || null,
      site_id || null,
      location_branch || null,
      line_site_side_id || null
    ]);

    logger.audit('DEVICE_ADDED', { complaintId: id, deviceId: insertRes.rows[0].id, product: product_name.trim() }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Device added successfully',
      data: insertRes.rows[0]
    });

  } catch (error) {
    console.error('Add device error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add device' });
  }
};

/**
 * Update Equipment / Device
 * PUT /api/complaints/:id/fcr/devices/:deviceId
 */
const updateDevice = async (req, res) => {
  const { id, deviceId } = req.params;
  const user = req.user;
  const {
    product_name,
    device_category,
    model,
    verified_model,
    serial_number,
    verified_serial_number,
    connected_device_serial_number,
    customer_machine_id,
    site_id,
    location_branch,
    line_site_side_id
  } = req.body;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const updateRes = await dbPool.query(`
      UPDATE service_report_devices
      SET product_name = COALESCE($1, product_name),
          device_category = COALESCE($2, device_category),
          model = COALESCE($3, model),
          verified_model = COALESCE($4, verified_model),
          serial_number = COALESCE($5, serial_number),
          verified_serial_number = COALESCE($6, verified_serial_number),
          connected_device_serial_number = COALESCE($7, connected_device_serial_number),
          customer_machine_id = COALESCE($8, customer_machine_id),
          site_id = COALESCE($9, site_id),
          location_branch = COALESCE($10, location_branch),
          line_site_side_id = COALESCE($11, line_site_side_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $12 AND complaint_id = $13
      RETURNING *
    `, [
      product_name ? product_name.trim() : null,
      device_category,
      model,
      verified_model,
      serial_number,
      verified_serial_number,
      connected_device_serial_number,
      customer_machine_id,
      site_id,
      location_branch,
      line_site_side_id,
      deviceId,
      id
    ]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Device record not found' });
    }

    logger.audit('DEVICE_UPDATED', { complaintId: id, deviceId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Device updated successfully',
      data: updateRes.rows[0]
    });

  } catch (error) {
    console.error('Update device error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update device' });
  }
};

/**
 * Delete Equipment / Device
 * DELETE /api/complaints/:id/fcr/devices/:deviceId
 */
const deleteDevice = async (req, res) => {
  const { id, deviceId } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const delRes = await dbPool.query(
      'DELETE FROM service_report_devices WHERE id = $1 AND complaint_id = $2 RETURNING *',
      [deviceId, id]
    );

    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Device record not found' });
    }

    logger.audit('DEVICE_DELETED', { complaintId: id, deviceId }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Device removed successfully'
    });

  } catch (error) {
    console.error('Delete device error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete device' });
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

    // 1. Fetch Complaint & Main FCR Metadata
    const compRes = await dbPool.query(`
      SELECT c.*,
             cs.name AS status_name,
             cp.name AS priority_name,
             cc.name AS category_name,
             dept.name AS department_name,
             u_creator.first_name AS creator_first_name,
             u_creator.last_name AS creator_last_name,
             u_creator.email AS creator_email,
             u_assignee.first_name AS assignee_first_name,
             u_assignee.last_name AS assignee_last_name,
             u_assignee.email AS assignee_email,
             fcr.id AS fcr_id,
             fcr.fcr_number,
             fcr.call_type,
             fcr.visit_date,
             fcr.visit_start_time,
             fcr.visit_end_time,
             fcr.problem_reported,
             fcr.diagnosed_problem,
             fcr.diagnosis,
             fcr.action_taken,
             fcr.resolution,
             fcr.suggestion_to_client,
             fcr.suggestions,
             fcr.engineer_remarks,
             fcr.client_remarks,
             fcr.activity_code,
             fcr.delay_code,
             fcr.error_code,
             fcr.ip_address,
             fcr.subnet_mask,
             fcr.gateway,
             fcr.preferred_dns,
             fcr.alternate_dns,
             fcr.call_start_time,
             fcr.travel_start_time,
             fcr.reached_site_time,
             fcr.work_start_time,
             fcr.work_close_time,
             fcr.call_close_time,
             fcr.customer_sign_name,
             fcr.customer_signature_data,
             fcr.engineer_sign_name,
             fcr.engineer_signature_data,
             fcr.customer_confirmed_at,
             fcr.auto_closed_at,
             fcr.customer_rating,
             fcr.customer_feedback,
             fcr.status AS fcr_status
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      JOIN complaint_priorities cp ON c.priority_id = cp.id
      LEFT JOIN complaint_categories cc ON c.category_id = cc.id
      LEFT JOIN departments dept ON c.department_id = dept.id
      LEFT JOIN users u_creator ON c.created_by_id = u_creator.id
      LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
      LEFT JOIN field_call_reports fcr ON c.id = fcr.complaint_id
      WHERE c.id = $1
    `, [id]);

    if (compRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compRes.rows[0];

    // Enforce authorization
    const isAdmin = user.role === 'ADMIN';
    const isAssignee = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;
    const isDeptHead = user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id;

    if (!isAdmin && !isAssignee && !isCreator && !isDeptHead) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to access this PDF' });
    }

    if (!complaint.fcr_id) {
      return res.status(404).json({ success: false, message: 'No Service Report record exists for this complaint yet' });
    }

    if (complaint.fcr_status !== 'Submitted' && complaint.fcr_status !== 'Finalized') {
      return res.status(400).json({ success: false, message: 'Service Reports can only be downloaded after submission' });
    }

    // 2. Fetch Customer & Service Location Profile
    const custRes = await dbPool.query(`
      SELECT cp.*, u.first_name, u.last_name, u.email,
             csl.location_name, csl.location_code, csl.address AS service_address,
             csl.city AS service_city, csl.state AS service_state, csl.pincode AS service_pincode,
             csl.contact_number AS location_contact_number
      FROM users u
      LEFT JOIN customer_profiles cp ON u.id = cp.user_id
      LEFT JOIN customer_service_locations csl ON csl.id = $2
      WHERE u.id = $1
    `, [complaint.created_by_id, complaint.service_location_id || null]);

    const custRow = custRes.rows[0] || {};
    const customer = {
      customer_code: custRow.customer_code || `CUST-${String(complaint.created_by_id).padStart(4, '0')}`,
      name: `${custRow.first_name || complaint.creator_first_name || ''} ${custRow.last_name || complaint.creator_last_name || ''}`.trim() || 'Valued Customer',
      company_name: custRow.company_name || 'Individual Customer',
      email: custRow.email || complaint.creator_email || 'Not recorded',
      phone: custRow.location_contact_number || custRow.alternate_mobile || 'Not recorded',
      service_address: custRow.service_address || custRow.address_line1 || complaint.service_address_snapshot || 'Not recorded',
      location_name: custRow.location_name || 'Primary Site',
      city: custRow.service_city || custRow.city || 'Not recorded',
      state: custRow.service_state || custRow.state || 'Not recorded',
      pincode: custRow.service_pincode || custRow.pincode || 'Not recorded'
    };

    // 3. Fetch Engineer Profile
    let engineer = null;
    if (complaint.assigned_to_id) {
      const engRes = await dbPool.query(`
        SELECT ep.*, u.first_name, u.last_name, u.email
        FROM users u
        LEFT JOIN engineer_profiles ep ON u.id = ep.user_id
        WHERE u.id = $1
      `, [complaint.assigned_to_id]);
      const engRow = engRes.rows[0] || {};
      engineer = {
        engineer_code: engRow.engineer_code || `ENG-${String(complaint.assigned_to_id).padStart(4, '0')}`,
        name: `${engRow.first_name || complaint.assignee_first_name || ''} ${engRow.last_name || complaint.assignee_last_name || ''}`.trim() || 'Assigned Engineer',
        designation: engRow.designation || 'Field Service Engineer',
        official_mobile: engRow.official_mobile || engRow.alternate_mobile || 'Not recorded',
        official_email: engRow.official_email || engRow.email || complaint.assignee_email || 'Not recorded'
      };
    }

    // 4. Fetch Devices
    const devicesRes = await dbPool.query(
      'SELECT * FROM service_report_devices WHERE complaint_id = $1 ORDER BY id ASC',
      [id]
    );
    const devices = devicesRes.rows;

    // 5. Fetch Parts
    const partsRes = await dbPool.query(
      'SELECT * FROM service_report_parts WHERE complaint_id = $1 ORDER BY id ASC',
      [id]
    );
    const parts = partsRes.rows;

    // 6. Fetch Evidence Attachments Summary
    const attachRes = await dbPool.query(`
      SELECT file_name, evidence_stage, created_at
      FROM complaint_attachments
      WHERE complaint_id = $1
      ORDER BY created_at ASC
    `, [id]);
    const attachments = attachRes.rows;

    // Set response headers to stream PDF binary
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fcr_${complaint.fcr_number || complaint.ticket_number}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    doc.pipe(res);

    // Helpers
    const formatDate = (val, includeTime = true) => {
      if (!val) return 'Not recorded';
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'Not recorded';
      return includeTime ? d.toLocaleString() : d.toLocaleDateString();
    };

    const safeText = (val, fallback = 'Not recorded') => {
      if (val === null || val === undefined) return fallback;
      const str = String(val).trim();
      return str.length > 0 ? str : fallback;
    };

    const ensureSpace = (neededHeight) => {
      if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    };

    const drawSectionBanner = (title) => {
      ensureSpace(35);
      doc.moveDown(0.6);
      const y = doc.y;
      doc.rect(40, y, 515, 18).fill('#f1f5f9');
      doc.rect(40, y, 4, 18).fill('#0f766e');
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#0f172a').text(title, 50, y + 4.5);
      doc.y = y + 23;
    };

    const drawKeyValueGrid = (items, cols = 2) => {
      const colWidth = 515 / cols;
      let startX = 40;
      let startY = doc.y;
      let maxHeight = 0;

      items.forEach((item, index) => {
        const colIdx = index % cols;
        const rowIdx = Math.floor(index / cols);

        if (colIdx === 0 && index > 0) {
          startY += maxHeight + 4;
          maxHeight = 0;
        }

        const x = startX + colIdx * colWidth;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569').text(item.label, x, startY, { width: colWidth - 10, lineBreak: false });
        doc.fontSize(8.5).font('Helvetica').fillColor('#0f172a').text(safeText(item.value), x, startY + 10, { width: colWidth - 10 });

        const itemHeight = 22;
        if (itemHeight > maxHeight) maxHeight = itemHeight;
      });

      doc.y = startY + maxHeight + 6;
    };

    // Header title & Branding
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#0f766e').text('PINakee Support Systems', 40, 40, { align: 'left' });
    doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('Digital Field Service Outpost | ISO Certified Service Operations', 40, 58, { align: 'left' });

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#0f172a').text('FIELD SERVICE REPORT', 340, 40, { align: 'right' });
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f766e').text(`FCR: ${complaint.fcr_number || 'N/A'}`, 340, 55, { align: 'right' });
    doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`Generated: ${new Date().toLocaleString()}`, 340, 68, { align: 'right' });

    doc.strokeColor('#cbd5e1').lineWidth(0.75).moveTo(40, 82).lineTo(555, 82).stroke();
    doc.y = 88;

    // SECTION 1: Service Reference
    drawSectionBanner('1. Service Call Reference');
    drawKeyValueGrid([
      { label: 'FCR Number', value: complaint.fcr_number || 'N/A' },
      { label: 'Ticket Reference', value: `#${complaint.ticket_number}` },
      { label: 'Call Type', value: complaint.call_type || 'Breakdown' },
      { label: 'Priority Level', value: complaint.priority_name || 'Medium' },
      { label: 'Service Category', value: complaint.category_name || 'General Support' },
      { label: 'Activity Code', value: complaint.activity_code || 'ACT-01' },
      { label: 'Delay Code', value: complaint.delay_code || 'None' },
      { label: 'Error Code', value: complaint.error_code || 'None' },
      { label: 'Ticket Created At', value: formatDate(complaint.created_at) },
      { label: 'Current FCR Status', value: complaint.fcr_status }
    ], 2);

    // SECTION 2: Customer & Service Location
    drawSectionBanner('2. Customer & Service Location');
    drawKeyValueGrid([
      { label: 'Customer Code', value: customer.customer_code },
      { label: 'Customer / Company Name', value: `${customer.name} (${customer.company_name})` },
      { label: 'Contact Phone', value: customer.phone },
      { label: 'Contact Email', value: customer.email },
      { label: 'Site / Location Name', value: customer.location_name },
      { label: 'Service Address Snapshot', value: `${customer.service_address}, ${customer.city}, ${customer.state} - ${customer.pincode}` }
    ], 2);

    // SECTION 3: Assigned Engineer
    drawSectionBanner('3. Assigned Field Engineer');
    if (engineer) {
      drawKeyValueGrid([
        { label: 'Engineer Code', value: engineer.engineer_code },
        { label: 'Engineer Full Name', value: engineer.name },
        { label: 'Designation', value: engineer.designation },
        { label: 'Official Mobile', value: engineer.official_mobile },
        { label: 'Official Email', value: engineer.official_email },
        { label: 'Assigned Status', value: 'Authorized Field Technician' }
      ], 2);
    } else {
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text('No field engineer currently assigned.', 50, doc.y);
      doc.moveDown(0.5);
    }

    // SECTION 4: Equipment / Devices Inspected
    drawSectionBanner('4. Equipment & Devices Inspected');
    if (devices.length > 0) {
      ensureSpace(devices.length * 18 + 20);
      const tableY = doc.y;
      doc.rect(40, tableY, 515, 15).fill('#e2e8f0');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b');
      doc.text('#', 45, tableY + 4, { width: 15 });
      doc.text('Product Name', 65, tableY + 4, { width: 100 });
      doc.text('Model (Verified)', 170, tableY + 4, { width: 95 });
      doc.text('Serial # (Verified)', 270, tableY + 4, { width: 95 });
      doc.text('Customer M/C ID', 370, tableY + 4, { width: 75 });
      doc.text('Line / Site ID', 450, tableY + 4, { width: 100 });

      let rowY = tableY + 16;
      devices.forEach((dev, idx) => {
        ensureSpace(16);
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155');
        doc.text(String(idx + 1), 45, rowY, { width: 15 });
        doc.text(safeText(dev.product_name, 'Equipment'), 65, rowY, { width: 100 });
        doc.text(safeText(dev.verified_model || dev.model), 170, rowY, { width: 95 });
        doc.text(safeText(dev.verified_serial_number || dev.serial_number), 270, rowY, { width: 95 });
        doc.text(safeText(dev.customer_machine_id), 370, rowY, { width: 75 });
        doc.text(safeText(dev.line_site_side_id || dev.site_id), 450, rowY, { width: 100 });
        rowY += 14;
      });
      doc.y = rowY + 4;
    } else {
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text('No equipment records linked to this service call.', 50, doc.y);
      doc.moveDown(0.5);
    }

    // SECTION 5: Network Configuration
    drawSectionBanner('5. Network & Terminal Configuration');
    drawKeyValueGrid([
      { label: 'IP Address', value: complaint.ip_address },
      { label: 'Subnet Mask', value: complaint.subnet_mask },
      { label: 'Default Gateway', value: complaint.gateway },
      { label: 'Preferred DNS', value: complaint.preferred_dns },
      { label: 'Alternate DNS', value: complaint.alternate_dns }
    ], 3);

    // SECTION 6: Six-Stage Service Timing Milestones
    drawSectionBanner('6. Six-Stage Call & Field Timing Milestones');
    drawKeyValueGrid([
      { label: '1. Call Logged At', value: formatDate(complaint.call_start_time || complaint.created_at) },
      { label: '2. Travel Started At', value: formatDate(complaint.travel_start_time) },
      { label: '3. Reached Site At', value: formatDate(complaint.reached_site_time) },
      { label: '4. Work Started At', value: formatDate(complaint.work_start_time) },
      { label: '5. Work Closed / Resolved', value: formatDate(complaint.work_close_time) },
      { label: '6. Call Closed At', value: formatDate(complaint.call_close_time || complaint.customer_confirmed_at || complaint.auto_closed_at) }
    ], 3);

    // SECTION 7: Diagnostics, Actions & Resolution
    drawSectionBanner('7. Diagnostics, Actions & Resolution');
    const textBlocks = [
      { label: 'Problem Reported by Customer:', text: complaint.problem_reported || complaint.description },
      { label: 'Diagnostic Findings & Root Cause:', text: complaint.diagnosed_problem || complaint.diagnosis },
      { label: 'Corrective Action Taken:', text: complaint.action_taken },
      { label: 'Final Resolution / Solution:', text: complaint.resolution },
      { label: 'Recommendations / Suggestions to Client:', text: complaint.suggestion_to_client || complaint.suggestions },
      { label: 'Field Engineer Remarks:', text: complaint.engineer_remarks },
      { label: 'Client / Representative Remarks:', text: complaint.client_remarks }
    ];

    textBlocks.forEach((tb) => {
      ensureSpace(30);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#1e293b').text(tb.label, 45, doc.y);
      doc.moveDown(0.2);
      doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(safeText(tb.text, 'Not recorded'), 50, doc.y, { width: 500 });
      doc.moveDown(0.4);
    });

    // SECTION 8: Replaced Parts & Materials
    drawSectionBanner('8. Parts & Materials Replaced');
    if (parts.length > 0) {
      ensureSpace(parts.length * 18 + 20);
      const partsTableY = doc.y;
      doc.rect(40, partsTableY, 515, 15).fill('#e2e8f0');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b');
      doc.text('#', 45, partsTableY + 4, { width: 15 });
      doc.text('Part Description / Name', 65, partsTableY + 4, { width: 170 });
      doc.text('Old Serial #', 240, partsTableY + 4, { width: 95 });
      doc.text('New Serial #', 340, partsTableY + 4, { width: 95 });
      doc.text('Qty', 440, partsTableY + 4, { width: 25 });
      doc.text('Remarks', 470, partsTableY + 4, { width: 80 });

      let pRowY = partsTableY + 16;
      parts.forEach((pt, idx) => {
        ensureSpace(16);
        doc.fontSize(7.5).font('Helvetica').fillColor('#334155');
        doc.text(String(idx + 1), 45, pRowY, { width: 15 });
        doc.text(safeText(pt.part_name), 65, pRowY, { width: 170 });
        doc.text(safeText(pt.old_serial_number), 240, pRowY, { width: 95 });
        doc.text(safeText(pt.new_serial_number), 340, pRowY, { width: 95 });
        doc.text(String(pt.quantity || 1), 440, pRowY, { width: 25 });
        doc.text(safeText(pt.remarks, '-'), 470, pRowY, { width: 80 });
        pRowY += 14;
      });
      doc.y = pRowY + 4;
    } else {
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text('No parts replaced during this service call.', 50, doc.y);
      doc.moveDown(0.5);
    }

    // SECTION 9: Photo Evidence & Attachments Summary
    drawSectionBanner('9. Photographic Evidence & Attachments');
    if (attachments.length > 0) {
      const stageCounts = { BEFORE: 0, DURING: 0, AFTER: 0, GENERAL: 0 };
      attachments.forEach(a => {
        const stage = a.evidence_stage || 'GENERAL';
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      });

      drawKeyValueGrid([
        { label: 'BEFORE Work Evidence', value: `${stageCounts.BEFORE || 0} photo(s) attached` },
        { label: 'DURING Work Evidence', value: `${stageCounts.DURING || 0} photo(s) attached` },
        { label: 'AFTER Work Evidence', value: `${stageCounts.AFTER || 0} photo(s) attached` },
        { label: 'General / Customer Uploads', value: `${stageCounts.GENERAL || 0} file(s) attached` }
      ], 2);
    } else {
      doc.fontSize(8.5).font('Helvetica').fillColor('#64748b').text('No photographic evidence uploaded for this service call.', 50, doc.y);
      doc.moveDown(0.5);
    }

    // SECTION 10: Service Sign-off & Closure Source Disambiguation
    drawSectionBanner('10. Service Sign-off & Resolution Confirmation');
    ensureSpace(120);

    const signoffY = doc.y;
    doc.rect(40, signoffY, 515, 60).fill('#f8fafc');
    doc.rect(40, signoffY, 515, 60).stroke('#cbd5e1');

    if (complaint.customer_confirmed_at) {
      // PATH A: Customer Confirmed
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#059669').text('✓ Confirmed & Closed by Customer', 50, signoffY + 8);
      doc.fontSize(8).font('Helvetica').fillColor('#334155');
      doc.text(`Confirmation Timestamp:  ${formatDate(complaint.customer_confirmed_at)}`, 50, signoffY + 22);
      doc.text(`Customer Sign-off Name:  ${safeText(complaint.customer_sign_name, customer.name)}`, 50, signoffY + 34);
      doc.text(`Customer Service Rating: ${complaint.customer_rating ? `${complaint.customer_rating} / 5 Stars` : 'Not recorded'}`, 300, signoffY + 22);
      doc.text(`Customer Feedback:       "${safeText(complaint.customer_feedback, 'None recorded')}"`, 300, signoffY + 34, { width: 245 });
    } else if (complaint.auto_closed_at) {
      // PATH B: System Auto-Closed (72h SLA)
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569').text('🤖 Closed via System Auto-Closure (72h SLA Inactivity)', 50, signoffY + 8);
      doc.fontSize(8).font('Helvetica').fillColor('#334155');
      doc.text(`Auto-Closure Timestamp:  ${formatDate(complaint.auto_closed_at)}`, 50, signoffY + 22);
      doc.text('Customer Sign-off:       Not recorded (Auto-closed due to customer inactivity)', 50, signoffY + 34);
      doc.text('Customer Service Rating: None — System Closure', 300, signoffY + 22);
      doc.text('Customer Feedback:       None recorded', 300, signoffY + 34);
    } else {
      // PATH C: Awaiting Sign-off / In Progress
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0284c7').text('⏳ Service Report Submitted — Awaiting Customer Sign-off', 50, signoffY + 8);
      doc.fontSize(8).font('Helvetica').fillColor('#64748b');
      doc.text(`Submission Timestamp:    ${formatDate(complaint.work_close_time)}`, 50, signoffY + 22);
      doc.text('Customer Sign-off:       Pending', 50, signoffY + 34);
      doc.text('Customer Service Rating: Pending', 300, signoffY + 22);
      doc.text('Customer Feedback:       Pending', 300, signoffY + 34);
    }

    doc.y = signoffY + 70;
    ensureSpace(50);

    // Signatures
    const sigY = doc.y + 15;
    doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(50, sigY).lineTo(220, sigY).stroke();
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b').text(
      `Engineer Sign-off: ${safeText(complaint.engineer_sign_name, engineer?.name || 'Assigned Representative')}`,
      50, sigY + 5
    );

    doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(330, sigY).lineTo(500, sigY).stroke();
    const custSignLabel = complaint.customer_confirmed_at
      ? `Customer Sign-off: ${safeText(complaint.customer_sign_name, customer.name)}`
      : complaint.auto_closed_at
        ? 'Customer Sign-off: Not recorded (Auto-Closed)'
        : 'Customer Sign-off: Awaiting Verification';
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1e293b').text(custSignLabel, 330, sigY + 5);

    doc.end();

  } catch (error) {
    console.error('Download FCR PDF error:', error.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate FCR PDF document' });
    }
  }
};

/**
 * Record Travel Start (Assigned Engineer ONLY)
 * POST /api/complaints/:id/travel/start
 */
const startTravel = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Authorization: Assigned engineer ONLY (Admin cannot simulate travel, Customer blocked)
    if (user.role !== 'ENGINEER' && user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned field engineer can record travel start' });
    }
    if (complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not the assigned engineer for this complaint' });
    }

    // Must be Accepted
    if (complaint.status_name !== 'Accepted') {
      return res.status(400).json({
        success: false,
        message: `Travel can only be started when the complaint is in 'Accepted' status. Current status: '${complaint.status_name}'`
      });
    }

    const client = await dbPool.connect();
    let fcrNumber = null;
    let fcr = null;
    try {
      await client.query('BEGIN');

      // Check/create FCR record
      let fcrCheck = await client.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);

      if (fcrCheck.rows.length === 0) {
        fcrNumber = await generateFcrNumber(client);
        const todayStr = new Date().toISOString().substring(0, 10);
        const insertRes = await client.query(`
          INSERT INTO field_call_reports (
            complaint_id, fcr_number, visit_date, visit_start_time, visit_end_time,
            call_type, problem_reported, diagnosed_problem, diagnosis, action_taken,
            resolution, suggestion_to_client, suggestions, activity_code, status,
            call_start_time, travel_start_time
          )
          VALUES (
            $1, $2, $3, '09:00', '10:00',
            'Breakdown', $4, '', '', '',
            '', '', '', 'ACT-01', 'Draft',
            $5, CURRENT_TIMESTAMP
          )
          RETURNING *
        `, [id, fcrNumber, todayStr, complaint.description || '', complaint.created_at]);
        fcr = insertRes.rows[0];
      } else {
        fcr = fcrCheck.rows[0];
        fcrNumber = fcr.fcr_number;

        if (fcr.travel_start_time) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(400).json({ success: false, message: 'Travel has already been started for this complaint' });
        }

        const updateRes = await client.query(`
          UPDATE field_call_reports
          SET travel_start_time = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE complaint_id = $1
          RETURNING *
        `, [id]);
        fcr = updateRes.rows[0];
      }

      await client.query('COMMIT');
      client.release();
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('TRAVEL_STARTED', { complaintId: id, ticketNumber: complaint.ticket_number, fcrNumber }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Travel start recorded successfully',
      data: fcr
    });

  } catch (error) {
    console.error('Start travel error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to record travel start: ${error.message}` });
  }
};

/**
 * Record Arrival at Site (Assigned Engineer ONLY)
 * POST /api/complaints/:id/travel/reached
 */
const reachedSite = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Authorization: Assigned engineer ONLY
    if (user.role !== 'ENGINEER' && user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the assigned field engineer can record site arrival' });
    }
    if (complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not the assigned engineer for this complaint' });
    }

    // Must be Accepted
    if (complaint.status_name !== 'Accepted') {
      return res.status(400).json({
        success: false,
        message: `Arrival at site can only be recorded when the complaint is in 'Accepted' status. Current status: '${complaint.status_name}'`
      });
    }

    // Check FCR travel_start_time
    const fcrCheck = await dbPool.query('SELECT * FROM field_call_reports WHERE complaint_id = $1', [id]);
    if (fcrCheck.rows.length === 0 || !fcrCheck.rows[0].travel_start_time) {
      return res.status(400).json({
        success: false,
        message: "Cannot record arrival at site before starting travel ('Start Travel')."
      });
    }

    const fcr = fcrCheck.rows[0];
    if (fcr.reached_site_time) {
      return res.status(400).json({ success: false, message: 'Arrival at site has already been recorded' });
    }

    const updateRes = await dbPool.query(`
      UPDATE field_call_reports
      SET reached_site_time = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE complaint_id = $1
      RETURNING *
    `, [id]);

    logger.audit('REACHED_SITE', { complaintId: id, ticketNumber: complaint.ticket_number, fcrNumber: fcr.fcr_number }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Arrival at site recorded successfully',
      data: updateRes.rows[0]
    });

  } catch (error) {
    console.error('Reached site error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to record arrival at site: ${error.message}` });
  }
};

module.exports = {
  getFcr,
  saveFcrDraft,
  createFcrDraft: saveFcrDraft,
  updateFcrDraft: saveFcrDraft,
  submitFcr,
  confirmFcr,
  startTravel,
  reachedSite,
  addPart,
  updatePart,
  deletePart,
  addDevice,
  updateDevice,
  deleteDevice,
  downloadFcrPdf
};

