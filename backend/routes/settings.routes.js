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
  updatePrioritySla
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

module.exports = router;
