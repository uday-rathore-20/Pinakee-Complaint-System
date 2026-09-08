const dbPool = require('../config/db');
const logger = require('../utils/logger');
const { routeTicket } = require('../utils/routingEngine');

/**
 * Generate a unique ticket number: PIN-YYYYMMDD-XXXX
 */
const generateTicketNumber = async () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // To guarantee uniqueness, generate and verify against DB
  let isUnique = false;
  let ticketNumber = '';

  while (!isUnique) {
    const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
    ticketNumber = `PIN-${dateStr}-${randomStr}`;

    const result = await dbPool.query('SELECT id FROM complaints WHERE ticket_number = $1', [ticketNumber]);
    if (result.rows.length === 0) {
      isUnique = true;
    }
  }

  return ticketNumber;
};

/**
 * Helper to check if a user has access to a specific complaint based on their role.
 */
const verifyComplaintAccess = (user, complaint) => {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ENGINEER' || user.role === 'AGENT') {
    return complaint.assigned_to_id === user.id;
  }
  if (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id) return true;
  if (user.role === 'CUSTOMER' && complaint.created_by_id === user.id) return true;
  return false;
};

/**
 * List complaints with role-based visibility and filters.
 * GET /api/complaints
 */
const getComplaints = async (req, res) => {
  const { status, priority, category, department, search, limit, offset, overdue, escalated, queue } = req.query;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Parse pagination parameters
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    const finalLimit = isNaN(parsedLimit) || parsedLimit < 1 ? 10 : parsedLimit;
    const finalOffset = isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

    let query = `
      SELECT c.id, c.ticket_number, c.title, c.description, c.created_at, c.updated_at, c.due_date, c.is_sla_breached,
             c.is_escalated, c.escalated_at, c.escalation_level, c.hold_reason, c.reopen_reason, c.cancellation_reason,
             u_creator.id AS creator_id, u_creator.first_name AS creator_first_name, u_creator.last_name AS creator_last_name, u_creator.email AS creator_email,
             cc.name AS category, cs.name AS status, cp.name AS priority,
             dept.name AS department, dept.id AS department_id,
             u_assignee.id AS assignee_id, u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name,
             COUNT(*) OVER() AS total_count
       FROM complaints c
       JOIN users u_creator ON c.created_by_id = u_creator.id
       LEFT JOIN complaint_categories cc ON c.category_id = cc.id
       JOIN complaint_statuses cs ON c.status_id = cs.id
       JOIN complaint_priorities cp ON c.priority_id = cp.id
       LEFT JOIN departments dept ON c.department_id = dept.id
       LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
    `;

    const whereClauses = [];
    const queryParams = [];

    // 1. Enforce role-based boundaries
    if (user.role === 'DEPT_HEAD') {
      if (user.department_id) {
        queryParams.push(user.department_id);
        whereClauses.push(`c.department_id = $${queryParams.length}`);
      }
      if (queue === 'unassigned') {
        whereClauses.push(`c.assigned_to_id IS NULL`);
      }
    } else if (user.role === 'ENGINEER' || user.role === 'AGENT') {
      // Engineers can ONLY see complaints specifically assigned to them
      queryParams.push(user.id);
      if (queue === 'claim_required' || queue === 'assigned') {
        whereClauses.push(`c.assigned_to_id = $${queryParams.length} AND cs.name = 'Assigned'`);
      } else if (queue === 'my' || queue === 'active') {
        whereClauses.push(`c.assigned_to_id = $${queryParams.length} AND cs.name != 'Assigned'`);
      } else {
        whereClauses.push(`c.assigned_to_id = $${queryParams.length}`);
      }
    } else if (user.role === 'CUSTOMER') {
      queryParams.push(user.id);
      whereClauses.push(`c.created_by_id = $${queryParams.length}`);
    }

    // 2. Map query filters
    if (status) {
      queryParams.push(status.trim());
      whereClauses.push(`LOWER(cs.name) = LOWER($${queryParams.length})`);
    }

    // Map priority filter
    if (priority) {
      queryParams.push(priority.trim());
      whereClauses.push(`LOWER(cp.name) = LOWER($${queryParams.length})`);
    }

    // Map category filter
    if (category) {
      queryParams.push(category.trim());
      whereClauses.push(`LOWER(cc.name) = LOWER($${queryParams.length})`);
    }

    // Map overdue filter
    if (overdue === 'true') {
      whereClauses.push(`(c.is_sla_breached = TRUE OR (c.due_date < CURRENT_TIMESTAMP AND cs.name NOT IN ('Resolved', 'Closed')))`);
    }

    // Map escalated filter
    if (escalated === 'true') {
      whereClauses.push('c.is_escalated = TRUE');
    } else if (escalated === 'false') {
      whereClauses.push('c.is_escalated = FALSE');
    }

    // Map department filter
    if (department) {
      queryParams.push(department.trim());
      if (isNaN(department)) {
        whereClauses.push(`LOWER(dept.name) = LOWER($${queryParams.length})`);
      } else {
        whereClauses.push(`c.department_id = $${queryParams.length}`);
      }
    }

    // 3. Keyword search (on title & description)
    if (search && search.trim() !== '') {
      queryParams.push(`%${search.trim()}%`);
      whereClauses.push(`(c.title ILIKE $${queryParams.length} OR c.description ILIKE $${queryParams.length})`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // Add pagination LIMIT and OFFSET to query
    queryParams.push(finalLimit);
    const limitPlaceholder = `$${queryParams.length}`;
    queryParams.push(finalOffset);
    const offsetPlaceholder = `$${queryParams.length}`;

    query += ` ORDER BY c.created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;

    const result = await dbPool.query(query, queryParams);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

    // Remove total_count column from output rows to keep schema clean
    const cleanedRows = result.rows.map(row => {
      const { total_count, ...cleaned } = row;
      return cleaned;
    });

    return res.status(200).json({
      success: true,
      pagination: {
        total: totalCount,
        limit: finalLimit,
        offset: finalOffset
      },
      count: cleanedRows.length,
      data: cleanedRows
    });
  } catch (error) {
    console.error('Get complaints error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve complaints' });
  }
};

/**
 * Get individual complaint by ID, including comments and status history.
 * GET /api/complaints/:id
 */
const getComplaintById = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint with customer, engineer, and service location details
    const query = `
      SELECT c.*,
             u_creator.first_name AS creator_first_name, u_creator.last_name AS creator_last_name, u_creator.email AS creator_email,
             u_creator.phone_number AS creator_phone_number, u_creator.address AS creator_address,
             u_creator.city AS creator_city, u_creator.state AS creator_state, u_creator.pincode AS creator_pincode,
             csl.location_code AS service_location_code, csl.location_name AS service_location_name,
             csl.address AS service_location_address, csl.city AS service_location_city,
             csl.state AS service_location_state, csl.pincode AS service_location_pincode,
             csl.contact_person AS service_location_contact_person, csl.contact_number AS service_location_contact_number,
             csl.email AS service_location_email,
             cc.name AS category, cs.name AS status, cp.name AS priority,
             dept.name AS department,
             u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name, u_assignee.email AS assignee_email,
             u_assignee.phone_number AS assignee_phone_number, u_assignee.address AS assignee_address,
             u_assignee.city AS assignee_city, u_assignee.state AS assignee_state, u_assignee.pincode AS assignee_pincode
      FROM complaints c
      JOIN users u_creator ON c.created_by_id = u_creator.id
      LEFT JOIN customer_service_locations csl ON c.service_location_id = csl.id
      LEFT JOIN complaint_categories cc ON c.category_id = cc.id
      JOIN complaint_statuses cs ON c.status_id = cs.id
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

    // Enforce visibility guards
    if (!verifyComplaintAccess(user, complaint)) {
      logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { complaintId: id, action: 'view' }, user, req.ip);
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view this complaint' });
    }

    // Fetch comments (hide internal comments from customer)
    let commentsQuery = `
      SELECT co.id, co.comment_text, co.is_internal, co.created_at,
             u.first_name, u.last_name, r.name AS role
      FROM complaint_comments co
      JOIN users u ON co.user_id = u.id
      JOIN roles r ON u.role_id = r.id
      WHERE co.complaint_id = $1
    `;
    const commentParams = [id];

    if (user.role === 'CUSTOMER') {
      commentsQuery += ` AND co.is_internal = false`;
    }

    commentsQuery += ` ORDER BY co.created_at ASC`;
    const commentsResult = await dbPool.query(commentsQuery, commentParams);

    // Fetch status history
    const historyQuery = `
      SELECT h.id, h.remarks, h.changed_at,
             u.first_name, u.last_name, r.name AS role,
             cs_old.name AS old_status, cs_new.name AS new_status
      FROM complaint_status_history h
      LEFT JOIN users u ON h.changed_by_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN complaint_statuses cs_old ON h.old_status_id = cs_old.id
      LEFT JOIN complaint_statuses cs_new ON h.new_status_id = cs_new.id
      WHERE h.complaint_id = $1
      ORDER BY h.changed_at ASC
    `;
    const historyResult = await dbPool.query(historyQuery, [id]);

    // Check if engineer has claimed the ticket
    const isEngineerUnclaimed = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.status === 'Assigned';

    if (isEngineerUnclaimed) {
      const minimalComplaint = {
        id: complaint.id,
        ticket_number: complaint.ticket_number,
        title: complaint.title,
        priority: complaint.priority,
        priority_id: complaint.priority_id,
        status: complaint.status,
        status_id: complaint.status_id,
        category: complaint.category,
        category_id: complaint.category_id,
        created_at: complaint.created_at,
        due_date: complaint.due_date,
        assigned_to_id: complaint.assigned_to_id,
        is_claim_required: true,
        description: 'Please claim this ticket to view full description and customer details.',
        creator_first_name: 'Customer',
        creator_last_name: '',
        creator_email: '***@***.***',
        creator_phone_number: null,
        creator_address: null,
        creator_city: null,
        creator_state: null,
        creator_pincode: null,
        service_location_name: null,
        service_location_address: null
      };

      return res.status(200).json({
        success: true,
        data: {
          complaint: minimalComplaint,
          customer: null,
          engineer: {
            id: user.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            email: user.email,
            status: complaint.status
          },
          comments: [],
          status_history: historyResult.rows.filter(h => h.new_status === 'Pending' || h.new_status === 'Assigned')
        }
      });
    }

    // Service Location details
    const serviceLocation = complaint.service_location_id ? {
      id: complaint.service_location_id,
      code: complaint.service_location_code,
      name: complaint.service_location_name,
      address: complaint.service_location_address,
      city: complaint.service_location_city,
      state: complaint.service_location_state,
      pincode: complaint.service_location_pincode,
      contact_person: complaint.service_location_contact_person,
      contact_number: complaint.service_location_contact_number,
      email: complaint.service_location_email
    } : null;

    // Full customer operational profile
    const customerProfile = {
      name: `${complaint.creator_first_name || ''} ${complaint.creator_last_name || ''}`.trim(),
      first_name: complaint.creator_first_name,
      last_name: complaint.creator_last_name,
      email: complaint.creator_email,
      phone: complaint.service_location_contact_number || complaint.creator_phone_number,
      address: complaint.service_location_address || complaint.creator_address,
      city: complaint.service_location_city || complaint.creator_city,
      state: complaint.service_location_state || complaint.creator_state,
      pincode: complaint.service_location_pincode || complaint.creator_pincode,
      location_name: complaint.service_location_name || null,
      service_location: serviceLocation
    };

    // Engineer profile based on caller role
    let engineerProfile = null;
    if (complaint.assigned_to_id) {
      if (user.role === 'ADMIN') {
        engineerProfile = {
          id: complaint.assigned_to_id,
          name: `${complaint.assignee_first_name || ''} ${complaint.assignee_last_name || ''}`.trim(),
          first_name: complaint.assignee_first_name,
          last_name: complaint.assignee_last_name,
          email: complaint.assignee_email,
          phone: complaint.assignee_phone_number,
          address: complaint.assignee_address,
          city: complaint.assignee_city,
          state: complaint.assignee_state,
          pincode: complaint.assignee_pincode,
          status: complaint.status
        };
      } else {
        // Customer and Assigned Engineer receive service communication contact (without private home address)
        engineerProfile = {
          id: complaint.assigned_to_id,
          name: `${complaint.assignee_first_name || ''} ${complaint.assignee_last_name || ''}`.trim(),
          first_name: complaint.assignee_first_name,
          last_name: complaint.assignee_last_name,
          email: complaint.assignee_email,
          phone: complaint.assignee_phone_number,
          status: complaint.status
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        complaint: { ...complaint, is_claim_required: false },
        customer: customerProfile,
        engineer: engineerProfile,
        comments: commentsResult.rows,
        status_history: historyResult.rows
      }
    });
  } catch (error) {
    console.error('Get complaint details error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve complaint details' });
  }
};

