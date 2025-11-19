const express = require('express');
const router = express.Router();
const {
  getAllExpenses,
  createExpense,
  toggleExpenseSettled,
  deleteExpense,
  getExpenseStats,
  getCostAnalytics,
} = require('../controllers/expenseController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// GET /api/expenses
router.get('/', getAllExpenses);

// GET /api/expenses/stats
router.get('/stats', getExpenseStats);

// GET /api/expenses/analytics - Cost breakdown and analytics
router.get('/analytics', getCostAnalytics);

// POST /api/expenses
router.post('/', createExpense);

// PATCH /api/expenses/:id/settle - Toggle settled status
router.patch('/:id/settle', toggleExpenseSettled);

// DELETE /api/expenses/:id
router.delete('/:id', deleteExpense);

module.exports = router;
