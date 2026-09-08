const express = require('express');
const router = express.Router();
const {
  getFcr,
  saveFcrDraft,
  submitFcr,
  confirmFcr,
  startTravel,
  reachedSite,
  addPart,
  updatePart,
  deletePart,
  addDevice,
  updateDevice,
  deleteDevice,
  downloadFcrPdf
} = require('../controllers/fcr.controller');
const { authenticateJWT } = require('../middleware/auth');

// Mount routes (mounted under /api/complaints in server.js)

// 1. Digital FCR / Service Report Core
router.get('/:id/fcr', authenticateJWT, getFcr);
router.post('/:id/fcr', authenticateJWT, saveFcrDraft);
router.put('/:id/fcr', authenticateJWT, saveFcrDraft);
router.post('/:id/fcr/submit', authenticateJWT, submitFcr);
router.post('/:id/fcr/confirm', authenticateJWT, confirmFcr);
router.get('/:id/fcr/pdf', authenticateJWT, downloadFcrPdf);

// 1b. Field Travel Milestones
router.post('/:id/travel/start', authenticateJWT, startTravel);
router.post('/:id/travel/reached', authenticateJWT, reachedSite);
router.post('/:id/fcr/travel/start', authenticateJWT, startTravel);
router.post('/:id/fcr/travel/reached', authenticateJWT, reachedSite);

// 2. Service Report Aliases
router.get('/:id/service-report', authenticateJWT, getFcr);
router.post('/:id/service-report', authenticateJWT, saveFcrDraft);
router.put('/:id/service-report', authenticateJWT, saveFcrDraft);
router.post('/:id/service-report/submit', authenticateJWT, submitFcr);
router.post('/:id/service-report/confirm', authenticateJWT, confirmFcr);
router.post('/:id/service-report/travel/start', authenticateJWT, startTravel);
router.post('/:id/service-report/travel/reached', authenticateJWT, reachedSite);

// 3. Parts Management Endpoints
router.post('/:id/fcr/parts', authenticateJWT, addPart);
router.put('/:id/fcr/parts/:partId', authenticateJWT, updatePart);
router.delete('/:id/fcr/parts/:partId', authenticateJWT, deletePart);
router.post('/:id/service-report/parts', authenticateJWT, addPart);
router.put('/:id/service-report/parts/:partId', authenticateJWT, updatePart);
router.delete('/:id/service-report/parts/:partId', authenticateJWT, deletePart);

// 4. Equipment / Device Management Endpoints
router.post('/:id/fcr/devices', authenticateJWT, addDevice);
router.put('/:id/fcr/devices/:deviceId', authenticateJWT, updateDevice);
router.delete('/:id/fcr/devices/:deviceId', authenticateJWT, deleteDevice);
router.post('/:id/service-report/devices', authenticateJWT, addDevice);
router.put('/:id/service-report/devices/:deviceId', authenticateJWT, updateDevice);
router.delete('/:id/service-report/devices/:deviceId', authenticateJWT, deleteDevice);

module.exports = router;

