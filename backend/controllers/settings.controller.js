const dbPool = require('../config/db');
const logger = require('../utils/logger');

// Helpers for numeric validation
const isValidId = (id) => {
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0;
};

/**
 * GET /api/settings/departments
 */
const getDepartments = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description, is_active FROM departments ORDER BY id ASC');
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Settings getDepartments error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings departments' });
  }
};

/**
 * POST /api/settings/departments
 */
const createDepartment = async (req, res) => {
  const { name, description } = req.body;
  const user = req.user;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Department name is required' });
  }

  const trimmedName = name.trim();

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check duplicate name (case-insensitive)
    const dupCheck = await dbPool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [trimmedName]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A department with this name already exists' });
    }

    const insertQuery = `
      INSERT INTO departments (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, is_active
    `;
    const result = await dbPool.query(insertQuery, [trimmedName, description ? description.trim() : null]);

    logger.audit('SETTINGS_UPDATED', { action: 'CREATE_DEPARTMENT', departmentId: result.rows[0].id, name: trimmedName }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Settings createDepartment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create department' });
  }
};

/**
 * PUT /api/settings/departments/:id
 */
const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  const user = req.user;

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid department ID parameter' });
  }

  const deptId = parseInt(id, 10);

  if (name !== undefined && (!name || name.trim() === '')) {
    return res.status(400).json({ success: false, message: 'Department name cannot be empty' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check department exists
    const deptCheck = await dbPool.query('SELECT * FROM departments WHERE id = $1', [deptId]);
    if (deptCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    const currentDept = deptCheck.rows[0];
    const trimmedName = name !== undefined ? name.trim() : currentDept.name;
    const finalDescription = description !== undefined ? (description ? description.trim() : null) : currentDept.description;
    const finalActive = is_active !== undefined ? !!is_active : currentDept.is_active;

    // Check duplicate name if name was changed
    if (trimmedName.toLowerCase() !== currentDept.name.toLowerCase()) {
      const dupCheck = await dbPool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1) AND id <> $2', [trimmedName, deptId]);
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'A department with this name already exists' });
      }
    }

    const updateQuery = `
      UPDATE departments
      SET name = $1, description = $2, is_active = $3
      WHERE id = $4
      RETURNING id, name, description, is_active
    `;
    const result = await dbPool.query(updateQuery, [trimmedName, finalDescription, finalActive, deptId]);

    logger.audit('SETTINGS_UPDATED', { action: 'UPDATE_DEPARTMENT', departmentId: deptId, name: trimmedName, is_active: finalActive }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Settings updateDepartment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update department' });
  }
};

/**
 * GET /api/settings/categories
 */
const getCategories = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description, is_active FROM complaint_categories ORDER BY id ASC');
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Settings getCategories error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings categories' });
  }
};

/**
 * POST /api/settings/categories
 */
const createCategory = async (req, res) => {
  const { name, description } = req.body;
  const user = req.user;

  if (!name || name.trim() === '') {
    return res.status(400).json({ success: false, message: 'Category name is required' });
  }

  const trimmedName = name.trim();

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check duplicate name
    const dupCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE LOWER(name) = LOWER($1)', [trimmedName]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'A category with this name already exists' });
    }

    const insertQuery = `
      INSERT INTO complaint_categories (name, description)
      VALUES ($1, $2)
      RETURNING id, name, description, is_active
    `;
    const result = await dbPool.query(insertQuery, [trimmedName, description ? description.trim() : null]);

    logger.audit('SETTINGS_UPDATED', { action: 'CREATE_CATEGORY', categoryId: result.rows[0].id, name: trimmedName }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Settings createCategory error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

/**
 * PUT /api/settings/categories/:id
 */
const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description, is_active } = req.body;
  const user = req.user;

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid category ID parameter' });
  }

  const categoryId = parseInt(id, 10);

  if (name !== undefined && (!name || name.trim() === '')) {
    return res.status(400).json({ success: false, message: 'Category name cannot be empty' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check category exists
    const catCheck = await dbPool.query('SELECT * FROM complaint_categories WHERE id = $1', [categoryId]);
    if (catCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const currentCat = catCheck.rows[0];
    const trimmedName = name !== undefined ? name.trim() : currentCat.name;
    const finalDescription = description !== undefined ? (description ? description.trim() : null) : currentCat.description;
    const finalActive = is_active !== undefined ? !!is_active : currentCat.is_active;

    // Check duplicate name
    if (trimmedName.toLowerCase() !== currentCat.name.toLowerCase()) {
      const dupCheck = await dbPool.query('SELECT id FROM complaint_categories WHERE LOWER(name) = LOWER($1) AND id <> $2', [trimmedName, categoryId]);
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'A category with this name already exists' });
      }
    }

    const updateQuery = `
      UPDATE complaint_categories
      SET name = $1, description = $2, is_active = $3
      WHERE id = $4
      RETURNING id, name, description, is_active
    `;
    const result = await dbPool.query(updateQuery, [trimmedName, finalDescription, finalActive, categoryId]);

    logger.audit('SETTINGS_UPDATED', { action: 'UPDATE_CATEGORY', categoryId: categoryId, name: trimmedName, is_active: finalActive }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Settings updateCategory error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

/**
 * GET /api/settings/priorities
 */
const getPriorities = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description, sla_hours FROM complaint_priorities ORDER BY id ASC');
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Settings getPriorities error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve settings priorities' });
  }
};

