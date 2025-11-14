const Expense = require('../models/Expense');
const Member = require('../models/Member');

/**
 * Get all expenses
 */
const getAllExpenses = async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;

    let query = {};

    // Date filtering
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    let expensesQuery = Expense.find(query)
      .populate('paidBy', 'name')
      .sort({ date: -1 });

    if (limit) {
      expensesQuery = expensesQuery.limit(parseInt(limit));
    }

    const expenses = await expensesQuery;

    res.status(200).json(expenses);
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a new expense
 */
const createExpense = async (req, res) => {
  try {
    const { title, amount, paidBy, date } = req.body;

    // Validation
    if (!title || !amount || !paidBy) {
      return res.status(400).json({
        message: 'Title, amount, and paidBy are required',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Verify member exists
    const member = await Member.findById(paidBy);
    if (!member || !member.isActive) {
      return res.status(400).json({ message: 'Invalid member ID' });
    }

    // Get current active member count
    const memberCount = await Member.countDocuments({ isActive: true });

    if (memberCount === 0) {
      return res.status(400).json({ message: 'No active members found' });
    }

    const expense = new Expense({
      title: title.trim(),
      amount: parseFloat(amount),
      paidBy,
      date: date ? new Date(date) : new Date(),
      memberCountAtTime: memberCount,
    });

    await expense.save();

    // Populate the paidBy field before sending response
    await expense.populate('paidBy', 'name');

    res.status(201).json(expense);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete an expense
 */
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get expense statistics
 */
const getExpenseStats = async (req, res) => {
  try {
    const totalExpenses = await Expense.countDocuments();
    const totalAmount = await Expense.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.status(200).json({
      totalExpenses,
      totalAmount: totalAmount.length > 0 ? totalAmount[0].total : 0,
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllExpenses,
  createExpense,
  deleteExpense,
  getExpenseStats,
};
