const express = require('express');
const router = express.Router();
const {
  getCategories,
  getDepartments,
  getStatuses,
  getPriorities,
} = require('../controllers/lookups.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount lookups directly. Expect /api prefix to be mounted in server.js
router.get('/categories', authenticateJWT, getCategories);
router.get('/departments', authenticateJWT, getDepartments);
router.get('/statuses', authenticateJWT, getStatuses);
router.get('/priorities', authenticateJWT, getPriorities);

module.exports = router;
