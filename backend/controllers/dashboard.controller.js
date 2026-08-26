const dbPool = require('../config/db');

/**
 * Get dashboard statistics summary.
 * GET /api/dashboard/stats
 */
const getDashboardStats = async (req, res) => {
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let roleFilter = '1=1';
    const params = [];

    // Filter statistics matching role boundary controls
    if (user.role === 'DEPT_HEAD') {
      if (!user.department_id) {
        return res.status(200).json({
          success: true,
          data: {
            summary: { total: 0 },
            by_priority: {},
            by_category: {},
            average_resolution_hours: 0
          }
        });
      }
      params.push(user.department_id);
      roleFilter = `c.department_id = $1`;
    } else if (user.role === 'AGENT') {
      params.push(user.id);
      roleFilter = `c.assigned_to_id = $1`;
    } else if (user.role === 'CUSTOMER') {
      params.push(user.id);
      roleFilter = `c.created_by_id = $1`;
    }

    // 1. Ticket status breakdown
    const statusQuery = `
      SELECT cs.name, COUNT(c.id)::int AS count
      FROM complaint_statuses cs
      LEFT JOIN complaints c ON cs.id = c.status_id AND ${roleFilter}
      GROUP BY cs.id, cs.name
      ORDER BY cs.id ASC
    `;
    const statusRes = await dbPool.query(statusQuery, params);

    // 2. Ticket priority breakdown
    const priorityQuery = `
      SELECT cp.name, COUNT(c.id)::int AS count
      FROM complaint_priorities cp
      LEFT JOIN complaints c ON cp.id = c.priority_id AND ${roleFilter}
      GROUP BY cp.id, cp.name
      ORDER BY cp.id ASC
    `;
    const priorityRes = await dbPool.query(priorityQuery, params);

    // 3. Ticket category breakdown
    const categoryQuery = `
      SELECT cc.name, COUNT(c.id)::int AS count
      FROM complaint_categories cc
      LEFT JOIN complaints c ON cc.id = c.category_id AND ${roleFilter}
      GROUP BY cc.id, cc.name
      ORDER BY cc.id ASC
    `;
    const categoryRes = await dbPool.query(categoryQuery, params);

    // 4. Average Resolution time calculations
    const avgResQuery = `
      WITH first_resolutions AS (
        SELECT h.complaint_id, MIN(h.changed_at) AS resolved_at
        FROM complaint_status_history h
        JOIN complaint_statuses cs ON h.new_status_id = cs.id
        WHERE cs.name = 'Resolved'
        GROUP BY h.complaint_id
      )
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (fr.resolved_at - c.created_at)) / 3600), 0)::float AS avg_resolution_hours
      FROM complaints c
      JOIN first_resolutions fr ON c.id = fr.complaint_id
      WHERE ${roleFilter}
    `;
    const avgRes = await dbPool.query(avgResQuery, params);

    // Formatting statistics details
    const summary = {};
    let total = 0;
    statusRes.rows.forEach(r => {
      const key = r.name.toLowerCase().replace(/ /g, '_');
      summary[key] = r.count;
      total += r.count;
    });
    summary['total'] = total;

    const by_priority = {};
    priorityRes.rows.forEach(r => {
      const key = r.name.toLowerCase();
      by_priority[key] = r.count;
    });

    const by_category = {};
    categoryRes.rows.forEach(r => {
      const key = r.name.toLowerCase().replace(/ /g, '_');
      by_category[key] = r.count;
    });

    const statsData = {
      summary,
      by_priority,
      by_category,
      average_resolution_hours: avgRes.rows[0]?.avg_resolution_hours || 0
    };

    // 5. Department distribution breakdown (Admin only)
    if (user.role === 'ADMIN') {
      const deptQuery = `
        SELECT d.name, COUNT(c.id)::int AS count
        FROM departments d
        LEFT JOIN complaints c ON d.id = c.department_id
        GROUP BY d.id, d.name
        ORDER BY d.id ASC
      `;
      const deptRes = await dbPool.query(deptQuery);
      const by_department = {};
      deptRes.rows.forEach(r => {
        const key = r.name.toLowerCase().replace(/ /g, '_');
        by_department[key] = r.count;
      });
      statsData['by_department'] = by_department;
    }

    // 6. Unassigned department tickets count (Agent and Dept Head only)
    if ((user.role === 'AGENT' || user.role === 'DEPT_HEAD') && user.department_id) {
      const unassignedRes = await dbPool.query(
        'SELECT COUNT(*)::int AS count FROM complaints WHERE department_id = $1 AND assigned_to_id IS NULL',
        [user.department_id]
      );
      statsData['unassigned_department_tickets'] = unassignedRes.rows[0]?.count || 0;
    }

    return res.status(200).json({
      success: true,
      data: statsData
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard statistics'
    });
  }
};

/**
 * Get unified recent activity feed for dashboard (last 10 items).
 * GET /api/dashboard/activity
 */
const getRecentActivity = async (req, res) => {
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    let roleFilter = '1=1';
    const params = [];

    // Filter activity feed matching user permissions boundary
    if (user.role === 'DEPT_HEAD') {
      if (!user.department_id) {
        return res.status(200).json({ success: true, data: [] });
      }
      params.push(user.department_id);
      roleFilter = `c.department_id = $1`;
    } else if (user.role === 'AGENT') {
      params.push(user.id);
      roleFilter = `c.assigned_to_id = $1`;
    } else if (user.role === 'CUSTOMER') {
      params.push(user.id);
      roleFilter = `c.created_by_id = $1`;
    }

    // Hide internal comments from customers
    let commentsFilter = '';
    if (user.role === 'CUSTOMER') {
      commentsFilter = 'AND co.is_internal = false';
    }

    const query = `
      (
        SELECT 'status_change' AS activity_type, h.id, h.complaint_id, c.ticket_number, c.title AS complaint_title,
               h.remarks AS description, h.changed_at AS timestamp,
               u.first_name, u.last_name, r.name AS role,
               cs_old.name AS old_value, cs_new.name AS new_value,
               false AS is_internal
        FROM complaint_status_history h
        JOIN complaints c ON h.complaint_id = c.id
        LEFT JOIN users u ON h.changed_by_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        LEFT JOIN complaint_statuses cs_old ON h.old_status_id = cs_old.id
        LEFT JOIN complaint_statuses cs_new ON h.new_status_id = cs_new.id
        WHERE ${roleFilter}
      )
      UNION ALL
      (
        SELECT 'comment' AS activity_type, co.id, co.complaint_id, c.ticket_number, c.title AS complaint_title,
               co.comment_text AS description, co.created_at AS timestamp,
               u.first_name, u.last_name, r.name AS role,
               null AS old_value, null AS new_value,
               co.is_internal
        FROM complaint_comments co
        JOIN complaints c ON co.complaint_id = c.id
        LEFT JOIN users u ON co.user_id = u.id
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE ${roleFilter} ${commentsFilter}
      )
      ORDER BY timestamp DESC
      LIMIT 10
    `;

    const result = await dbPool.query(query, params);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get recent activity error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent dashboard activity'
    });
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivity,
};
