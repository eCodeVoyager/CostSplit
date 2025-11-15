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
    const { startDate, endDate, limit, page = 1, sortBy = 'date' } = req.query;

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

    // Sorting - default by date (expense date), or by createdAt (when expense was created)
    let sortField = {};
    if (sortBy === 'createdAt') {
      sortField = { createdAt: -1 }; // Most recent created first
    } else {
      sortField = { date: -1 }; // Most recent expense date first (default)
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 100, 1000); // Max 1000 per page
    const skip = (pageNum - 1) * limitNum;

    const [expenses, totalCount] = await Promise.all([
      Expense.find(query)
        .populate('paidBy', 'name')
        .populate('payers.member', 'name')
        .populate('sharedBy', 'name')
        .populate('customShares.member', 'name')
        .sort(sortField)
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
    const { title, amount, paidBy, payers, date, sharedBy, customShares } = req.body;

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

    // Get current active members
    const activeMembers = await Member.find({ isActive: true });
    const memberCount = activeMembers.length;

    if (memberCount === 0) {
      return res.status(400).json({ message: 'No active members found. Add members first.' });
    }

    // Validation - Custom Shares (per-person cost amounts)
    let validatedCustomShares = null;

    if (customShares && Array.isArray(customShares) && customShares.length > 0) {
      // Validate each custom share
      if (customShares.length > memberCount) {
        return res.status(400).json({
          message: 'Cannot have more custom shares than active members'
        });
      }

      const sharePromises = customShares.map(async (share) => {
        if (!share.member || !share.amount) {
          throw new Error('Each custom share must have member and amount');
        }

        // Validate MongoDB ObjectId format
        if (!share.member.match(/^[0-9a-fA-F]{24}$/)) {
          throw new Error('Invalid member ID format in customShares');
        }

        const shareAmount = parseFloat(share.amount);
        if (isNaN(shareAmount) || shareAmount <= 0) {
          throw new Error('Each custom share amount must be greater than 0');
        }

        // Verify member exists and is active
        const member = await Member.findById(share.member);
        if (!member || !member.isActive) {
          throw new Error(`Member ${share.member} in customShares not found or inactive`);
        }

        return {
          member: share.member,
          amount: Math.round(shareAmount * 100) / 100,
        };
      });

      try {
        validatedCustomShares = await Promise.all(sharePromises);

        // Verify total custom shares equal expense amount
        const totalShares = validatedCustomShares.reduce((sum, s) => sum + s.amount, 0);
        if (Math.abs(totalShares - roundedAmount) > 0.01) {
          return res.status(400).json({
            message: `Total custom shares (${totalShares}) must equal expense amount (${roundedAmount})`
          });
        }

        // Remove duplicates by member ID
        const uniqueMemberIds = new Set();
        validatedCustomShares = validatedCustomShares.filter(share => {
          const memberId = share.member.toString();
          if (uniqueMemberIds.has(memberId)) {
            return false;
          }
          uniqueMemberIds.add(memberId);
          return true;
        });
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    // Validation - Shared By (which members share this expense)
    // Note: If customShares is provided, sharedBy is derived from it
    let validatedSharedBy = [];

    if (validatedCustomShares) {
      // Derive sharedBy from customShares
      validatedSharedBy = validatedCustomShares.map(s => s.member.toString());
    } else if (sharedBy && Array.isArray(sharedBy) && sharedBy.length > 0) {
      // Validate each member in sharedBy
      if (sharedBy.length > memberCount) {
        return res.status(400).json({
          message: 'Cannot have more members sharing than active members'
        });
      }

      // Verify all members exist and are active
      for (const memberId of sharedBy) {
        // Validate MongoDB ObjectId format
        if (!memberId.match(/^[0-9a-fA-F]{24}$/)) {
          return res.status(400).json({ message: 'Invalid member ID format in sharedBy' });
        }

        const member = await Member.findById(memberId);
        if (!member || !member.isActive) {
          return res.status(400).json({
            message: `Member ${memberId} in sharedBy not found or inactive`
          });
        }
      }

      // Remove duplicates
      validatedSharedBy = [...new Set(sharedBy)];

      if (validatedSharedBy.length === 0) {
        return res.status(400).json({ message: 'At least one member must share the expense' });
      }
    } else {
      // Default: all active members share the expense
      validatedSharedBy = activeMembers.map(m => m._id.toString());
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
      sharedBy: validatedSharedBy,
    };

    // Add either payers or paidBy
    if (validatedPayers) {
      expenseData.payers = validatedPayers;
    } else {
      expenseData.paidBy = validatedPaidBy;
    }

    // Add customShares if provided
    if (validatedCustomShares) {
      expenseData.customShares = validatedCustomShares;
    }

    const expense = new Expense(expenseData);
    await expense.save();

    // Populate payers or paidBy, sharedBy, and customShares before sending response
    if (validatedPayers) {
      await expense.populate('payers.member', 'name');
    } else {
      await expense.populate('paidBy', 'name');
    }
    await expense.populate('sharedBy', 'name');
    if (validatedCustomShares) {
      await expense.populate('customShares.member', 'name');
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
