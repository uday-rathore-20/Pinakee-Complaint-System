const dbPool = require('../config/db');

/**
 * Helper to build the department filter where clause for DEPT_HEAD roles.
 */
const getScopeFilter = (user) => {
  if (user.role === 'DEPT_HEAD') {
    return {
      clause: 'AND c.department_id = $1',
      params: [user.department_id]
    };
  }
  return {
    clause: '',
    params: []
  };
};

/**
 * Aggregate counts of tickets grouped by status.
 * GET /api/reports/tickets-by-status
 */
const getTicketsByStatus = async (req, res) => {
  const user = req.user;
  const scope = getScopeFilter(user);

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT cs.name AS status, COUNT(c.id)::int AS count
      FROM complaint_statuses cs
      LEFT JOIN complaints c ON c.status_id = cs.id ${scope.clause}
      GROUP BY cs.name
    `;

    const result = await dbPool.query(query, scope.params);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Reports tickets-by-status error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket status metrics' });
  }
};

/**
 * Aggregate counts of tickets grouped by priority.
 * GET /api/reports/tickets-by-priority
 */
const getTicketsByPriority = async (req, res) => {
  const user = req.user;
  const scope = getScopeFilter(user);

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT cp.name AS priority, COUNT(c.id)::int AS count
      FROM complaint_priorities cp
      LEFT JOIN complaints c ON c.priority_id = cp.id ${scope.clause}
      GROUP BY cp.name
    `;

    const result = await dbPool.query(query, scope.params);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Reports tickets-by-priority error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket priority metrics' });
  }
};

/**
 * Aggregate counts of tickets grouped by department.
 * GET /api/reports/tickets-by-department
 */
const getTicketsByDepartment = async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    const query = `
      SELECT d.name AS department, COUNT(c.id)::int AS count
      FROM departments d
      LEFT JOIN complaints c ON c.department_id = d.id
      GROUP BY d.name
    `;

    const result = await dbPool.query(query);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Reports tickets-by-department error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket department metrics' });
  }
};

/**
 * Aggregate ticket registrations trends over the last 30 days.
 * GET /api/reports/ticket-trends
 */
const getTicketTrends = async (req, res) => {
  const user = req.user;
  const scope = getScopeFilter(user);

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Generate series of last 30 days to prevent gap dates in trends
    const query = `
      SELECT gs.date::date AS date, COALESCE(COUNT(c.id), 0)::int AS count
      FROM (
        SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day')::date AS date
      ) gs
      LEFT JOIN complaints c ON DATE(c.created_at) = gs.date ${scope.clause}
      GROUP BY gs.date
      ORDER BY gs.date ASC
    `;

    const result = await dbPool.query(query, scope.params);
    return res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Reports ticket-trends error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve ticket trends metrics' });
  }
};

/**
 * Retrieve general SLA compliance metrics and calculations.
 * GET /api/reports/sla-compliance
 */
const getSlaCompliance = async (req, res) => {
  const user = req.user;

  // Custom scope handling because we perform multiple queries/sub-aggregates
  let queryScopeClause = '';
  let queryScopeParams = [];
  if (user.role === 'DEPT_HEAD') {
    queryScopeClause = 'WHERE department_id = $1';
    queryScopeParams = [user.department_id];
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // A. Fetch total active complaints, total breached, and breach percentages
    const statsQuery = `
      SELECT
        COUNT(*)::int AS total_complaints,
        COUNT(CASE WHEN is_sla_breached = TRUE THEN 1 END)::int AS breached_count
      FROM complaints
      ${queryScopeClause}
    `;
    const statsResult = await dbPool.query(statsQuery, queryScopeParams);
    const { total_complaints, breached_count } = statsResult.rows[0];

    const compliance_rate = total_complaints > 0
      ? parseFloat(((1 - (breached_count / total_complaints)) * 100).toFixed(1))
      : 100.0;

    // B. Calculate Average Assignment Time (in hours)
    // Measures time between complaint creation and first transition to 'Assigned' status
    const assignQuery = `
      SELECT AVG(EXTRACT(EPOCH FROM (h.changed_at - c.created_at))) / 3600 AS avg_assignment_hours
      FROM complaints c
      JOIN (
        SELECT complaint_id, MIN(changed_at) AS changed_at
        FROM complaint_status_history h
        JOIN complaint_statuses cs ON h.new_status_id = cs.id
        WHERE cs.name = 'Assigned'
        GROUP BY complaint_id
      ) h ON c.id = h.complaint_id
      ${user.role === 'DEPT_HEAD' ? 'WHERE c.department_id = $1' : ''}
    `;
    const assignResult = await dbPool.query(assignQuery, queryScopeParams);
    const avg_assignment_hours = assignResult.rows[0]?.avg_assignment_hours
      ? parseFloat(parseFloat(assignResult.rows[0].avg_assignment_hours).toFixed(1))
      : 0.0;

    // C. Calculate Average Resolution Time (in hours)
    // Measures time between complaint creation and first transition to 'Resolved' status
    const resolveQuery = `
      SELECT AVG(EXTRACT(EPOCH FROM (h.changed_at - c.created_at))) / 3600 AS avg_resolution_hours
      FROM complaints c
      JOIN (
        SELECT complaint_id, MIN(changed_at) AS changed_at
        FROM complaint_status_history h
        JOIN complaint_statuses cs ON h.new_status_id = cs.id
        WHERE cs.name = 'Resolved'
        GROUP BY complaint_id
      ) h ON c.id = h.complaint_id
      ${user.role === 'DEPT_HEAD' ? 'WHERE c.department_id = $1' : ''}
    `;
    const resolveResult = await dbPool.query(resolveQuery, queryScopeParams);
    const avg_resolution_hours = resolveResult.rows[0]?.avg_resolution_hours
      ? parseFloat(parseFloat(resolveResult.rows[0].avg_resolution_hours).toFixed(1))
      : 0.0;

    return res.status(200).json({
      success: true,
      data: {
        total_complaints,
        breached_count,
        compliance_rate,
        avg_assignment_hours,
        avg_resolution_hours
      }
    });
  } catch (error) {
    console.error('Reports sla-compliance error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve SLA compliance metrics' });
  }
};

