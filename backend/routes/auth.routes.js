const express = require('express');
const router = express.Router();
const {
  login,
  getMe,
  forgotPassword,
  resetPassword,
  getSimulatedEmails
} = require('../controllers/auth.controller');
const { authenticateJWT } = require('../middleware/auth');

// POST /api/auth/login -> Login user
router.post('/login', login);

// POST /api/auth/forgot-password -> Request password recovery
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password -> Complete password recovery using token
router.post('/reset-password', resetPassword);

// GET /api/auth/simulated-emails -> Retrieve email logs (Dev simulator endpoint)
router.get('/simulated-emails', getSimulatedEmails);

// GET /api/auth/me -> Get current user info (requires authentication)
router.get('/me', authenticateJWT, getMe);

module.exports = router;
