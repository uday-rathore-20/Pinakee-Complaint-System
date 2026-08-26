const dbPool = require('../config/db');
const storage = require('../utils/storage');

/**
 * Helper to check if user has access to a specific complaint.
 */
const verifyComplaintAccess = (user, complaint) => {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'DEPT_HEAD' && complaint.department_id === user.department_id) return true;
  if (user.role === 'AGENT' && complaint.assigned_to_id === user.id) return true;
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

    // Customer cannot upload files to closed tickets
    const closedStatusResult = await dbPool.query("SELECT id FROM complaint_statuses WHERE name = 'Closed'");
    const closedId = closedStatusResult.rows[0]?.id;
    if (user.role === 'CUSTOMER' && complaint.status_id === closedId) {
      return res.status(400).json({ success: false, message: 'Attachments cannot be added to closed complaints' });
    }

    // Save file via storage driver
    const filePath = await storage.saveFile(req.file);

    // Save metadata in database
    const insertQuery = `
      INSERT INTO complaint_attachments (complaint_id, file_name, file_path, file_size, mime_type, uploaded_by_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, file_name, file_size, mime_type, created_at
    `;
    const result = await dbPool.query(insertQuery, [
      id,
      req.file.originalname,
      filePath,
      req.file.size,
      req.file.mimetype,
      user.id
    ]);

    // Log comment notifying the upload
    await dbPool.query(`
      INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
      VALUES ($1, $2, $3, false)
    `, [id, user.id, `Attached file: ${req.file.originalname}`]);

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

    // Fetch attachments
    const query = `
      SELECT a.id, a.file_name, a.file_size, a.mime_type, a.created_at,
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

    // Get readable file stream via storage driver
    const fileStream = await storage.getFileStream(attachment.file_path);

    // Set download headers
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);

    // Stream to client
    fileStream.pipe(res);
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

    if (!isAdmin) {
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden: You can only delete attachments that you uploaded' });
      }
      if (attachment.status_id === closedId) {
        return res.status(400).json({ success: false, message: 'Attachments cannot be deleted from closed complaints' });
      }
    }

    // Delete file from disk via storage driver
    await storage.deleteFile(attachment.file_path);

    // Remove record from database
    await dbPool.query('DELETE FROM complaint_attachments WHERE id = $1', [id]);

    // Add a comment to audit log discussion
    await dbPool.query(`
      INSERT INTO complaint_comments (complaint_id, user_id, comment_text, is_internal)
      VALUES ($1, $2, $3, false)
    `, [attachment.complaint_id, user.id, `Removed attached file: ${attachment.file_name}`]);

    return res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully'
    });

  } catch (error) {
    console.error('Delete attachment error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
};

module.exports = {
  uploadAttachment,
  getAttachments,
  downloadAttachment,
  deleteAttachment,
};
