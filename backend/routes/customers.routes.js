const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  getServiceLocations,
  addServiceLocation,
  updateServiceLocation,
  toggleServiceLocationStatus,
  getContacts,
  addContact,
  updateContact,
  deleteContact
} = require('../controllers/customers.controller');

// Customer CRUD
router.get('/', authenticateJWT, getCustomers);
router.get('/:id', authenticateJWT, getCustomerById);
router.post('/', authenticateJWT, createCustomer);
router.put('/:id', authenticateJWT, updateCustomer);
router.patch('/:id/status', authenticateJWT, toggleCustomerStatus);

// Service Locations CRUD
router.get('/:customerId/locations', authenticateJWT, getServiceLocations);
router.post('/:customerId/locations', authenticateJWT, addServiceLocation);
router.put('/locations/:locationId', authenticateJWT, updateServiceLocation);
router.patch('/locations/:locationId/status', authenticateJWT, toggleServiceLocationStatus);

// Contacts CRUD
router.get('/:customerId/contacts', authenticateJWT, getContacts);
router.post('/:customerId/contacts', authenticateJWT, addContact);
router.put('/contacts/:contactId', authenticateJWT, updateContact);
router.delete('/contacts/:contactId', authenticateJWT, deleteContact);

module.exports = router;
