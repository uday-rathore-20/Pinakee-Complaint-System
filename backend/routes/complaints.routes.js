const express = require('express');
const router = express.Router();
const {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  updateComplaintStatus,
  addComment,
} = require('../controllers/complaints.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount routes (prefix /api/complaints is registered in server.js)
router.get('/', authenticateJWT, getComplaints);
router.get('/:id', authenticateJWT, getComplaintById);
router.post('/', authenticateJWT, createComplaint);
router.put('/:id', authenticateJWT, updateComplaint);
router.patch('/:id/assign', authenticateJWT, assignComplaint);
router.patch('/:id/status', authenticateJWT, updateComplaintStatus);
router.post('/:id/comments', authenticateJWT, addComment);

module.exports = router;
