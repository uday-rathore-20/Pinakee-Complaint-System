const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
} = require('../controllers/users.controller');
const { authenticateJWT, requireRole } = require('../middleware/auth');

// GET /api/users -> List all users (requires authentication)
router.get('/', authenticateJWT, getUsers);

// GET /api/users/:id -> Get specific user details (requires authentication)
router.get('/:id', authenticateJWT, getUserById);

// POST /api/users -> Create a new user (restricted to ADMIN)
router.post('/', authenticateJWT, requireRole('ADMIN'), createUser);

// PUT /api/users/:id -> Update user details (restricted to ADMIN)
router.put('/:id', authenticateJWT, requireRole('ADMIN'), updateUser);

// PATCH /api/users/:id/status -> Toggle user active status (restricted to ADMIN)
router.patch('/:id/status', authenticateJWT, requireRole('ADMIN'), updateUserStatus);

module.exports = router;
