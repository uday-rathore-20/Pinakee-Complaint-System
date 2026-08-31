const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLogs.controller');
const { authenticateJWT, requireRole } = require('../middleware/auth');

// GET /api/audit-logs -> Retrieve security/action logs (Admin only)
router.get('/', authenticateJWT, requireRole('ADMIN'), getAuditLogs);
router.get('/logs', authenticateJWT, requireRole('ADMIN'), getAuditLogs);
router.get('/trails', authenticateJWT, requireRole('ADMIN'), getAuditLogs);
router.get('/trail', authenticateJWT, requireRole('ADMIN'), getAuditLogs);

module.exports = router;
