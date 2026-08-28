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

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  getCategories,
  createCategory,
  updateCategory,
  getPriorities,
  updatePrioritySla
};
