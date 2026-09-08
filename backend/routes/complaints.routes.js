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
  reopenComplaint,
  addComment,
  exportComplaints,
  deleteComplaint,
  requestReassignment,
  rejectReassignment,
  approveReassignment,
  getReassignmentRequests
} = require('../controllers/complaints.controller');
const {
  submitFeedback,
  getFeedback,
} = require('../controllers/feedback.controller');
const { authenticateJWT } = require('../middleware/auth');
const { complaintMutationRateLimiter } = require('../middleware/rateLimiter');

// Mount routes (prefix /api/complaints is registered in server.js)
router.get('/export', authenticateJWT, exportComplaints);
router.get('/', authenticateJWT, getComplaints);
router.get('/:id', authenticateJWT, getComplaintById);
router.post('/', authenticateJWT, complaintMutationRateLimiter, createComplaint);
router.put('/:id', authenticateJWT, complaintMutationRateLimiter, updateComplaint);
router.delete('/:id', authenticateJWT, deleteComplaint);
router.patch('/:id/assign', authenticateJWT, assignComplaint);
router.patch('/:id/claim', authenticateJWT, claimComplaint);
router.patch('/:id/status', authenticateJWT, updateComplaintStatus);
router.post('/:id/reopen', authenticateJWT, reopenComplaint);
router.post('/:id/comments', authenticateJWT, addComment);

// Reassignment Request Workflow Routes
router.post('/:id/reassignment/request', authenticateJWT, requestReassignment);
router.post('/:id/reassignment/reject', authenticateJWT, rejectReassignment);
router.post('/:id/reassignment/approve', authenticateJWT, approveReassignment);
router.get('/:id/reassignment/requests', authenticateJWT, getReassignmentRequests);

// Feedback Loop (CSAT) Routes
router.post('/:id/feedback', authenticateJWT, submitFeedback);
router.get('/:id/feedback', authenticateJWT, getFeedback);

module.exports = router;