/**
 * PUT /api/settings/priorities/:id
 */
const updatePrioritySla = async (req, res) => {
  const { id } = req.params;
  const { sla_hours } = req.body;
  const user = req.user;

  if (!isValidId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid priority ID parameter' });
  }

  const priorityId = parseInt(id, 10);

  if (sla_hours === undefined || sla_hours === null) {
    return res.status(400).json({ success: false, message: 'sla_hours is required' });
  }

  const numericSla = parseInt(sla_hours, 10);
  if (isNaN(numericSla) || numericSla <= 0) {
    return res.status(400).json({ success: false, message: 'SLA hours must be a positive integer greater than zero' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check priority exists
    const priCheck = await dbPool.query('SELECT * FROM complaint_priorities WHERE id = $1', [priorityId]);
    if (priCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Priority tier not found' });
    }

    const currentPriority = priCheck.rows[0];

    const updateQuery = `
      UPDATE complaint_priorities
      SET sla_hours = $1
      WHERE id = $2
      RETURNING id, name, description, sla_hours
    `;
    const result = await dbPool.query(updateQuery, [numericSla, priorityId]);

    logger.audit('SETTINGS_UPDATED', { action: 'UPDATE_PRIORITY_SLA', priorityId: priorityId, name: currentPriority.name, oldSla: currentPriority.sla_hours, newSla: numericSla }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: `SLA duration for ${currentPriority.name} updated to ${numericSla} hours`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Settings updatePrioritySla error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update priority SLA duration' });
  }
};

/**
 * GET /api/settings/routing
 */
const getRoutingMode = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query("SELECT value FROM system_settings WHERE key = 'ticket_routing_mode'");
    const mode = result.rows[0]?.value || 'MANUAL';
    return res.status(200).json({ success: true, mode });
  } catch (error) {
    console.error('Settings getRoutingMode error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve routing setting' });
  }
};

/**
 * PUT /api/settings/routing
 */
const updateRoutingMode = async (req, res) => {
  const { mode } = req.body;
  const user = req.user;

  if (!mode || !['MANUAL', 'ROUND_ROBIN', 'LEAST_BUSY'].includes(mode)) {
    return res.status(400).json({ success: false, message: 'Invalid routing mode. Must be MANUAL, ROUND_ROBIN, or LEAST_BUSY' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const updateQuery = `
      INSERT INTO system_settings (key, value, description)
      VALUES ('ticket_routing_mode', $1, 'Active ticket routing strategy')
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
      RETURNING value
    `;
    const result = await dbPool.query(updateQuery, [mode]);

    logger.audit('SETTINGS_UPDATED', { action: 'UPDATE_ROUTING_MODE', mode }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Routing mode updated successfully',
      mode: result.rows[0].value
    });
  } catch (error) {
    console.error('Settings updateRoutingMode error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update routing mode' });
  }
};

/**
 * GET /api/settings/archives
 */
const listArchives = async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const archiveDir = path.join(__dirname, '..', 'archives');

    if (!fs.existsSync(archiveDir)) {
      return res.status(200).json({ success: true, data: [] });
    }

    const files = fs.readdirSync(archiveDir);
    const data = [];

    files.forEach(filename => {
      // Only include valid archive files matching the exact regex format
      const archivePattern = /^archive-(audit|notifications)-\d{8}-\d{6}\.json\.gz$/;
      if (archivePattern.test(filename)) {
        const filePath = path.join(archiveDir, filename);
        const stats = fs.statSync(filePath);
        data.push({
          filename,
          size: stats.size,
          created_at: stats.mtime
        });
      }
    });

    // Sort by newest first
    data.sort((a, b) => b.created_at - a.created_at);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Settings listArchives error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve archive list' });
  }
};

