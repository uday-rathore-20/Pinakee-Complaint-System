const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  updateUserProfile,
  changeUserPassword,
  exportUsers,
} = require('../controllers/users.controller');
const { authenticateJWT, requireRole } = require('../middleware/auth');

// PUT /api/users/profile -> Update logged-in user profile details (requires authentication)
router.put('/profile', authenticateJWT, updateUserProfile);

// PUT /api/users/profile/password -> Update logged-in user password securely (requires authentication)
router.put('/profile/password', authenticateJWT, changeUserPassword);

// GET /api/users/export -> Export users as CSV (restricted to ADMIN)
router.get('/export', authenticateJWT, requireRole('ADMIN'), exportUsers);

// GET /api/users -> List all users (restricted to ADMIN and DEPT_HEAD)
router.get('/', authenticateJWT, requireRole('ADMIN', 'DEPT_HEAD'), getUsers);

// GET /api/users/:id -> Get specific user details (restricted to ADMIN)
router.get('/:id', authenticateJWT, requireRole('ADMIN'), getUserById);

// POST /api/users -> Create a new user (restricted to ADMIN)
router.post('/', authenticateJWT, requireRole('ADMIN'), createUser);

// PUT /api/users/:id -> Update user details (restricted to ADMIN)
router.put('/:id', authenticateJWT, requireRole('ADMIN'), updateUser);

// PATCH /api/users/:id/status -> Toggle user active status (restricted to ADMIN)
router.patch('/:id/status', authenticateJWT, requireRole('ADMIN'), updateUserStatus);

module.exports = router;
