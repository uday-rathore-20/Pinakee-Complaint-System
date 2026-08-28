const express = require('express');
const router = express.Router();
const {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  assignComplaint,
  claimComplaint,
  updateComplaintStatus,
  addComment,
  exportComplaints,
} = require('../controllers/complaints.controller');
const {
  submitFeedback,
  getFeedback,
} = require('../controllers/feedback.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount routes (prefix /api/complaints is registered in server.js)
router.get('/export', authenticateJWT, exportComplaints);
router.get('/', authenticateJWT, getComplaints);
router.get('/:id', authenticateJWT, getComplaintById);
router.post('/', authenticateJWT, createComplaint);
router.put('/:id', authenticateJWT, updateComplaint);
router.patch('/:id/assign', authenticateJWT, assignComplaint);
router.patch('/:id/claim', authenticateJWT, claimComplaint);
router.patch('/:id/status', authenticateJWT, updateComplaintStatus);
router.post('/:id/comments', authenticateJWT, addComment);

// Feedback Loop (CSAT) Routes
router.post('/:id/feedback', authenticateJWT, submitFeedback);
router.get('/:id/feedback', authenticateJWT, getFeedback);

module.exports = router;
