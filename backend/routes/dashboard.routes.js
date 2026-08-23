const express = require('express');
const router = express.Router();
const { getDashboardStats, getRecentActivity } = require('../controllers/dashboard.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount dashboard endpoints. Expect prefix /api/dashboard to be mounted in server.js
router.get('/stats', authenticateJWT, getDashboardStats);
router.get('/activity', authenticateJWT, getRecentActivity);

module.exports = router;
