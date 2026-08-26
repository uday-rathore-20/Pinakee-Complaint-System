const express = require('express');
const router = express.Router();
const {
  getTicketsByStatus,
  getTicketsByPriority,
  getTicketsByDepartment,
  getTicketTrends,
  getSlaCompliance
} = require('../controllers/reports.controller');
const { authenticateJWT, requireRole } = require('../middleware/auth');

// Apply auth to all routes in this router
router.use(authenticateJWT);
router.use(requireRole('ADMIN', 'DEPT_HEAD'));

// GET /api/reports/...
router.get('/tickets-by-status', getTicketsByStatus);
router.get('/tickets-by-priority', getTicketsByPriority);
router.get('/tickets-by-department', getTicketsByDepartment);
router.get('/ticket-trends', getTicketTrends);
router.get('/sla-compliance', getSlaCompliance);

module.exports = router;