/**
 * File a new complaint.
 * POST /api/complaints
 */
const createComplaint = async (req, res) => {
  const { title, description, category_id, priority_id, created_by_id, department_id, service_location_id } = req.body;
  const user = req.user;

  // Validation
  if (!title || !description || !priority_id) {
    return res.status(400).json({ success: false, message: 'Title, description, and priority_id are required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Customer can only create complaints for themselves
    let targetCreatorId = user.id;
    if (user.role === 'ADMIN' && created_by_id) {
      targetCreatorId = created_by_id;
      // verify user exists
      const userCheck = await dbPool.query('SELECT id FROM users WHERE id = $1', [targetCreatorId]);
      if (userCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid creator user ID' });
      }
    }

    // Validate service_location_id if provided
    let validatedLocationId = null;
    let locationAddressSnapshot = null;
    if (service_location_id !== undefined && service_location_id !== null && service_location_id !== '') {
      const locCheck = await dbPool.query(
        'SELECT id, location_name, address, city, state, pincode, contact_person, contact_number FROM customer_service_locations WHERE id = $1 AND customer_id = $2 AND is_active = true',
        [service_location_id, targetCreatorId]
      );
      if (locCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Selected service location is invalid or inactive' });
      }
      const loc = locCheck.rows[0];
      validatedLocationId = loc.id;
      locationAddressSnapshot = `${loc.location_name}: ${loc.address}, ${loc.city}, ${loc.state} - ${loc.pincode}` + (loc.contact_person ? ` (Contact: ${loc.contact_person} ${loc.contact_number || ''})` : '');
    }

    // Verify category if provided
    let validatedCategoryId = null;
    if (category_id !== undefined && category_id !== null && category_id !== '') {
      const catCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid category_id' });
      }
      validatedCategoryId = parseInt(category_id, 10);
    }

    const priCheck = await dbPool.query('SELECT id, sla_hours FROM complaint_priorities WHERE id = $1', [priority_id]);
    if (priCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid priority_id' });
    }
    const slaHours = priCheck.rows[0].sla_hours;
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + slaHours);

    // Validate department_id if provided
    let targetDeptId = null;
    if (department_id) {
      const deptCheck = await dbPool.query('SELECT id FROM departments WHERE id = $1 AND is_active = true', [department_id]);
      if (deptCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive department_id' });
      }
      targetDeptId = department_id;
    }

    // Get status IDs
    const pendingStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Pending'");
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");

    if (pendingStatusResult.rows.length === 0 || assignedStatusResult.rows.length === 0) {
      return res.status(500).json({ success: false, message: 'Required status configurations are missing' });
    }

    const pendingId = pendingStatusResult.rows[0].id;
    const assignedId = assignedStatusResult.rows[0].id;

    // Generate unique ticket number
    const ticketNumber = await generateTicketNumber();

    // Start a transaction to ensure atomic auto-routing and insertion
    const client = await dbPool.connect();
    let resultComplaint = null;
    try {
      await client.query('BEGIN');

      let assignedAgentId = null;
      let targetStatusId = pendingId;

      if (targetDeptId) {
        assignedAgentId = await routeTicket(targetDeptId, client);
        if (assignedAgentId) {
          targetStatusId = assignedId;
        }
      }

      // Insert
      const insertQuery = `
        INSERT INTO complaints (
          ticket_number, title, description, created_by_id, category_id,
          status_id, priority_id, due_date, department_id, assigned_to_id,
          service_location_id, service_address_snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const insertRes = await client.query(insertQuery, [
        ticketNumber,
        title.trim(),
        description.trim(),
        targetCreatorId,
        validatedCategoryId,
        targetStatusId,
        priority_id,
        dueDate,
        targetDeptId,
        assignedAgentId,
        validatedLocationId,
        locationAddressSnapshot
      ]);

      resultComplaint = insertRes.rows[0];

      // Log the initial history entry
      const remark = assignedAgentId
        ? `Complaint registered and auto-assigned to agent ID ${assignedAgentId}`
        : 'Complaint registered successfully';

      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, null, $3, $4)
      `, [resultComplaint.id, user.id, targetStatusId, remark]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    logger.audit('COMPLAINT_CREATED', { complaintId: resultComplaint.id, ticketNumber: resultComplaint.ticket_number }, user, req.ip);

    const notifications = require('../utils/notifications');
    try {
      await notifications.notifyComplaintCreated(resultComplaint);
    } catch (err) {
      console.error('Failed to trigger in-app notification:', err);
    }

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: resultComplaint
    });
  } catch (error) {
    console.error('Create complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit complaint' });
  }
};

