const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const {
  getEngineers,
  getEngineerById,
  createEngineer,
  updateEngineer,
  toggleEngineerStatus,
  getSkillsAndExpertise
} = require('../controllers/engineers.controller');

// Meta lookups
router.get('/meta/skills-expertise', authenticateJWT, getSkillsAndExpertise);

// Engineer CRUD
router.get('/', authenticateJWT, getEngineers);
router.get('/:id', authenticateJWT, getEngineerById);
router.post('/', authenticateJWT, createEngineer);
router.put('/:id', authenticateJWT, updateEngineer);
router.patch('/:id/status', authenticateJWT, toggleEngineerStatus);

module.exports = router;
