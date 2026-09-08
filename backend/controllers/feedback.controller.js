const dbPool = require('../config/db');
const logger = require('../utils/logger');

/**
 * Submit feedback for a closed complaint.
 * POST /api/complaints/:id/feedback
 */
const submitFeedback = async (req, res) => {
  const { id } = req.params;
  const { rating, comments } = req.body;
  const user = req.user;

  if (rating === undefined || rating === null) {
    return res.status(400).json({ success: false, message: 'Rating is required' });
  }

  const numericRating = parseInt(rating, 10);
  if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5' });
  }

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // 1. Fetch complaint and status details
    const compQuery = `
      SELECT c.*, cs.name AS status_name
      FROM complaints c
      JOIN complaint_statuses cs ON c.status_id = cs.id
      WHERE c.id = $1
    `;
    const compResult = await dbPool.query(compQuery, [id]);

    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compResult.rows[0];

    // 2. Authorization guard: only the ticket creator can rate it
    if (complaint.created_by_id !== user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Only the complaint creator can submit feedback' });
    }

    // 3. Lifecycle guard: complaint must be Closed
    if (complaint.status_name !== 'Closed') {
      return res.status(400).json({ success: false, message: 'Feedback can only be submitted for closed complaints' });
    }

    // 4. Check duplicate submission
    const dupResult = await dbPool.query('SELECT id FROM complaint_feedback WHERE complaint_id = $1', [id]);
    if (dupResult.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Feedback has already been submitted for this complaint' });
    }

    // 5. Save feedback
    await dbPool.query(
      'INSERT INTO complaint_feedback (complaint_id, rating, comments) VALUES ($1, $2, $3)',
      [id, numericRating, comments ? comments.trim() : null]
    );

    logger.audit('FEEDBACK_SUBMITTED', { complaintId: id, rating: numericRating }, user, req.ip);

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Submit feedback error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
};

/**
 * Retrieve feedback details for a complaint.
 * GET /api/complaints/:id/feedback
 */
const getFeedback = async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  try {
    if (!dbPool) {
      return res.status(500).json({ success: false, message: 'Database connection is unavailable' });
    }

    // Check complaint access
    const compQuery = `
      SELECT created_by_id, department_id, assigned_to_id
      FROM complaints WHERE id = $1
    `;
    const compResult = await dbPool.query(compQuery, [id]);
    if (compResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const complaint = compResult.rows[0];

    // Enforce existing verification rules (verifyComplaintAccess)
    const isAdmin = user.role === 'ADMIN';
    const isAssignee = (user.role === 'ENGINEER' || user.role === 'AGENT') && complaint.assigned_to_id === user.id;
    const isCreator = user.role === 'CUSTOMER' && complaint.created_by_id === user.id;

    if (!isAdmin && !isDeptHead && !isAssignee && !isCreator) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient privileges to view feedback' });
    }

    const feedbackResult = await dbPool.query(
      'SELECT id, rating, comments, created_at FROM complaint_feedback WHERE complaint_id = $1',
      [id]
    );

    return res.status(200).json({
      success: true,
      data: feedbackResult.rows[0] || null
    });

  } catch (error) {
    console.error('Get feedback error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve feedback details' });
  }
};

module.exports = {
  submitFeedback,
  getFeedback
};