/**
 * Update complaint details (allowed only if ticket is Pending or user is Admin).
 * PUT /api/complaints/:id
 */
const updateComplaint = async (req, res) => {
  const { id } = req.params;
  const { title, description, category_id, priority_id } = req.body;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint
    const checkQuery = `
      SELECT c.*, cs.name AS status
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `;
    const checkResult = await dbPool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = checkResult.rows[0];

    // Enforce editing privileges
    const isAdmin = user.role === 'ADMIN';
    const isAssignedEngineer = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id && complaint.status !== 'Assigned';
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;

    if (!isAdmin && !isCreator && !isAssignedEngineer) {
      logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { complaintId: id, action: 'update' }, user, req.ip);
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify this complaint' });
    }

    // Creators can only update if status is Pending
    if (isCreator && !isAdmin && complaint.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Complaints can only be modified when their status is Pending' });
    }

    // Prepare update parameters
    const updateFields = [];
    const values = [];

    if (title && (isAdmin || isCreator)) {
      values.push(title.trim());
      updateFields.push(`title = $${values.length}`);
    }

    if (description && (isAdmin || isCreator)) {
      values.push(description.trim());
      updateFields.push(`description = $${values.length}`);
    }

    if (category_id !== undefined) {
      if (category_id === null || category_id === '') {
        values.push(null);
        updateFields.push(`category_id = $${values.length}`);
      } else {
        const catCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE id = $1', [category_id]);
        if (catCheck.rows.length === 0) {
          return res.status(400).json({ success: false, message: 'Invalid category_id' });
        }
        values.push(parseInt(category_id, 10));
        updateFields.push(`category_id = $${values.length}`);
      }
    }

    if (priority_id && (isAdmin || isCreator)) {
      const priCheck = await dbPool.query('SELECT id, sla_hours FROM complaint_priorities WHERE id = $1', [priority_id]);
      if (priCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid priority_id' });
      }
      const slaHours = priCheck.rows[0].sla_hours;
      const newDueDate = new Date(complaint.created_at);
      newDueDate.setHours(newDueDate.getHours() + slaHours);

      values.push(priority_id);
      updateFields.push(`priority_id = $${values.length}`);

      values.push(newDueDate);
      updateFields.push(`due_date = $${values.length}`);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateQuery = `
      UPDATE complaints
      SET ${updateFields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;
    const updateResult = await dbPool.query(updateQuery, values);

    logger.audit('COMPLAINT_UPDATED', { complaintId: id }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Complaint updated successfully',
      data: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Update complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update complaint' });
  }
};

/**
 * Assign complaint to a department and/or agent.
 * PATCH /api/complaints/:id/assign
 */
const assignComplaint = async (req, res) => {
  const { id } = req.params;
  const { department_id, assigned_to_id, remarks } = req.body;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Retrieve complaint joining priority details
    const compCheck = await dbPool.query(`
      SELECT c.*, cp.name AS priority
      FROM complaints c
      LEFT JOIN complaint_priorities cp ON c.priority_id = cp.id
      WHERE c.id = $1
    `, [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce role authorization: Admin or Dept Head
    if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD') {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions to route complaints' });
    }

    // Dept Head can only assign complaints inside their department
    if (user.role === 'DEPT_HEAD' && complaint.department_id !== user.department_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only route tickets assigned to your department' });
    }

    // Validate parameters
    if (department_id) {
      const deptExists = await dbPool.query('SELECT id FROM departments WHERE id = $1', [department_id]);
      if (deptExists.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid department_id' });
      }
    }

    if (assigned_to_id) {
      const userResult = await dbPool.query(`
        SELECT u.id, r.name AS role, u.department_id
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1 AND u.is_active = true
      `, [assigned_to_id]);

      if (userResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid assigned_to_id: user does not exist or is inactive' });
      }

      const targetAgent = userResult.rows[0];
      if (targetAgent.role === 'CUSTOMER') {
        return res.status(400).json({ success: false, message: 'Tickets cannot be assigned to customer accounts' });
      }
      if (targetAgent.role === 'ADMIN') {
        return res.status(400).json({ success: false, message: 'Tickets cannot be assigned to admin accounts' });
      }
      if (targetAgent.role !== 'ENGINEER' && targetAgent.role !== 'AGENT' && targetAgent.role !== 'DEPT_HEAD') {
        return res.status(400).json({ success: false, message: 'Tickets can only be assigned to engineers' });
      }
    }

    // Determine target department and assignee
    let finalDeptId = department_id !== undefined ? department_id : complaint.department_id;
    let finalAssigneeId = assigned_to_id !== undefined ? assigned_to_id : complaint.assigned_to_id;

    // Check if assignment triggers automatic status change from "Pending" or "Admin Review" to "Assigned"
    const pendingStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Pending'");
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
    const adminReviewStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Admin Review'");

    const pendingId = pendingStatusResult.rows[0]?.id;
    const assignedId = assignedStatusResult.rows[0]?.id;
    const adminReviewId = adminReviewStatusResult.rows[0]?.id;

    // Execute within a database transaction block
    const client = await dbPool.connect();
    let resultComplaint = null;
    try {
      await client.query('BEGIN');

      // Trigger auto-routing if department_id is set but assigned_to_id is not specified in this routing request
      if (department_id !== undefined && department_id !== null && !assigned_to_id) {
        const autoAgentId = await routeTicket(department_id, client);
        if (autoAgentId) {
          finalAssigneeId = autoAgentId;
        }
      }

      let targetStatusId = complaint.status_id;
      if ((complaint.status_id === pendingId || complaint.status_id === adminReviewId) && assignedId && (finalDeptId || finalAssigneeId)) {
        targetStatusId = assignedId;
      }

      // Execute assignment update
      const updateQuery = `
        UPDATE complaints
        SET department_id = $1, assigned_to_id = $2, status_id = $3
        WHERE id = $4
        RETURNING *
      `;
      const updateRes = await client.query(updateQuery, [finalDeptId || null, finalAssigneeId || null, targetStatusId, id]);
      resultComplaint = updateRes.rows[0];

      // Log the assignment remark or state change
      const defaultRemark = `Ticket routed (Dept ID: ${finalDeptId || 'None'}, Assignee ID: ${finalAssigneeId || 'None'})`;
      const auditRemark = remarks ? remarks.trim() : defaultRemark;

      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, targetStatusId, auditRemark]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // Send email notification to assignee if assignee has been changed or set
    if (finalAssigneeId && finalAssigneeId !== complaint.assigned_to_id) {
      const assigneeResult = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [finalAssigneeId]);
      if (assigneeResult.rows.length > 0) {
        const assigneeUser = assigneeResult.rows[0];
        const notifications = require('../utils/notifications');
        notifications.sendAssignmentNotification({
          ticket_number: resultComplaint.ticket_number,
          title: resultComplaint.title,
          priority: complaint.priority
        }, assigneeUser).catch(err => console.error('Failed to dispatch assignment email:', err));

        try {
          await notifications.notifyComplaintAssigned(resultComplaint, finalAssigneeId);
        } catch (err) {
          console.error('Failed to trigger in-app assignment notification:', err);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Complaint assignment updated successfully',
      data: resultComplaint
    });
  } catch (error) {
    console.error('Assign complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update complaint routing/assignment' });
  }
};

/**
 * Claim/Accept a complaint by the assigned Engineer.
 * Transitions status: Assigned -> Accepted
 * PATCH /api/complaints/:id/claim
 */
const claimComplaint = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Enforce role authorization: ENGINEER, AGENT or DEPT_HEAD
  if (user.role !== 'ENGINEER' && user.role !== 'AGENT' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Only Engineers can claim complaints' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint joining statuses and priorities
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS status_name, cp.name AS priority
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      LEFT JOIN complaint_priorities cp ON c.priority_id = cp.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Validate that this engineer is the specific engineer assigned by ADMIN
    if (complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You are not the engineer assigned to this complaint' });
    }

    // Validate that ticket is awaiting claim (status Assigned)
    if (complaint.status_name !== 'Assigned') {
      return res.status(400).json({ success: false, message: `This ticket cannot be accepted from current status '${complaint.status_name}'` });
    }

    // Fetch Accepted status id
    const acceptedResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Accepted'");
    const acceptedId = acceptedResult.rows[0]?.id;

    if (!acceptedId) {
      return res.status(500).json({ success: false, message: 'Accepted status configuration is missing' });
    }

    // Update complaint status to Accepted
    const updateResult = await dbPool.query(`
      UPDATE complaints
      SET status_id = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [acceptedId, id]);

    // Log status history
    const auditRemark = 'Complaint accepted by assigned engineer';
    await dbPool.query(`
      INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user.id, complaint.status_id, acceptedId, auditRemark]);

    logger.audit('COMPLAINT_ACCEPTED', { complaintId: id, ticketNumber: updateResult.rows[0].ticket_number }, user, req.ip);

    // Send notifications
    const notifications = require('../utils/notifications');
    notifications.notifyComplaintAccepted(complaint, `${user.first_name} ${user.last_name}`).catch(err => console.error(err));

    return res.status(200).json({
      success: true,
      message: 'Complaint accepted successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Claim complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to accept complaint' });
  }
};

/**
 * Update complaint status (manually transition status).
 * PATCH /api/complaints/:id/status
 */
const updateComplaintStatus = async (req, res) => {
  const { id } = req.params;
  const { status_id, remarks, hold_reason } = req.body;
  const user = req.user;

  if (!status_id) {
    return res.status(400).json({ success: false, message: 'status_id is required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Verify target status exists
    const statusCheck = await dbPool.query('SELECT id, name FROM complaint_statuses WHERE id = $1', [status_id]);
    if (statusCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid status_id' });
    }
    const targetStatus = statusCheck.rows[0];

    // Fetch current complaint state
    const compQuery = `
      SELECT c.*, cs.name AS current_status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `;
    const compResult = await dbPool.query(compQuery, [id]);

    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compResult.rows[0];

    // Enforce role authorization
    const isAdmin = user.role === 'ADMIN';
    const isDeptHead = user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id;
    const isAssignee = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;

    if (!isAdmin && !isDeptHead && !isAssignee && !isCreator) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to update status' });
    }

    const current = complaint.current_status_name;
    const target = targetStatus.name;

    const isCurrentPaused = ['On Hold', 'Waiting on Customer'].includes(current);
    const isTargetPaused = ['On Hold', 'Waiting on Customer'].includes(target);

    // Terminal state protection: Closed or Cancelled complaints cannot be transitioned
    if (current === 'Closed' || current === 'Cancelled') {
      return res.status(400).json({ success: false, message: `${current} tickets cannot be modified` });
    }

    // Validate hold reason if target is On Hold
    const effectiveHoldReason = (hold_reason && hold_reason.trim()) || (remarks && remarks.trim());
    if (target === 'On Hold') {
      if (!effectiveHoldReason) {
        return res.status(400).json({ success: false, message: 'A valid reason is required when putting a complaint on hold' });
      }
    }

    // Role-specific transition matrix
    if (user.role === 'CUSTOMER') {
      if (current === 'Pending' && target === 'Cancelled') {
        // Customer cancelling own pending complaint
      } else if (current === 'Resolved' && target === 'Closed') {
        // Customer confirming resolution
      } else {
        return res.status(403).json({ success: false, message: `Forbidden: Customers cannot transition ticket from '${current}' to '${target}'` });
      }
    } else if (user.role === 'ENGINEER' || user.role === 'AGENT') {
      if (complaint.assigned_to_id !== user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only update the status of tickets assigned to you' });
      }

      if (current === 'Assigned' && target === 'Accepted') {
        // Engineer accepts complaint
      } else if (current === 'Accepted' && target === 'In Progress') {
        // Enforce that arrival at site has been recorded
        const fcrCheck = await dbPool.query('SELECT reached_site_time FROM field_call_reports WHERE complaint_id = $1', [id]);
        if (fcrCheck.rows.length === 0 || !fcrCheck.rows[0].reached_site_time) {
          return res.status(400).json({
            success: false,
            message: "Cannot start work before recording arrival at site ('Reached Site')."
          });
        }
      } else if (['Accepted', 'In Progress'].includes(current) && target === 'On Hold') {
        // Engineer places on hold (mandatory reason validated)
      } else if (current === 'On Hold' && target === 'In Progress') {
        // Engineer resumes work
      } else {
        return res.status(400).json({ success: false, message: `Invalid status transition from '${current}' to '${target}' for Engineer` });
      }
    } else {
      // ADMIN or DEPT_HEAD manual transitions
      if (['Accepted', 'In Progress'].includes(current) && target === 'On Hold') {
        // Allowed
      } else if (current === 'On Hold' && target === 'In Progress') {
        // Allowed
      } else if (current === 'Pending' && target === 'Cancelled') {
        // Allowed
      } else if (current === 'Admin Review' && target === 'Assigned') {
        // Allowed
      } else if (current === 'Assigned' && target === 'Accepted') {
        // Allowed
      } else if (current === 'Accepted' && target === 'In Progress') {
        // Allowed
      } else if (current === 'Resolved' && target === 'Closed') {
        // Allowed
      } else {
        return res.status(400).json({ success: false, message: `Invalid status transition from '${current}' to '${target}'` });
      }
    }

    // Execute state transition atomically inside a transaction block
    const client = await dbPool.connect();
    let resultComplaint = null;

    try {
      await client.query('BEGIN');

      let updateQuery = '';
      let queryParams = [];

      if (isTargetPaused && !isCurrentPaused) {
        // Transitioning INTO paused status (On Hold / Waiting on Customer)
        updateQuery = `
          UPDATE complaints
          SET status_id = $1,
              hold_reason = $2,
              paused_at = COALESCE(paused_at, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING *
        `;
        queryParams = [status_id, effectiveHoldReason, id];
      } else if (isCurrentPaused && !isTargetPaused) {
        // Transitioning FROM paused status to active status
        updateQuery = `
          UPDATE complaints
          SET status_id = $1,
              total_paused_duration = total_paused_duration + (CURRENT_TIMESTAMP - paused_at),
              due_date = due_date + (CURRENT_TIMESTAMP - paused_at),
              paused_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status_id, id];
      } else {
        // Normal non-pause-state updates
        updateQuery = `
          UPDATE complaints
          SET status_id = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status_id, id];
      }

      const updateResult = await client.query(updateQuery, queryParams);
      resultComplaint = updateResult.rows[0];

      // Update work_start_time in field_call_reports if transitioning Accepted -> In Progress
      if (target === 'In Progress' && current === 'Accepted') {
        await client.query(`
          UPDATE field_call_reports
          SET work_start_time = COALESCE(work_start_time, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE complaint_id = $1
        `, [id]);
      }

      // Log in status history audit
      let historyRemark = remarks ? remarks.trim() : `Status changed from '${complaint.current_status_name}' to '${targetStatus.name}'`;
      if (target === 'On Hold') {
        historyRemark = effectiveHoldReason;
      } else if (target === 'In Progress' && current === 'Accepted') {
        historyRemark = 'Engineer started active work';
      }

      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, status_id, historyRemark]);

      await client.query('COMMIT');
      client.release();

      if (target === 'In Progress' && current === 'Accepted') {
        logger.audit('WORK_STARTED', { complaintId: id, ticketNumber: complaint.ticket_number }, user, req.ip);
      }

      const notifications = require('../utils/notifications');
      notifications.notifyStatusChanged(complaint, complaint.current_status_name, targetStatus.name)
        .catch(err => console.error('Failed to trigger status change notification:', err));

      if (target === 'On Hold') {
        notifications.notifyComplaintOnHold(complaint, effectiveHoldReason).catch(err => console.error(err));
      } else if (target === 'In Progress' && current === 'Accepted') {
        notifications.notifyWorkStarted(complaint).catch(err => console.error(err));
      } else if (target === 'In Progress' && isCurrentPaused) {
        notifications.notifyComplaintResumed(complaint).catch(err => console.error(err));
      } else if (target === 'Accepted') {
        notifications.notifyComplaintAccepted(complaint, `${user.first_name} ${user.last_name}`).catch(err => console.error(err));
      }

      // Send resolution notification to creator if new status is Resolved
      if (targetStatus.name === 'Resolved') {
        const creatorResult = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [complaint.created_by_id]);
        if (creatorResult.rows.length > 0) {
          const creatorUser = creatorResult.rows[0];
          notifications.sendResolutionNotification({
            ticket_number: resultComplaint.ticket_number,
            title: resultComplaint.title
          }, creatorUser).catch(err => console.error('Failed to dispatch resolution email:', err));
        }
      }

      return res.status(200).json({
        success: true,
        message: `Complaint status updated to '${targetStatus.name}'`,
        data: resultComplaint
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
  } catch (error) {
    console.error('Update status error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update complaint status' });
  }
};

/**
 * Add a comment/message to a complaint.
 * POST /api/complaints/:id/comments
 */
const addComment = async (req, res) => {
  const { id } = req.params;
  const { comment_text, is_internal } = req.body;
  const user = req.user;

  if (!comment_text || comment_text.trim() === '') {
    return res.status(400).json({ success: false, message: 'Comment text is required' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check if complaint exists joining the status name
    const compCheck = await dbPool.query(`
      SELECT c.*, cs.name AS current_status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Enforce access control
    if (!verifyComplaintAccess(user, complaint)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to comment on this complaint' });
    }

    // Engineers must claim ticket before posting comments
    if ((user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.current_status_name === 'Assigned') {
      return res.status(400).json({ success: false, message: 'Please claim the ticket before posting comments' });
    }

    // Customers cannot post internal comments
    let targetIsInternal = is_internal === true;
    if (user.role === 'CUSTOMER') {
      targetIsInternal = false;
    }

    const triggerAutoResume = user.role === 'CUSTOMER' && !targetIsInternal && complaint.current_status_name === 'Waiting on Customer';

    // Start database transaction to execute comment insertion and SLA resume atomically
    const client = await dbPool.connect();
    let commentRecord = null;
    let updatedComplaint = complaint;

    try {
      await client.query('BEGIN');

      // Insert comment
      const commentRes = await client.query(`
        INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [id, user.id, comment_text.trim(), targetIsInternal]);
      commentRecord = commentRes.rows[0];

      if (triggerAutoResume) {
        // Resolve target active status: Assigned if assigned_to_id exists, otherwise In Progress
        const targetStatusName = complaint.assigned_to_id ? 'Assigned' : 'In Progress';
        const statusRes = await client.query('SELECT id FROM complaint_statuses WHERE name = $1', [targetStatusName]);
        const targetStatusId = statusRes.rows[0].id;

        // Perform SLA Resume update on complaints table
        const updateRes = await client.query(`
          UPDATE complaints
          SET status_id = $1,
              total_paused_duration = total_paused_duration + (CURRENT_TIMESTAMP - paused_at),
              due_date = due_date + (CURRENT_TIMESTAMP - paused_at),
              paused_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `, [targetStatusId, id]);
        updatedComplaint = updateRes.rows[0];

        // Fetch old status ID for history log
        const oldStatusRes = await client.query("SELECT id FROM complaint_statuses WHERE name = 'Waiting on Customer'");
        const oldStatusId = oldStatusRes.rows[0].id;

        // Log status change in history
        await client.query(`
          INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
          VALUES ($1, $2, $3, $4, $5)
        `, [id, user.id, oldStatusId, targetStatusId, 'SLA Resumed automatically: Customer posted a comment.']);
      }

      await client.query('COMMIT');
      client.release();

      // Trigger status changed notifications if auto-resume was triggered
      if (triggerAutoResume) {
        const targetStatusName = complaint.assigned_to_id ? 'Assigned' : 'In Progress';
        const notifications = require('../utils/notifications');
        notifications.notifyStatusChanged(complaint, complaint.current_status_name, targetStatusName)
          .catch(err => console.error('Failed to trigger auto-resume status change notification:', err));
      }

      // Send comment notifications
      if (user.id === complaint.created_by_id) {
        // Customer commented: notify assigned agent (if assigned)
        if (complaint.assigned_to_id) {
          const assigneeResult = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [complaint.assigned_to_id]);
          if (assigneeResult.rows.length > 0) {
            const assigneeUser = assigneeResult.rows[0];
            const notifications = require('../utils/notifications');
            notifications.sendCommentNotification({
              ticket_number: complaint.ticket_number,
              title: complaint.title
            }, {
              author_name: `${user.first_name} ${user.last_name}`,
              comment_text: comment_text.trim()
            }, assigneeUser).catch(err => console.error('Failed to notify assignee agent:', err));
          }
        }
      } else if (!targetIsInternal) {
        // Agent/Staff/Admin posted a public comment: notify customer/creator
        const creatorResult = await dbPool.query('SELECT first_name, last_name, email FROM users WHERE id = $1', [complaint.created_by_id]);
        if (creatorResult.rows.length > 0) {
          const creatorUser = creatorResult.rows[0];
          const notifications = require('../utils/notifications');
          notifications.sendCommentNotification({
            ticket_number: complaint.ticket_number,
            title: complaint.title
          }, {
            author_name: `${user.first_name} ${user.last_name}`,
            comment_text: comment_text.trim()
          }, creatorUser).catch(err => console.error('Failed to notify ticket customer:', err));
        }
      }

      // Emit real-time comment notification event
      try {
        const { emitCommentCreated } = require('../utils/socket');
        emitCommentCreated(commentRecord, user);
      } catch (socketErr) {
        console.error('Socket emission failed for comment creation:', socketErr.message);
      }

      return res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        data: commentRecord
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }
  } catch (error) {
    console.error('Add comment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to post comment' });
  }
};

const exportComplaints = async (req, res) => {
  const user = req.user;

  // Double check ADMIN role authorization
  if (user.role !== 'ADMIN') {
    logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'export_csv' }, user, req.ip);
    return res.status(403).json({ success: false, message: 'Forbidden: Admin access only' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT c.ticket_number, c.title, c.description, c.created_at,
             u_creator.first_name AS creator_first_name, u_creator.last_name AS creator_last_name,
             cc.name AS category, cs.name AS status, cp.name AS priority,
             dept.name AS department,
             u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name
      FROM complaints c
      JOIN users u_creator ON c.created_by_id = u_creator.id
      LEFT JOIN complaint_categories cc ON c.category_id = cc.id
      JOIN complaint_statuses cs ON c.status_id = cs.id
      JOIN complaint_priorities cp ON c.priority_id = cp.id
      LEFT JOIN departments dept ON c.department_id = dept.id
      LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
      ORDER BY c.created_at DESC
    `;

    const result = await dbPool.query(query);
    logger.audit('COMPLAINTS_EXPORTED_CSV', { recordCount: result.rows.length }, user, req.ip);

    // Format helper to escape CSV values containing commas or quotes
    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const stringVal = String(val);
      if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    };

    const headers = ['Ticket Number', 'Title', 'Description', 'Creator', 'Category', 'Priority', 'Status', 'Department', 'Assigned Agent', 'Date Created'];
    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const creatorName = `${row.creator_first_name} ${row.creator_last_name}`;
      const assigneeName = row.assignee_first_name ? `${row.assignee_first_name} ${row.assignee_last_name}` : 'Unassigned';

      const csvRow = [
        escapeCSV(row.ticket_number),
        escapeCSV(row.title),
        escapeCSV(row.description),
        escapeCSV(creatorName),
        escapeCSV(row.category),
        escapeCSV(row.priority),
        escapeCSV(row.status),
        escapeCSV(row.department || 'General'),
        escapeCSV(assigneeName),
        escapeCSV(new Date(row.created_at).toISOString())
      ];
      csvRows.push(csvRow.join(','));
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="complaints_export_${Date.now()}.csv"`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export complaints error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to export complaints logs' });
  }
};

/**
 * Reopen a resolved complaint.
 * 2-Step Atomic Transition: Resolved -> Reopened -> Admin Review
 * POST /api/complaints/:id/reopen
 */
const reopenComplaint = async (req, res) => {
  const { id } = req.params;
  const reasonText = (req.body?.reason || req.body?.reopen_reason || '').trim();
  const user = req.user;

  if (!reasonText) {
    return res.status(400).json({
      success: false,
      message: 'A detailed reason is required when reopening a complaint'
    });
  }

  const reason = reasonText;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint and current status
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

    // Authorization: Only ticket creator (Customer) or Admin can reopen
    if (user.role === 'CUSTOMER' && complaint.created_by_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only reopen your own complaints' });
    }
    if (user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only customers or administrators can reopen complaints' });
    }

    // Check status: Must be 'Resolved'
    if (complaint.status_name !== 'Resolved') {
      return res.status(400).json({
        success: false,
        message: `Only Resolved complaints can be reopened. Current status: ${complaint.status_name}`
      });
    }

    // Fetch status IDs for Resolved, Reopened, Admin Review
    const statusesRes = await dbPool.query(
      "SELECT id, name FROM complaint_statuses WHERE name IN ('Resolved', 'Reopened', 'Admin Review')"
    );
    const statusMap = {};
    statusesRes.rows.forEach(r => { statusMap[r.name] = r.id; });

    const resolvedId = statusMap['Resolved'] || complaint.status_id;
    const reopenedId = statusMap['Reopened'];
    const adminReviewId = statusMap['Admin Review'];

    if (!reopenedId || !adminReviewId) {
      return res.status(500).json({ success: false, message: 'Required status configuration (Reopened / Admin Review) is missing' });
    }

    const trimmedReason = reason.trim();
    const customerName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    // Execute atomic 2-step status transition inside a transaction
    const client = await dbPool.connect();
    let updatedComplaint = null;

    try {
      await client.query('BEGIN');

      // Step 1: Record status history entry for Resolved -> Reopened
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, resolvedId, reopenedId, trimmedReason]);

      // Step 2: Record status history entry for Reopened -> Admin Review
      const automatedRemark = 'Automated workflow: Queued for Administrative Review and reassignment';
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, reopenedId, adminReviewId, automatedRemark]);

      // Step 3: Update complaints table to Admin Review with reopen_reason
      const updateRes = await client.query(`
        UPDATE complaints
        SET status_id = $1,
            reopen_reason = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [adminReviewId, trimmedReason, id]);

      updatedComplaint = updateRes.rows[0];

      // Step 4: Reopen FCR report to Draft so engineer can re-visit and submit updated service report
      await client.query(`
        UPDATE field_call_reports
        SET status = 'Draft',
            travel_start_time = NULL,
            reached_site_time = NULL,
            work_close_time = NULL,
            reminder_24h_sent_at = NULL,
            reminder_48h_sent_at = NULL,
            auto_closed_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE complaint_id = $1
      `, [id]);

      await client.query('COMMIT');
      client.release();
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('COMPLAINT_REOPENED', { complaintId: id, ticketNumber: complaint.ticket_number, reason: trimmedReason }, user, req.ip);

    // Notify admins
    const notifications = require('../utils/notifications');
    notifications.notifyComplaintReopened(complaint, trimmedReason, customerName)
      .catch(err => console.error('Failed to notify complaint reopened:', err));

    return res.status(200).json({
      success: true,
      message: 'Complaint reopened and queued for Admin Review',
      data: updatedComplaint
    });

  } catch (error) {
    console.error('Reopen complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reopen complaint' });
  }
};

