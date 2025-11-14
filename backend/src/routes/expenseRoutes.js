const express = require('express');
const router = express.Router();
const {
  getAllExpenses,
  createExpense,
  deleteExpense,
  getExpenseStats,
} = require('../controllers/expenseController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/expenses
router.get('/', getAllExpenses);

// GET /api/expenses/stats
router.get('/stats', getExpenseStats);

// POST /api/expenses
router.post('/', createExpense);

// DELETE /api/expenses/:id
router.delete('/:id', deleteExpense);

module.exports = router;
