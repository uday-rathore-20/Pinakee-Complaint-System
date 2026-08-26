const dbPool = require('../config/db');

/**
 * Get current user's notifications.
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  const user = req.user;
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT * FROM in_app_notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await dbPool.query(query, [user.id, limit, offset]);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get notifications error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve notifications' });
  }
};

/**
 * Get current user's unread notification count.
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT COUNT(*)::int AS count 
      FROM in_app_notifications
      WHERE user_id = $1 AND is_read = false
    `;
    const result = await dbPool.query(query, [user.id]);

    return res.status(200).json({
      success: true,
      data: { count: result.rows[0].count }
    });
  } catch (error) {
    console.error('Get unread count error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve unread notification count' });
  }
};

/**
 * Mark a specific notification as read.
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Verify ownership first (SECURITY RULE)
    const checkQuery = 'SELECT user_id FROM in_app_notifications WHERE id = $1';
    const checkResult = await dbPool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    if (checkResult.rows[0].user_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have access to this notification' });
    }

    const updateQuery = `
      UPDATE in_app_notifications
      SET is_read = true
      WHERE id = $1
      RETURNING *
    `;
    const result = await dbPool.query(updateQuery, [id]);

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification read error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update notification status' });
  }
};

/**
 * Mark all notifications for the current user as read.
 * POST /api/notifications/mark-all-read
 */
const markAllAsRead = async (req, res) => {
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      UPDATE in_app_notifications
      SET is_read = true
      WHERE user_id = $1 AND is_read = false
    `;
    await dbPool.query(query, [user.id]);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all read error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