/**
 * GET /api/settings/archives/:filename
 */
const downloadArchive = async (req, res) => {
  const { filename } = req.params;
  const user = req.user;

  // Strict regex pattern check matching expected naming format
  const archivePattern = /^archive-(audit|notifications)-\d{8}-\d{6}\.json\.gz$/;
  if (!filename || !archivePattern.test(filename)) {
    return res.status(400).json({ success: false, message: 'Invalid or malformed filename format' });
  }

  // Traversal checks
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ success: false, message: 'Path traversal attempts detected and blocked' });
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const archiveDir = path.join(__dirname, '..', 'archives');
    const filePath = path.join(archiveDir, filename);
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(archiveDir);

    if (!resolvedPath.startsWith(resolvedDir)) {
      logger.audit('UNAUTHORIZED_ACCESS_BLOCKED', { action: 'download_archive_traversal', filename }, user, req.ip);
      return res.status(403).json({ success: false, message: 'Access forbidden: Path outside of archives directory' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Archive file not found' });
    }

    logger.audit('SETTINGS_UPDATED', { action: 'DOWNLOAD_ARCHIVE_LOG', filename }, user, req.ip);

    return res.download(filePath, filename);
  } catch (error) {
    console.error('Settings downloadArchive error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to stream archive download' });
  }
};

/**
 * POST /api/settings/archives/run
 */
const runArchiveManually = async (req, res) => {
  const user = req.user;
  try {
    const { runArchiver } = require('../utils/archiveDaemon');
    const result = await runArchiver(user, req.ip);

    if (!result.success) {
      return res.status(409).json(result);
    }

    return res.status(200).json({
      success: true,
      message: 'Database archiving completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Settings runArchiveManually error:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Archiving execution failed' });
  }
};

const getOutbox = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const offset = (page - 1) * limit;

    const status = req.query.status || '';
    const recipient = req.query.recipient || '';
    const search = req.query.search || '';

    const whereClauses = [];
    const queryParams = [];

    if (status) {
      queryParams.push(status);
      whereClauses.push(`status = $${queryParams.length}`);
    }
    if (recipient) {
      queryParams.push(`%${recipient}%`);
      whereClauses.push(`recipient ILIKE $${queryParams.length}`);
    }
    if (search) {
      queryParams.push(`%${search}%`);
      whereClauses.push(`(subject ILIKE $${queryParams.length} OR body ILIKE $${queryParams.length} OR recipient ILIKE $${queryParams.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*)::int AS count FROM email_outbox ${whereSql}`;
    const countRes = await dbPool.query(countQuery, queryParams);
    const total = countRes.rows[0]?.count || 0;

    const dataQuery = `
      SELECT id, recipient, subject, body, status, attempts, last_attempt_at, error_message, created_at
      FROM email_outbox
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    const dataParams = [...queryParams, limit, offset];
    const dataRes = await dbPool.query(dataQuery, dataParams);

    return res.status(200).json({
      success: true,
      data: dataRes.rows,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Settings getOutbox error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve email outbox logs' });
  }
};

const retryOutboxMail = async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id, 10);
  if (isNaN(targetId)) {
    return res.status(400).json({ success: false, message: 'Invalid email record ID' });
  }

  try {
    const checkRes = await dbPool.query('SELECT * FROM email_outbox WHERE id = $1', [targetId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Email record not found' });
    }

    await dbPool.query(`
      UPDATE email_outbox
      SET status = 'Pending',
          attempts = 0,
          error_message = NULL,
          last_attempt_at = NULL
      WHERE id = $1
    `, [targetId]);

    const emailWorker = require('../utils/emailWorker');
    emailWorker.processQueue().catch(err => console.error('Failed to run queue from retry API:', err));

    return res.status(200).json({
      success: true,
      message: 'Email reset to Pending. Dispatch has been triggered.'
    });
  } catch (error) {
    console.error('Settings retryOutboxMail error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retry email dispatch' });
  }
};

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  getCategories,
  createCategory,
  updateCategory,
  getPriorities,
  updatePrioritySla,
  getRoutingMode,
  updateRoutingMode,
  listArchives,
  downloadArchive,
  runArchiveManually,
  getOutbox,
  retryOutboxMail
};