/**
 * Cancel a complaint (Non-destructive cancellation).
 * DELETE /api/complaints/:id
 */
const deleteComplaint = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Retrieve complaint with status name
    const compResult = await dbPool.query(`
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `, [id]);

    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compResult.rows[0];

    // Authorization checks
    if (user.role === 'CUSTOMER') {
      if (complaint.created_by_id !== user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only cancel your own complaints' });
      }

      // Check status: ONLY allowed if status is 'Pending'
      if (complaint.status_name !== 'Pending') {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel complaint once it has entered active processing (Status: ${complaint.status_name})`
        });
      }
    } else if (user.role === 'ADMIN') {
      // ADMIN is allowed to cancel
    } else {
      // ENGINEER / other roles cannot cancel complaints
      return res.status(403).json({ success: false, message: 'Forbidden: Only customer (for own pending complaints) or admin can cancel complaints' });
    }

    // Fetch Cancelled status ID
    const cancelledRes = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Cancelled'");
    const cancelledId = cancelledRes.rows[0]?.id;

    if (!cancelledId) {
      return res.status(500).json({ success: false, message: 'Cancelled status configuration is missing' });
    }

    const cancelReason = (reason && reason.trim()) || (user.role === 'CUSTOMER' ? 'Cancelled by customer' : 'Cancelled by administrator');

    // Non-destructive transition: Update status to Cancelled and record in history (preserves all rows and attachments)
    const client = await dbPool.connect();
    let updatedComplaint = null;

    try {
      await client.query('BEGIN');

      const updateRes = await client.query(`
        UPDATE complaints
        SET status_id = $1,
            cancellation_reason = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [cancelledId, cancelReason, id]);

      updatedComplaint = updateRes.rows[0];

      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, cancelledId, cancelReason]);

      await client.query('COMMIT');
      client.release();
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('COMPLAINT_CANCELLED', { complaintId: id, ticketNumber: complaint.ticket_number, reason: cancelReason }, user, req.ip);

    const notifications = require('../utils/notifications');
    notifications.notifyComplaintCancelled(complaint, cancelReason).catch(err => console.error(err));

    return res.status(200).json({
      success: true,
      message: 'Complaint cancelled successfully',
      data: updatedComplaint
    });

  } catch (error) {
    console.error('Cancel complaint error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel complaint'
    });
  }
};

