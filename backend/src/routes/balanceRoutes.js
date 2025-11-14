const express = require('express');
const router = express.Router();
const { getBalances } = require('../controllers/balanceController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/balances
router.get('/', getBalances);

module.exports = router;
