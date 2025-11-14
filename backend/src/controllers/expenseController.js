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
        .populate('payers.member', 'name')
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
    const { title, amount, paidBy, payers, date } = req.body;

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

    // Validation - Payer(s)
    let validatedPayers = null;
    let validatedPaidBy = null;

    if (payers && Array.isArray(payers) && payers.length > 0) {
      // Multi-payer mode
      if (payers.length > 20) {
        return res.status(400).json({ message: 'Cannot have more than 20 payers' });
      }

      // Validate each payer
      const payerPromises = payers.map(async (payer) => {
        if (!payer.member || !payer.amount) {
          throw new Error('Each payer must have member and amount');
        }

        // Validate MongoDB ObjectId format
        if (!payer.member.match(/^[0-9a-fA-F]{24}$/)) {
          throw new Error('Invalid payer member ID format');
        }

        const payerAmount = parseFloat(payer.amount);
        if (isNaN(payerAmount) || payerAmount <= 0) {
          throw new Error('Each payer amount must be greater than 0');
        }

        // Verify member exists
        const member = await Member.findById(payer.member);
        if (!member || !member.isActive) {
          throw new Error(`Payer member ${payer.member} not found or inactive`);
        }

        return {
          member: payer.member,
          amount: Math.round(payerAmount * 100) / 100,
        };
      });

      try {
        validatedPayers = await Promise.all(payerPromises);

        // Verify total payer amounts match expense amount
        const totalPaid = validatedPayers.reduce((sum, p) => sum + p.amount, 0);
        if (Math.abs(totalPaid - roundedAmount) > 0.01) {
          return res.status(400).json({
            message: `Total payer amounts (${totalPaid}) must equal expense amount (${roundedAmount})`
          });
        }
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    } else {
      // Single payer mode
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

      validatedPaidBy = paidBy;
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

    const expenseData = {
      title: sanitizedTitle,
      amount: roundedAmount,
      date: expenseDate,
      memberCountAtTime: memberCount,
    };

    // Add either payers or paidBy
    if (validatedPayers) {
      expenseData.payers = validatedPayers;
    } else {
      expenseData.paidBy = validatedPaidBy;
    }

    const expense = new Expense(expenseData);
    await expense.save();

    // Populate payers or paidBy before sending response
    if (validatedPayers) {
      await expense.populate('payers.member', 'name');
    } else {
      await expense.populate('paidBy', 'name');
    }

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
 * Toggle expense settled status
 */
const toggleExpenseSettled = async (req, res) => {
  try {
    const { id } = req.params;
    const { settled } = req.body;

    // Validate MongoDB ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid expense ID' });
    }

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Toggle or set settled status
    expense.settled = typeof settled === 'boolean' ? settled : !expense.settled;
    expense.settledDate = expense.settled ? new Date() : null;

    await expense.save();

    // Populate before sending response
    if (expense.payers && expense.payers.length > 0) {
      await expense.populate('payers.member', 'name');
    } else {
      await expense.populate('paidBy', 'name');
    }

    res.status(200).json({
      message: expense.settled ? 'Expense marked as settled' : 'Expense marked as unsettled',
      expense,
    });
  } catch (error) {
    console.error('Toggle expense settled error:', error);
    res.status(500).json({ message: 'Unable to update expense. Please try again.' });
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
  toggleExpenseSettled,
  deleteExpense,
  getExpenseStats,
};