/**
 * Request ticket reassignment (Assigned Engineer ONLY)
 * POST /api/complaints/:id/reassignment/request
 */
const requestReassignment = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = req.user;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Reassignment reason is mandatory' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const compCheck = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // Authorization: Assigned Engineer ONLY
    if (user.role !== 'ENGINEER' && user.role !== 'AGENT') {
      return res.status(403).json({ success: false, message: 'Forbidden: Only engineers can request reassignment' });
    }
    if (complaint.assigned_to_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only request reassignment for tickets currently assigned to you' });
    }

    // Check if there is already a PENDING request for this complaint
    const pendingCheck = await dbPool.query(
      "SELECT id FROM complaint_reassignment_requests WHERE complaint_id = $1 AND status = 'PENDING'",
      [id]
    );
    if (pendingCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'A reassignment request is already pending for this complaint'
      });
    }

    const insertRes = await dbPool.query(`
      INSERT INTO complaint_reassignment_requests (
        complaint_id, requested_by_id, assigned_engineer_id, reason, status
      )
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *
    `, [id, user.id, user.id, reason.trim()]);

    logger.audit('REASSIGNMENT_REQUESTED', {
      complaintId: id,
      ticketNumber: complaint.ticket_number,
      requestId: insertRes.rows[0].id,
      reason: reason.trim()
    }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Reassignment request submitted successfully and queued for administrative review',
      data: insertRes.rows[0]
    });

  } catch (error) {
    console.error('Request reassignment error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to request reassignment: ${error.message}` });
  }
};

