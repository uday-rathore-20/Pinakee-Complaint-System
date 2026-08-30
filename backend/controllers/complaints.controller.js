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
  if (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id) return true;
  if (user.role === 'AGENT') {
    if (complaint.assigned_to_id === user.id) return true;
    if (complaint.assigned_to_id === null && complaint.department_id === user.department_id) return true;
  }
  if (user.role === 'CUSTOMER' && complaint.created_by_id === user.id) return true;
  return false;
};

/**
 * List complaints with role-based visibility and filters.
 * GET /api/complaints
 */
const getComplaints = async (req, res) => {
  const { status, priority, category, department, search, limit, offset, overdue, escalated } = req.query;
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
             c.is_escalated, c.escalated_at, c.escalation_level,
             u_creator.id AS creator_id, u_creator.first_name AS creator_first_name, u_creator.last_name AS creator_last_name, u_creator.email AS creator_email,
             cc.name AS category, cs.name AS status, cp.name AS priority,
             dept.name AS department, dept.id AS department_id,
             u_assignee.id AS assignee_id, u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name,
             COUNT(*) OVER() AS total_count
       FROM complaints c
       JOIN users u_creator ON c.created_by_id = u_creator.id
       JOIN complaint_categories cc ON c.category_id = cc.id
       JOIN complaint_statuses cs ON c.status_id = cs.id
       JOIN complaint_priorities cp ON c.priority_id = cp.id
       LEFT JOIN departments dept ON c.department_id = dept.id
       LEFT JOIN users u_assignee ON c.assigned_to_id = u_assignee.id
    `;

    const whereClauses = [];
    const queryParams = [];

    // 1. Enforce role-based boundaries
    const { queue } = req.query;

    if (user.role === 'DEPT_HEAD') {
      if (!user.department_id) {
        return res.status(200).json({
          success: true,
          pagination: { total: 0, limit: finalLimit, offset: finalOffset },
          count: 0,
          data: []
        });
      }
      queryParams.push(user.department_id);
      whereClauses.push(`c.department_id = $${queryParams.length}`);
      if (queue === 'unassigned') {
        whereClauses.push(`c.assigned_to_id IS NULL`);
      }
    } else if (user.role === 'AGENT') {
      if (!user.department_id) {
        return res.status(200).json({
          success: true,
          pagination: { total: 0, limit: finalLimit, offset: finalOffset },
          count: 0,
          data: []
        });
      }
      if (queue === 'unassigned') {
        queryParams.push(user.department_id);
        whereClauses.push(`c.department_id = $${queryParams.length}`);
        whereClauses.push(`c.assigned_to_id IS NULL`);
      } else {
        queryParams.push(user.id);
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

    // Fetch complaint
    const query = `
      SELECT c.*,
             u_creator.first_name AS creator_first_name, u_creator.last_name AS creator_last_name, u_creator.email AS creator_email,
             cc.name AS category, cs.name AS status, cp.name AS priority,
             dept.name AS department,
             u_assignee.first_name AS assignee_first_name, u_assignee.last_name AS assignee_last_name
      FROM complaints c
      JOIN users u_creator ON c.created_by_id = u_creator.id
      JOIN complaint_categories cc ON c.category_id = cc.id
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

    return res.status(200).json({
      success: true,
      data: {
        complaint,
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
  const { title, description, category_id, priority_id, created_by_id, department_id } = req.body;
  const user = req.user;

  // Validation
  if (!title || !description || !category_id || !priority_id) {
    return res.status(400).json({ success: false, message: 'Title, description, category_id, and priority_id are required' });
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

    // Verify category and priority exist
    const catCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE id = $1', [category_id]);
    if (catCheck.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid category_id' });
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
        INSERT INTO complaints (ticket_number, title, description, created_by_id, category_id, status_id, priority_id, due_date, department_id, assigned_to_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      const insertRes = await client.query(insertQuery, [
        ticketNumber,
        title.trim(),
        description.trim(),
        targetCreatorId,
        category_id,
        targetStatusId,
        priority_id,
        dueDate,
        targetDeptId,
        assignedAgentId
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
    notifications.notifyComplaintCreated(resultComplaint).catch(err => console.error('Failed to trigger in-app notification:', err));

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
    const isCreator = complaint.created_by_id === user.id;

    if (!isAdmin && !isCreator) {
      logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { complaintId: id, action: 'update' }, user, req.ip);
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot modify this complaint' });
    }

    // Creators can only update if status is Pending
    if (!isAdmin && complaint.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Complaints can only be modified when their status is Pending' });
    }

    // Prepare update parameters
    const updateFields = [];
    const values = [];

    if (title) {
      values.push(title.trim());
      updateFields.push(`title = $${values.length}`);
    }

    if (description) {
      values.push(description.trim());
      updateFields.push(`description = $${values.length}`);
    }

    if (category_id) {
      const catCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE id = $1', [category_id]);
      if (catCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid category_id' });
      }
      values.push(category_id);
      updateFields.push(`category_id = $${values.length}`);
    }

    if (priority_id) {
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

      // If department is specified, check that assignee is in it. If not, auto-assign the agent's department!
      const targetDeptId = department_id || complaint.department_id || targetAgent.department_id;
      if (targetAgent.department_id && targetDeptId && targetAgent.department_id !== targetDeptId) {
        return res.status(400).json({ success: false, message: 'Agent does not belong to the target department' });
      }
    }

    // Determine target department and assignee
    let finalDeptId = department_id !== undefined ? department_id : complaint.department_id;
    let finalAssigneeId = assigned_to_id !== undefined ? assigned_to_id : complaint.assigned_to_id;

    // Check if assignment triggers automatic status change from "Pending" to "Assigned"
    const pendingStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Pending'");
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");

    const pendingId = pendingStatusResult.rows[0]?.id;
    const assignedId = assignedStatusResult.rows[0]?.id;

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
      if (complaint.status_id === pendingId && assignedId && (finalDeptId || finalAssigneeId)) {
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

        notifications.notifyComplaintAssigned(resultComplaint, finalAssigneeId).catch(err => console.error('Failed to trigger in-app assignment notification:', err));
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
 * Claim an unassigned complaint in the agent's department (Self-assignment).
 * PATCH /api/complaints/:id/claim
 */
const claimComplaint = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Enforce role authorization: AGENT or DEPT_HEAD
  if (user.role !== 'AGENT' && user.role !== 'DEPT_HEAD') {
    return res.status(403).json({ success: false, message: 'Forbidden: Only Agents and Department Heads can claim complaints' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch complaint joining priorities
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

    // Verify user belongs to a department
    if (!user.department_id) {
      return res.status(400).json({ success: false, message: 'Your account is not assigned to any department. Cannot claim tickets.' });
    }

    // Verify complaint belongs to user's department
    if (complaint.department_id !== user.department_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only claim tickets assigned to your department' });
    }

    // Verify complaint is currently unassigned
    if (complaint.assigned_to_id !== null) {
      return res.status(400).json({ success: false, message: 'This ticket has already been assigned to another agent' });
    }

    // Fetch Assigned status id
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
    const assignedStatusId = assignedStatusResult.rows[0]?.id;

    // Transition from Pending to Assigned if status is Pending
    const pendingStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Pending'");
    const pendingStatusId = pendingStatusResult.rows[0]?.id;

    let targetStatusId = complaint.status_id;
    if (complaint.status_id === pendingStatusId && assignedStatusId) {
      targetStatusId = assignedStatusId;
    }

    // Update complaint
    const updateResult = await dbPool.query(`
      UPDATE complaints
      SET assigned_to_id = $1, status_id = $2
      WHERE id = $3
      RETURNING *
    `, [user.id, targetStatusId, id]);

    // Log history
    const auditRemark = 'Ticket claimed by agent';
    await dbPool.query(`
      INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user.id, complaint.status_id, targetStatusId, auditRemark]);

    logger.audit('COMPLAINT_CLAIMED', { complaintId: id, ticketNumber: updateResult.rows[0].ticket_number }, user, req.ip);

    const notifications = require('../utils/notifications');
    notifications.notifyComplaintAssigned(updateResult.rows[0], user.id).catch(err => console.error('Failed to trigger claim assignment notification:', err));

    return res.status(200).json({
      success: true,
      message: 'Ticket claimed successfully',
      data: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Claim complaint error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to claim complaint' });
  }
};

/**
 * Update complaint status (manually transition status).
 * PATCH /api/complaints/:id/status
 */
const updateComplaintStatus = async (req, res) => {
  const { id } = req.params;
  const { status_id, remarks } = req.body;
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
    const isAssignee = user.role === 'AGENT' && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;

    if (!isAdmin && !isDeptHead && !isAssignee && !isCreator) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to update status' });
    }

    const current = complaint.current_status_name;
    const target = targetStatus.name;

    const isCurrentPaused = ['On Hold', 'Waiting on Customer'].includes(current);
    const isTargetPaused = ['On Hold', 'Waiting on Customer'].includes(target);

    // Terminal state protection: Closed complaints cannot be transitioned
    if (current === 'Closed') {
      return res.status(400).json({ success: false, message: 'Closed tickets cannot be modified' });
    }

    // Role-specific transition matrix
    if (user.role === 'CUSTOMER') {
      if (target === 'On Hold' || target === 'Waiting on Customer') {
        return res.status(403).json({ success: false, message: 'Forbidden: Customers cannot pause ticket SLA' });
      }
      if (isCurrentPaused) {
        return res.status(403).json({ success: false, message: 'Forbidden: Customers cannot transition tickets from paused states' });
      }
      if (target !== 'Closed') {
        return res.status(403).json({ success: false, message: 'Customers are only permitted to transition tickets to Closed' });
      }
      if (current !== 'Resolved') {
        return res.status(400).json({ success: false, message: 'Tickets can only be closed by customers once they are marked as Resolved' });
      }
    } else if (user.role === 'AGENT') {
      if (complaint.assigned_to_id !== user.id) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only update the status of tickets assigned to you' });
      }

      if (isTargetPaused) {
        // Pausing
        if (!['In Progress', 'Assigned'].includes(current)) {
          return res.status(400).json({ success: false, message: 'Tickets can only be placed on hold from In Progress or Assigned status' });
        }
      } else if (isCurrentPaused) {
        // Resuming
        if (target !== 'In Progress') {
          return res.status(400).json({ success: false, message: 'Agents can only resume tickets to In Progress status' });
        }
      } else {
        // Normal active transitions (e.g. Assigned -> In Progress)
        if (target !== 'In Progress') {
          return res.status(400).json({ success: false, message: 'Agents can only transition tickets to In Progress. Resolved status must be achieved via FCR submission.' });
        }
        if (current !== 'Assigned') {
          return res.status(400).json({ success: false, message: 'Tickets can only be moved to In Progress from Assigned status' });
        }
      }
    } else {
      // ADMIN or DEPT_HEAD manual transitions
      if (isTargetPaused) {
        if (!['In Progress', 'Assigned'].includes(current)) {
          return res.status(400).json({ success: false, message: 'Tickets can only be placed on hold from In Progress or Assigned status' });
        }
      } else if (isCurrentPaused) {
        if (target !== 'In Progress' && target !== 'Assigned') {
          return res.status(400).json({ success: false, message: 'Paused tickets can only be resumed to In Progress or Assigned status' });
        }
      } else {
        // Normal active transitions
        if (target === 'Resolved') {
          return res.status(400).json({ success: false, message: 'Manual transition to Resolved is blocked. Tickets must be resolved via FCR submission.' });
        }
        if (target === 'In Progress' && current !== 'Assigned') {
          return res.status(400).json({ success: false, message: 'Tickets can only be moved to In Progress from Assigned status' });
        }
        if (target === 'Closed' && current !== 'Resolved') {
          return res.status(400).json({ success: false, message: 'Tickets can only be closed from Resolved status' });
        }
        if (target === 'Pending') {
          return res.status(400).json({ success: false, message: 'Cannot transition ticket back to Pending status' });
        }
        if (target === 'Assigned') {
          return res.status(400).json({ success: false, message: 'Assigned status is automatically handled via assignment routing' });
        }
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
              paused_at = COALESCE(paused_at, CURRENT_TIMESTAMP),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        queryParams = [status_id, id];
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

      // Log in status history audit
      const defaultRemarks = `Status changed from '${complaint.current_status_name}' to '${targetStatus.name}'`;
      await client.query(`
        INSERT INTO complaint_status_history (complaint_id, changed_by_id, old_status_id, new_status_id, remarks)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, user.id, complaint.status_id, status_id, remarks ? remarks.trim() : defaultRemarks]);

      await client.query('COMMIT');
      client.release();

      const notifications = require('../utils/notifications');
      notifications.notifyStatusChanged(complaint, complaint.current_status_name, targetStatus.name)
        .catch(err => console.error('Failed to trigger status change notification:', err));

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
      JOIN complaint_categories cc ON c.category_id = cc.id
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

module.exports = {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  claimComplaint,
  updateComplaintStatus,
  addComment,
  exportComplaints,
};
