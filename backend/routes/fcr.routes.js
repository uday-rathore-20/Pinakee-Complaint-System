const express = require('express');
const router = express.Router();
const {
  getFcr,
  createFcrDraft,
  updateFcrDraft,
  submitFcr,
  confirmFcr,
  downloadFcrPdf
} = require('../controllers/fcr.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount routes (prefix is /api/complaints in server.js)
router.get('/:id/fcr', authenticateJWT, getFcr);
router.post('/:id/fcr', authenticateJWT, createFcrDraft);
router.put('/:id/fcr', authenticateJWT, updateFcrDraft);
router.post('/:id/fcr/submit', authenticateJWT, submitFcr);
router.post('/:id/fcr/confirm', authenticateJWT, confirmFcr);
router.get('/:id/fcr/pdf', authenticateJWT, downloadFcrPdf);

module.exports = router;