/**
 * Reject ticket reassignment request (Admin / Dept Head ONLY)
 * POST /api/complaints/:id/reassignment/reject
 */
const rejectReassignment = async (req, res) => {
  const { id } = req.params;
  const { request_id, decision_reason } = req.body;
  const user = req.user;

  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to reject reassignment requests' });
  }

  if (!decision_reason || !decision_reason.trim()) {
    return res.status(400).json({ success: false, message: 'Rejection decision reason is mandatory' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let reqCheck;
    if (request_id) {
      reqCheck = await dbPool.query(
        'SELECT * FROM complaint_reassignment_requests WHERE id = $1 AND complaint_id = $2',
        [request_id, id]
      );
    } else {
      reqCheck = await dbPool.query(
        "SELECT * FROM complaint_reassignment_requests WHERE complaint_id = $1 AND status = 'PENDING' ORDER BY requested_at DESC LIMIT 1",
        [id]
      );
    }

    if (reqCheck.rows.length === 0 || reqCheck.rows[0].status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending reassignment request found for this complaint' });
    }

    const reassignReq = reqCheck.rows[0];

    const updateRes = await dbPool.query(`
      UPDATE complaint_reassignment_requests
      SET status = 'REJECTED',
          decided_by_id = $1,
          decision_reason = $2,
          decided_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [user.id, decision_reason.trim(), reassignReq.id]);

    logger.audit('REASSIGNMENT_REJECTED', {
      complaintId: id,
      requestId: reassignReq.id,
      decisionReason: decision_reason.trim()
    }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Reassignment request rejected successfully',
      data: updateRes.rows[0]
    });

  } catch (error) {
    console.error('Reject reassignment error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to reject reassignment request: ${error.message}` });
  }
};

