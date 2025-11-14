const Expense = require('../models/Expense');
const Member = require('../models/Member');

/**
 * Sanitize string input to prevent XSS
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent basic XSS
    .substring(0, 100); // Limit length
};

/**
 * Get all expenses with pagination
 */
const getAllExpenses = async (req, res) => {
  try {
    const { startDate, endDate, limit, page = 1 } = req.query;

    let query = {};

    // Date filtering with validation
    if (startDate || endDate) {
      query.date = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({ message: 'Invalid start date format' });
        }
        query.date.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({ message: 'Invalid end date format' });
        }
        query.date.$lte = end;
      }
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 100, 1000); // Max 1000 per page
    const skip = (pageNum - 1) * limitNum;

    const [expenses, totalCount] = await Promise.all([
      Expense.find(query)
        .populate('paidBy', 'name')
        .sort({ date: -1 })
        .limit(limitNum)
        .skip(skip),
      Expense.countDocuments(query)
    ]);

    res.status(200).json({
      expenses,
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalCount / limitNum)
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Unable to fetch expenses. Please try again.' });
  }
};

/**
 * Create a new expense
 */
const createExpense = async (req, res) => {
  try {
    const { title, amount, paidBy, date } = req.body;

    // Validation - Title
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ message: 'Expense title is required' });
    }

    const sanitizedTitle = sanitizeInput(title);

    if (sanitizedTitle.length < 1) {
      return res.status(400).json({ message: 'Expense title must be at least 1 character' });
    }

    if (sanitizedTitle.length > 100) {
      return res.status(400).json({ message: 'Expense title cannot exceed 100 characters' });
    }

    // Validation - Amount
    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount)) {
      return res.status(400).json({ message: 'Amount must be a valid number' });
    }

    if (parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    if (parsedAmount > 10000000) {
      return res.status(400).json({ message: 'Amount cannot exceed 10,000,000' });
    }

    // Round to 2 decimal places
    const roundedAmount = Math.round(parsedAmount * 100) / 100;

    // Validation - PaidBy
    if (!paidBy) {
      return res.status(400).json({ message: 'Paid by member is required' });
    }

    // Validate MongoDB ObjectId format
    if (!paidBy.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid member ID format' });
    }

    // Verify member exists and is active
    const member = await Member.findById(paidBy);
    if (!member || !member.isActive) {
      return res.status(400).json({ message: 'Selected member not found or inactive' });
    }

    // Get current active member count
    const memberCount = await Member.countDocuments({ isActive: true });

    if (memberCount === 0) {
      return res.status(400).json({ message: 'No active members found. Add members first.' });
    }

    // Validation - Date (optional)
    let expenseDate = new Date();
    if (date) {
      expenseDate = new Date(date);
      if (isNaN(expenseDate.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }

      // Prevent future dates beyond 1 day
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (expenseDate > tomorrow) {
        return res.status(400).json({ message: 'Expense date cannot be in the future' });
      }

      // Prevent dates too far in the past (more than 5 years)
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      if (expenseDate < fiveYearsAgo) {
        return res.status(400).json({ message: 'Expense date cannot be more than 5 years in the past' });
      }
    }

    // Check expense limit (prevent abuse)
    const expenseCount = await Expense.countDocuments();
    if (expenseCount >= 10000) {
      return res.status(400).json({
        message: 'Maximum expense limit (10,000) reached. Please archive old expenses.'
      });
    }

    const expense = new Expense({
      title: sanitizedTitle,
      amount: roundedAmount,
      paidBy,
      date: expenseDate,
      memberCountAtTime: memberCount,
    });

    await expense.save();

    // Populate the paidBy field before sending response
    await expense.populate('paidBy', 'name');

    res.status(201).json(expense);
  } catch (error) {
    console.error('Create expense error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: 'Unable to create expense. Please try again.' });
  }
};

/**
 * Delete an expense
 */
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }

    const expense = await Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(200).json({
      message: 'Expense deleted successfully',
      deletedExpense: { id: expense._id, title: expense.title, amount: expense.amount }
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Unable to delete expense. Please try again.' });
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
      totalAmount: totalAmount.length > 0 ? Math.round(totalAmount[0].total * 100) / 100 : 0,
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({ message: 'Unable to fetch statistics. Please try again.' });
  }
};

module.exports = {
  getAllExpenses,
  createExpense,
  deleteExpense,
  getExpenseStats,
};
