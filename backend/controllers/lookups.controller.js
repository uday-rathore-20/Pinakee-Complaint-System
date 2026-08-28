const dbPool = require('../config/db');

/**
 * Get all complaint categories.
 * GET /api/categories
 */
const getCategories = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description FROM complaint_categories WHERE is_active = true ORDER BY name ASC');
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get categories error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve categories' });
  }
};

/**
 * Get all departments.
 * GET /api/departments
 */
const getDepartments = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description FROM departments WHERE is_active = true ORDER BY name ASC');
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get departments error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve departments' });
  }
};

/**
 * Get all complaint statuses.
 * GET /api/statuses
 */
const getStatuses = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description FROM complaint_statuses ORDER BY id ASC');
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get statuses error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve statuses' });
  }
};

/**
 * Get all complaint priorities.
 * GET /api/priorities
 */
const getPriorities = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }
    const result = await dbPool.query('SELECT id, name, description, sla_hours FROM complaint_priorities ORDER BY id ASC');
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get priorities error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve priorities' });
  }
};

module.exports = {
  getCategories,
  getDepartments,
  getStatuses,
  getPriorities,
};
