const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require('../controllers/notifications.controller');
const { authenticateJWT } = require('../middleware/auth');

router.get('/', authenticateJWT, getNotifications);
router.get('/unread-count', authenticateJWT, getUnreadCount);
router.patch('/:id/read', authenticateJWT, markAsRead);
router.post('/mark-all-read', authenticateJWT, markAllAsRead);

module.exports = router;
