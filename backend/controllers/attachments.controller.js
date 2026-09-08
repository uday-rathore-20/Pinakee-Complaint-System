const dbPool = require('../config/db');
const storage = require('../utils/storage');
const { validateFileSignature } = require('../utils/fileValidator');

/**
 * Helper to check if user has access to a specific complaint.
 */
const verifyComplaintAccess = (user, complaint) => {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ENGINEER' || user.role === 'AGENT') {
    return complaint.assigned_to_id === user.id;
  }
  if (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id) return true;
  if (user.role === 'CUSTOMER' && complaint.created_by_id === user.id) return true;
  return false;
};

/**
 * Upload an attachment to a complaint.
 * POST /api/complaints/:id/attachments
 */
const uploadAttachment = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Verify complaint exists
    const compResult = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    const complaint = compResult.rows[0];

    // Verify user has access to this complaint
    if (!verifyComplaintAccess(user, complaint)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to attach files to this complaint' });
    }

    // Engineers must claim ticket before uploading attachments
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
    const assignedId = assignedStatusResult.rows[0]?.id;
    if ((user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.status_id === assignedId) {
      return res.status(400).json({ success: false, message: 'Please claim the ticket before uploading attachments' });
    }

    // Customer cannot upload files to closed tickets
    const closedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedId = closedStatusResult.rows[0]?.id;
    if (user.role === 'CUSTOMER' && complaint.status_id === closedId) {
      return res.status(400).json({ success: false, message: 'Attachments cannot be added to closed complaints' });
    }

    // Validate actual file type via magic byte signature validation
    const validation = validateFileSignature(req.file.buffer, req.file.originalname);
    if (!validation.valid) {
      const logger = require('../utils/logger');
      logger.audit('SECURITY_VIOLATION', { action: 'ATTACHMENT_SPOOF_REJECTED', fileName: req.file.originalname, reason: validation.reason }, user, req.ip);
      return res.status(400).json({ success: false, message: `Upload rejected: ${validation.reason}` });
    }

    const detectedMime = validation.mimeType;

    // Determine evidence stage
    let stage = 'GENERAL';
    if (user.role !== 'CUSTOMER' && req.body && req.body.evidence_stage) {
      const inputStage = String(req.body.evidence_stage).toUpperCase().trim();
      if (['BEFORE', 'DURING', 'AFTER', 'GENERAL'].includes(inputStage)) {
        stage = inputStage;
      }
    }

    // Save file via storage driver
    const filePath = await storage.saveFile(req.file, detectedMime);

    // Save metadata in database
    const insertQuery = `
      INSERT INTO complaint_attachments (complaint_id, file_name, file_path, file_size, mime_type, uploaded_by_id, evidence_stage)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, file_name, file_size, mime_type, evidence_stage, created_at
    `;
    const result = await dbPool.query(insertQuery, [
      id,
      req.file.originalname,
      filePath,
      req.file.size,
      detectedMime,
      user.id,
      stage
    ]);

    // Log comment notifying the upload
    const commentRemark = stage !== 'GENERAL' 
      ? `Attached ${stage} evidence photo: ${req.file.originalname}`
      : `Attached file: ${req.file.originalname}`;

    await dbPool.query(`
      INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
      VALUES ($1, $2, $3, false)
    `, [id, user.id, commentRemark]);

    const logger = require('../utils/logger');
    logger.audit('ATTACHMENT_UPLOADED', { complaintId: id, fileName: req.file.originalname, evidenceStage: stage }, user, req.ip);
    if (stage !== 'GENERAL') {
      logger.audit('EVIDENCE_UPLOADED', { complaintId: id, fileName: req.file.originalname, evidenceStage: stage, mimeType: detectedMime }, user, req.ip);
    }

    return res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Upload attachment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
};

/**
 * Get all attachments metadata for a complaint.
 * GET /api/complaints/:id/attachments
 */
const getAttachments = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Verify complaint exists
    const compResult = await dbPool.query('SELECT * FROM complaints WHERE id = $1', [id]);
    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    const complaint = compResult.rows[0];

    // Verify access
    if (!verifyComplaintAccess(user, complaint)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to view attachments for this complaint' });
    }

    // Hide attachments before ticket claim for engineers
    const assignedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Assigned'");
    const assignedId = assignedStatusResult.rows[0]?.id;
    if ((user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.status_id === assignedId) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Fetch attachments
    const query = `
      SELECT a.id, a.file_name, a.file_size, a.mime_type, a.evidence_stage, a.created_at,
             u.first_name, u.last_name, r.name AS role
      FROM complaint_attachments a
      LEFT JOIN users u ON a.uploaded_by_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE a.complaint_id = $1
      ORDER BY a.created_at ASC
    `;
    const result = await dbPool.query(query, [id]);

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get attachments error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attachments listing' });
  }
};

/**
 * Download a file attachment securely.
 * GET /api/attachments/:id
 */
