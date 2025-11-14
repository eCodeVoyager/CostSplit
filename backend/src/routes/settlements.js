const express = require('express');
const router = express.Router();
const {
  markSettlementPaid,
  getSettlementHistory,
  deleteSettlement,
} = require('../controllers/settlementController');

// Mark a settlement as paid
router.post('/', markSettlementPaid);

// Get settlement history with optional filters
router.get('/history', getSettlementHistory);

// Delete a settlement
router.delete('/:id', deleteSettlement);

module.exports = router;
