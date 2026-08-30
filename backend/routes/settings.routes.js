const express = require('express');
const router = express.Router();
const { authenticateJWT, requireRole } = require('../middleware/auth');
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  getCategories,
  createCategory,
  updateCategory,
  getPriorities,
  updatePrioritySla,
  getRoutingMode,
  updateRoutingMode,
  listArchives,
  downloadArchive,
  runArchiveManually,
  getOutbox,
  retryOutboxMail
} = require('../controllers/settings.controller');

// Require authentication and ADMIN role for all routes in this settings router
router.use(authenticateJWT);
router.use(requireRole('ADMIN'));

router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);

router.get('/categories', getCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);

router.get('/priorities', getPriorities);
router.put('/priorities/:id', updatePrioritySla);

router.get('/routing', getRoutingMode);
router.put('/routing', updateRoutingMode);

router.get('/archives', listArchives);
router.get('/archives/:filename', downloadArchive);
router.post('/archives/run', runArchiveManually);

router.get('/outbox', getOutbox);
router.post('/outbox/:id/retry', retryOutboxMail);

module.exports = router;