const downloadAttachment = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch attachment metadata
    const attachQuery = `
      SELECT a.*, c.created_by_id, c.department_id, c.assigned_to_id
      FROM complaint_attachments a
      JOIN complaints c ON a.complaint_id = c.id
      WHERE a.id = $1
    `;
    const attachResult = await dbPool.query(attachQuery, [id]);

    if (attachResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = attachResult.rows[0];
    const complaint = {
      created_by_id: attachment.created_by_id,
      department_id: attachment.department_id,
      assigned_to_id: attachment.assigned_to_id
    };

    // Verify visibility access to the associated complaint
    if (!verifyComplaintAccess(user, complaint)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to download this attachment' });
    }

    // Determine if this is a legacy local upload (does not start with 'attachments/')
    const isLegacy = !attachment.file_path.startsWith('attachments/');

    if (isLegacy) {
      const fs = require('fs');
      const path = require('path');
      const fullPath = path.join(__dirname, '..', attachment.file_path);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ success: false, message: 'Legacy file not found on local disk' });
      }
      res.setHeader('Content-Type', attachment.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
      return fs.createReadStream(fullPath).pipe(res);
    }

    // Modern upload: S3 client or Mock client
    const downloadUrl = await storage.getDownloadUrl(attachment.file_path, attachment.file_name);

    // Actual AWS S3 (or Mock S3 simulator) - Return pre-signed download URL via JSON
    return res.status(200).json({
      success: true,
      downloadUrl: downloadUrl
    });
  } catch (error) {
    console.error('Download attachment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to download attachment' });
  }
};

/**
 * Delete an attachment securely.
 * DELETE /api/attachments/:id
 */
const deleteAttachment = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Fetch attachment metadata and associated complaint details
    const attachQuery = `
      SELECT a.*, c.created_by_id, c.department_id, c.assigned_to_id, c.status_id
      FROM complaint_attachments a
      JOIN complaints c ON a.complaint_id = c.id
      WHERE a.id = $1
    `;
    const attachResult = await dbPool.query(attachQuery, [id]);

    if (attachResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = attachResult.rows[0];
    const complaint = {
      created_by_id: attachment.created_by_id,
      department_id: attachment.department_id,
      assigned_to_id: attachment.assigned_to_id
    };

    // Verify access to the associated complaint
    if (!verifyComplaintAccess(user, complaint)) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to access this attachment' });
    }

    // Check Closed status status_id
    const closedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedId = closedStatusResult.rows[0]?.id;

    // Check deletion permissions:
    // ADMIN can delete anything.
    // Other roles can delete ONLY if they uploaded it AND the ticket is not Closed.
    const isAdmin = user.role === 'ADMIN';
    const isOwner = attachment.uploaded_by_id === user.id;

    // Evidence photo deletion protection (Customers cannot delete engineer evidence)
    if (attachment.evidence_stage && attachment.evidence_stage !== 'GENERAL') {
      if (user.role === 'CUSTOMER') {
        return res.status(403).json({ success: false, message: 'Forbidden: Customers cannot delete service evidence photos' });
      }
    }

    if (!isAdmin) {
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only delete attachments that you uploaded' });
      }
      if (attachment.status_id === closedId) {
        return res.status(400).json({ success: false, message: 'Attachments cannot be deleted from closed complaints' });
      }
    }

    // Delete file and database record inside an atomic transaction
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      // 1. Delete from database first
      await client.query('DELETE FROM complaint_attachments WHERE id = $1', [id]);

      // 2. Delete from S3 storage
      await storage.deleteFile(attachment.file_path);

      // 3. Add audit discussion log
      await client.query(`
        INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
        VALUES ($1, $2, $3, false)
      `, [attachment.complaint_id, user.id, `Removed attached file: ${attachment.file_name}`]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    const logger = require('../utils/logger');
    logger.audit('ATTACHMENT_DELETED', { complaintId: attachment.complaint_id, fileName: attachment.file_name }, user, req.ip);

    return res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully'
    });

  } catch (error) {
    console.error('Delete attachment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
};

/**
 * Route to serve local storage attachment download via HMAC time-limited signed URL
 * GET /api/attachments/mock-download/:filename
 */
const mockDownloadAttachment = async (req, res) => {
  const { filename } = req.params;
  const { fileName, expires, token } = req.query;

  try {
    const fs = require('fs');
    const path = require('path');

    // 1. Path traversal & character safety check
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid filename parameter' });
    }

    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      return res.status(400).json({ success: false, message: 'Invalid filename parameter' });
    }

    // 2. HMAC token signature and expiration verification
    const isValid = storage.verifyLocalDownloadToken(safeFilename, expires, token);
    if (!isValid) {
      const logger = require('../utils/logger');
      logger.audit('SECURITY_VIOLATION', {
        action: 'LOCAL_STORAGE_DOWNLOAD_REJECTED',
        filename: safeFilename,
        reason: 'Missing, expired, or invalid HMAC signature token'
      }, null, req.ip);
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired download token' });
    }

    const fullPath = path.join(__dirname, '..', 'uploads', safeFilename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, message: 'File not found on storage backend' });
    }

    // Determine content type based on extension
    const ext = safeFilename.split('.').pop().toLowerCase();
    const mimeMap = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv'
    };

    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName || safeFilename}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (error) {
    console.error('Local download error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to stream file from local storage' });
    }
  }
};

module.exports = {
  uploadAttachment,
  getAttachments,
  downloadAttachment,
  deleteAttachment,
  mockDownloadAttachment,
};