/**
 * Retrieve CSAT ratings and feedback statistics.
 * GET /api/reports/csat-metrics
 */
const getCsatMetrics = async (req, res) => {
  const user = req.user;

  let queryScopeClause = '';
  let queryScopeParams = [];
  if (user.role === 'DEPT_HEAD') {
    queryScopeClause = 'WHERE c.department_id = $1';
    queryScopeParams = [user.department_id];
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Calculate Average Rating and total rating counts
    const generalQuery = `
      SELECT
        AVG(f.rating)::float AS avg_rating,
        COUNT(f.id)::int AS feedback_count,
        COUNT(CASE WHEN f.rating = 5 THEN 1 END)::int AS rating_5,
        COUNT(CASE WHEN f.rating = 4 THEN 1 END)::int AS rating_4,
        COUNT(CASE WHEN f.rating = 3 THEN 1 END)::int AS rating_3,
        COUNT(CASE WHEN f.rating = 2 THEN 1 END)::int AS rating_2,
        COUNT(CASE WHEN f.rating = 1 THEN 1 END)::int AS rating_1
      FROM complaint_feedback f
      JOIN complaints c ON f.complaint_id = c.id
      ${queryScopeClause}
    `;
    const generalResult = await dbPool.query(generalQuery, queryScopeParams);
    const stats = generalResult.rows[0];

    // 2. Fetch total closed tickets to compute feedback rate
    const closedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedStatusId = closedStatusResult.rows[0]?.id || 0;

    const closedQuery = `
      SELECT COUNT(*)::int AS total_closed
      FROM complaints c
      WHERE c.status_id = $1
      ${user.role === 'DEPT_HEAD' ? 'AND c.department_id = $2' : ''}
    `;
    const closedParams = user.role === 'DEPT_HEAD' ? [closedStatusId, user.department_id] : [closedStatusId];
    const closedResult = await dbPool.query(closedQuery, closedParams);
    const totalClosed = closedResult.rows[0]?.total_closed || 0;

    const feedbackRate = totalClosed > 0
      ? parseFloat(((stats.feedback_count / totalClosed) * 100).toFixed(1))
      : 0.0;

    // 3. Department-wise CSAT breakdown (only for ADMIN)
    let deptBreakdown = [];
    if (user.role === 'ADMIN') {
      const deptQuery = `
        SELECT d.name AS department, AVG(f.rating)::float AS avg_rating, COUNT(f.id)::int AS feedback_count
        FROM complaint_feedback f
        JOIN complaints c ON f.complaint_id = c.id
        JOIN departments d ON c.department_id = d.id
        GROUP BY d.name
        ORDER BY avg_rating DESC
      `;
      const deptResult = await dbPool.query(deptQuery);
      deptBreakdown = deptResult.rows;
    }

    return res.status(200).json({
      success: true,
      data: {
        avg_rating: stats.avg_rating || 0.0,
        feedback_count: stats.feedback_count || 0,
        total_closed: totalClosed,
        feedback_rate: feedbackRate,
        distribution: {
          5: stats.rating_5 || 0,
          4: stats.rating_4 || 0,
          3: stats.rating_3 || 0,
          2: stats.rating_2 || 0,
          1: stats.rating_1 || 0
        },
        departments: deptBreakdown
      }
    });

  } catch (error) {
    console.error('Reports csat-metrics error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve CSAT metrics' });
  }
};

module.exports = {
  getTicketsByStatus,
  getTicketsByPriority,
  getTicketsByDepartment,
  getTicketTrends,
  getSlaCompliance,
  getCsatMetrics
};
