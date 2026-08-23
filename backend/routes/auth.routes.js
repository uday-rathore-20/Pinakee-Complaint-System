const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/auth.controller');
const { authenticateJWT } = require('../middleware/auth');

// POST /api/auth/login -> Login user
router.post('/login', login);

// GET /api/auth/me -> Get current user info (requires authentication)
router.get('/me', authenticateJWT, getMe);

module.exports = router;