/**
 * Approve ticket reassignment and assign new engineer (Admin / Dept Head ONLY)
 * POST /api/complaints/:id/reassignment/approve
 */
const approveReassignment = async (req, res) => {
  const { id } = req.params;
  const { request_id, new_engineer_id, decision_reason } = req.body;
  const user = req.user;

  if (user.role !== 'ADMIN' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to approve reassignment requests' });
  }

  if (!new_engineer_id) {
    return res.status(400).json({ success: false, message: 'New engineer ID is mandatory for approval' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint
    const compCheck = await dbPool.query(`
      SELECT c.*, cp.name AS priority
      FROM complaints c
      LEFT JOIN complaint_priorities cp ON c.priority_id = cp.id
      WHERE c.id = $1
    `, [id]);

    if (compCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compCheck.rows[0];

    // 2. Fetch pending request
    let reqCheck;
    if (request_id) {
      reqCheck = await dbPool.query(
        'SELECT * FROM complaint_reassignment_requests WHERE id = $1 AND complaint_id = $2',
        [request_id, id]
      );
    } else {
      reqCheck = await dbPool.query(
        "SELECT * FROM complaint_reassignment_requests WHERE complaint_id = $1 AND status = 'PENDING' ORDER BY requested_at DESC LIMIT 1",
        [id]
      );
    }

    if (reqCheck.rows.length === 0 || reqCheck.rows[0].status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'No pending reassignment request found for this complaint' });
    }

    const reassignReq = reqCheck.rows[0];

    // Stale check (Correction 2): Verify request.assigned_engineer_id matches the complaint's current assigned engineer
    if (reassignReq.assigned_engineer_id !== complaint.assigned_to_id) {
      return res.status(400).json({
        success: false,
        message: "Cannot approve request: The complaint's assigned engineer has changed since this request was submitted"
      });
    }

    // Validate new engineer
    const engCheck = await dbPool.query(`
      SELECT u.id, r.name AS role, u.first_name, u.last_name, u.email
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1 AND u.is_active = true
    `, [new_engineer_id]);

    if (engCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid new_engineer_id: user does not exist or is inactive' });
    }

    const targetAgent = engCheck.rows[0];
    if (targetAgent.role !== 'ENGINEER' && targetAgent.role !== 'AGENT' && targetAgent.role !== 'DEPT_HEAD') {
      return res.status(400).json({ success: false, message: 'Complaints can only be assigned to engineers' });
    }

    // Fetch Assigned status
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
    const assignedStatusId = assignedStatusResult.rows[0]?.id;

    const client = await dbPool.connect();
    let updatedComplaint = null;

    try {
      await client.query('BEGIN');

      // Update complaint assignment
      const compUpdateRes = await client.query(`
        UPDATE complaints
        SET assigned_to_id = $1,
            status_id = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [new_engineer_id, assignedStatusId, id]);
      updatedComplaint = compUpdateRes.rows[0];

      // Update reassignment request to APPROVED
      await client.query(`
        UPDATE complaint_reassignment_requests
        SET status = 'APPROVED',
            new_engineer_id = $1,
            decided_by_id = $2,
            decision_reason = $3,
            decided_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [new_engineer_id, user.id, decision_reason ? decision_reason.trim() : 'Approved by administrator', reassignReq.id]);

      // Record in complaint_status_history
      const historyRemark = `Reassignment approved by ${user.first_name || 'Admin'}: Assigned to ${targetAgent.first_name} ${targetAgent.last_name}`;
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, assignedStatusId, historyRemark]);

      await client.query('COMMIT');
      client.release();
    } catch (txErr) {
      await client.query('ROLLBACK');
      client.release();
      throw txErr;
    }

    logger.audit('REASSIGNMENT_APPROVED', {
      complaintId: id,
      requestId: reassignReq.id,
      oldEngineerId: reassignReq.assigned_engineer_id,
      newEngineerId: new_engineer_id
    }, user, req.ip);

    // Notify new engineer
    const notifications = require('../utils/notifications');
    notifications.sendAssignmentNotification({
      ticket_number: updatedComplaint.ticket_number,
      title: updatedComplaint.title,
      priority: complaint.priority
    }, targetAgent).catch(err => console.error(err));

    return res.status(200).json({
      success: true,
      message: 'Reassignment request approved and ticket assigned to new engineer',
      data: updatedComplaint
    });

  } catch (error) {
    console.error('Approve reassignment error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to approve reassignment: ${error.message}` });
  }
};

/**
 * Get all reassignment requests history for a complaint
 * GET /api/complaints/:id/reassignment/requests
 */
const getReassignmentRequests = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

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

    return res.status(200).json({
      success: true,
      data: reassignRes.rows
    });
  } catch (error) {
    console.error('Get reassignment requests error:', error.message);
    return res.status(500).json({ success: false, message: `Failed to retrieve reassignment history: ${error.message}` });
  }
};

module.exports = {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  claimComplaint,
  updateComplaintStatus,
  reopenComplaint,
  addComment,
  exportComplaints,
  deleteComplaint,
  requestReassignment,
  rejectReassignment,
  approveReassignment,
  getReassignmentRequests
};
