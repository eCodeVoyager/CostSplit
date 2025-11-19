const express = require('express');
const router = express.Router();
const {
  markSettlementPaid,
  getSettlementHistory,
  deleteSettlement,
} = require('../controllers/settlementController');
const authenticateToken = require('../middleware/authMiddleware');

// Apply authentication to all settlement routes
router.use(authenticateToken);

// Mark a settlement as paid
router.post('/', markSettlementPaid);

// Get settlement history with optional filters
router.get('/history', getSettlementHistory);

// Delete a settlement
router.delete('/:id', deleteSettlement);

module.exports = router;
