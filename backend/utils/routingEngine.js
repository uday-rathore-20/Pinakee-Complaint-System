/**
 * Automated Ticket Auto-Routing and Load-Balancing Engine
 * Supports MANUAL, ROUND_ROBIN, and LEAST_BUSY routing modes.
 */

/**
 * Automatically determines and assigns an agent based on active configuration.
 * Must run within the caller's transaction scope (utilizing transaction client).
 *
 * @param {number} departmentId - Target department for routing
 * @param {Object} txClient - Database pool client in current transaction context
 * @returns {Promise<number|null>} Assigned Agent User ID or null if unassigned
 */
const routeTicket = async (departmentId, txClient) => {
  if (!departmentId) return null;

  // 1. Fetch current ticket routing setting
  const settingQuery = "SELECT value FROM system_settings WHERE key = 'ticket_routing_mode'";
  const settingRes = await txClient.query(settingQuery);
  const mode = settingRes.rows[0]?.value || 'MANUAL';

  if (mode === 'MANUAL') {
    return null;
  }

  // 2. Fetch eligible active engineers belonging to target department (role is ENGINEER / AGENT)
  const agentQuery = `
    SELECT u.id
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE r.name IN ('ENGINEER', 'AGENT')
      AND u.department_id = $1
      AND u.is_active = true
    ORDER BY u.id ASC
  `;
  const agentRes = await txClient.query(agentQuery, [departmentId]);
  const agents = agentRes.rows;

  if (agents.length === 0) {
    return null; // Safe fallback when no eligible agent exists
  }

  if (mode === 'ROUND_ROBIN') {
    // Acquire row-level update lock on the department to serialize concurrent rotators
    const lockQuery = "SELECT last_assigned_agent_id FROM departments WHERE id = $1 FOR UPDATE";
    const lockRes = await txClient.query(lockQuery, [departmentId]);
    const lastId = lockRes.rows[0]?.last_assigned_agent_id;

    let nextAgentId = agents[0].id;
    if (lastId) {
      const lastIndex = agents.findIndex(a => a.id === lastId);
      if (lastIndex !== -1 && lastIndex + 1 < agents.length) {
        nextAgentId = agents[lastIndex + 1].id;
      }
    }

    // Save state back to department record
    const updateDeptQuery = "UPDATE departments SET last_assigned_agent_id = $1 WHERE id = $2";
    await txClient.query(updateDeptQuery, [nextAgentId, departmentId]);

    return nextAgentId;
  }

  if (mode === 'LEAST_BUSY') {
    // Count active tickets (not 'Resolved' or 'Closed') for each eligible agent inside the department
    const leastQuery = `
      SELECT u.id, COUNT(c.id) AS active_count
      FROM users u
      LEFT JOIN complaints c ON c.assigned_to_id = u.id AND c.status_id NOT IN (
        SELECT id FROM complaint_statuses WHERE name IN ('Resolved', 'Closed')
      )
      WHERE u.id = ANY($1)
      GROUP BY u.id
      ORDER BY active_count ASC, u.id ASC
      LIMIT 1
    `;
    const agentIds = agents.map(a => a.id);
    const leastRes = await txClient.query(leastQuery, [agentIds]);
    return leastRes.rows[0]?.id || null;
  }

  return null;
};

module.exports = { routeTicket };
