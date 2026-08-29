const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  uploadAttachment,
  getAttachments,
  downloadAttachment,
  deleteAttachment,
  mockDownloadAttachment,
} = require('../controllers/attachments.controller');
const { authenticateJWT } = require('../middleware/auth');

// Configure multer parser for memory buffer uploading (max 5MB file size limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Post attachment to a specific complaint (JWT check + Multer check)
router.post('/complaints/:id/attachments', authenticateJWT, upload.single('file'), uploadAttachment);

// Get list of attachments for a complaint
router.get('/complaints/:id/attachments', authenticateJWT, getAttachments);

// Download file attachment securely (resolves by attachment ID)
router.get('/attachments/:id', authenticateJWT, downloadAttachment);

// Public route to simulate pre-signed S3 download in mock development environment
router.get('/attachments/mock-download/:filename', mockDownloadAttachment);

// Delete file attachment securely (resolves by attachment ID)
router.delete('/attachments/:id', authenticateJWT, deleteAttachment);

module.exports = router;
