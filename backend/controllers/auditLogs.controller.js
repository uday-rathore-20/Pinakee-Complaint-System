const dbPool = require('../config/db');

/**
 * Retrieve system security and administrative audit logs.
 * GET /api/audit-logs
 * Access: ADMIN only (secured via router middleware)
 */
const getAuditLogs = async (req, res) => {
  const { user_id, action_type, start_date, end_date, limit = 20, offset = 0 } = req.query;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const whereClauses = [];
    const values = [];

    // Filter by user ID
    if (user_id) {
      values.push(parseInt(user_id, 10));
      whereClauses.push(`l.user_id = $${values.length}`);
    }

    // Filter by action type
    if (action_type) {
      values.push(action_type.trim());
      whereClauses.push(`l.action_type = $${values.length}`);
    }

    // Date filters (inclusive)
    if (start_date) {
      values.push(new Date(start_date));
      whereClauses.push(`l.created_at >= $${values.length}`);
    }

    if (end_date) {
      values.push(new Date(end_date));
      whereClauses.push(`l.created_at <= $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Count query for pagination totals
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM audit_logs l
      ${whereSql}
    `;
    const countResult = await dbPool.query(countQuery, values);
    const totalCount = countResult.rows[0]?.total || 0;

    // Fetch details query joining performer email and role
    const limitVal = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offsetVal = Math.max(parseInt(offset, 10) || 0, 0);

    const dataValues = [...values, limitVal, offsetVal];
    const dataQuery = `
      SELECT l.id, l.action_type, l.description, l.ip_address, l.metadata_json, l.created_at,
             u.email AS user_email, r.name AS user_role
      FROM audit_logs l
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      ${whereSql}
      ORDER BY l.created_at DESC
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}
    `;

    const dataResult = await dbPool.query(dataQuery, dataValues);

    return res.status(200).json({
      success: true,
      data: {
        logs: dataResult.rows,
        pagination: {
          total: totalCount,
          limit: limitVal,
          offset: offsetVal
        }
      }
    });

  } catch (error) {
    console.error('Fetch audit logs error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve system audit logs' });
  }
};

module.exports = {
  getAuditLogs
};
