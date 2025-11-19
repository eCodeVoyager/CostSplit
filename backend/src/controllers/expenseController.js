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

/**
 * Get comprehensive cost analytics and breakdowns
 */
const getCostAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, memberId, limit = 100, page = 1 } = req.query;

    // Build query for date filtering
    let query = {};
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

    // Filter by specific member if provided
    if (memberId) {
      if (!memberId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ message: 'Invalid member ID format' });
      }
    }

    // Get all expenses matching query
    const expenses = await Expense.find(query)
      .populate('paidBy', 'name')
      .populate('payers.member', 'name')
      .populate('sharedBy', 'name')
      .populate('customShares.member', 'name')
      .sort({ date: -1 });

    // Get all active members
    const members = await Member.find({ isActive: true });

    // 1. MEMBER BREAKDOWN - Calculate per member statistics
    const memberBreakdown = {};
    members.forEach(member => {
      memberBreakdown[member._id.toString()] = {
        memberId: member._id,
        memberName: member.name,
        totalPaid: 0,
        totalOwed: 0,
        netBalance: 0,
        expenseCount: 0,
      };
    });

    expenses.forEach(expense => {
      // Calculate total paid by each member
      if (expense.payers && expense.payers.length > 0) {
        // Multi-payer expense
        expense.payers.forEach(payer => {
          const memberId = payer.member._id.toString();
          if (memberBreakdown[memberId]) {
            memberBreakdown[memberId].totalPaid += payer.amount;
          }
        });
      } else if (expense.paidBy) {
        // Single payer expense
        const memberId = expense.paidBy._id.toString();
        if (memberBreakdown[memberId]) {
          memberBreakdown[memberId].totalPaid += expense.amount;
        }
      }

      // Calculate total owed by each member
      if (expense.customShares && expense.customShares.length > 0) {
        // Custom shares - each member owes their specific amount
        expense.customShares.forEach(share => {
          const memberId = share.member._id.toString();
          if (memberBreakdown[memberId]) {
            memberBreakdown[memberId].totalOwed += share.amount;
            memberBreakdown[memberId].expenseCount++;
          }
        });
      } else if (expense.sharedBy && expense.sharedBy.length > 0) {
        // Equal split among sharedBy members
        const sharePerPerson = expense.amount / expense.sharedBy.length;
        expense.sharedBy.forEach(member => {
          const memberId = member._id.toString();
          if (memberBreakdown[memberId]) {
            memberBreakdown[memberId].totalOwed += sharePerPerson;
            memberBreakdown[memberId].expenseCount++;
          }
        });
      }
    });

    // Calculate net balance and round values
    Object.values(memberBreakdown).forEach(member => {
      member.totalPaid = Math.round(member.totalPaid * 100) / 100;
      member.totalOwed = Math.round(member.totalOwed * 100) / 100;
      member.netBalance = Math.round((member.totalPaid - member.totalOwed) * 100) / 100;
    });

    // 2. CATEGORY BREAKDOWN - Group by expense title patterns
    const categoryBreakdown = {
      transportation: { total: 0, count: 0, expenses: [] },
      food: { total: 0, count: 0, expenses: [] },
      shopping: { total: 0, count: 0, expenses: [] },
      bills: { total: 0, count: 0, expenses: [] },
      entertainment: { total: 0, count: 0, expenses: [] },
      other: { total: 0, count: 0, expenses: [] },
    };

    const transportKeywords = ['bus', 'rickshaw', 'cng', 'auto', 'uber', 'pathao', 'taxi', 'transport', 'fare', 'fair'];
    const foodKeywords = ['lunch', 'dinner', 'breakfast', 'snack', 'tea', 'coffee', 'food', 'restaurant', 'meal'];
    const shoppingKeywords = ['shopping', 'shop', 'groceries', 'grocery', 'store'];
    const billKeywords = ['bill', 'utility', 'rent', 'electricity', 'water', 'internet'];
    const entertainmentKeywords = ['movie', 'cinema', 'game', 'entertainment', 'party', 'event'];

    expenses.forEach(expense => {
      const title = expense.title.toLowerCase();
      let category = 'other';

      if (transportKeywords.some(keyword => title.includes(keyword))) {
        category = 'transportation';
      } else if (foodKeywords.some(keyword => title.includes(keyword))) {
        category = 'food';
      } else if (shoppingKeywords.some(keyword => title.includes(keyword))) {
        category = 'shopping';
      } else if (billKeywords.some(keyword => title.includes(keyword))) {
        category = 'bills';
      } else if (entertainmentKeywords.some(keyword => title.includes(keyword))) {
        category = 'entertainment';
      }

      categoryBreakdown[category].total += expense.amount;
      categoryBreakdown[category].count++;
      categoryBreakdown[category].expenses.push({
        id: expense._id,
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
      });
    });

    // Round category totals and limit expenses per category
    Object.keys(categoryBreakdown).forEach(category => {
      categoryBreakdown[category].total = Math.round(categoryBreakdown[category].total * 100) / 100;
      // Keep only top 5 expenses per category for response size
      categoryBreakdown[category].expenses = categoryBreakdown[category].expenses
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    });

    // 3. TIME PERIOD BREAKDOWN - Group by day/week/month
    const dailyBreakdown = {};
    const weeklyBreakdown = {};
    const monthlyBreakdown = {};

    expenses.forEach(expense => {
      const expenseDate = new Date(expense.date);

      // Daily
      const dayKey = expenseDate.toISOString().split('T')[0];
      if (!dailyBreakdown[dayKey]) {
        dailyBreakdown[dayKey] = { date: dayKey, total: 0, count: 0 };
      }
      dailyBreakdown[dayKey].total += expense.amount;
      dailyBreakdown[dayKey].count++;

      // Weekly (ISO week number)
      const weekStart = new Date(expenseDate);
      weekStart.setDate(expenseDate.getDate() - expenseDate.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      if (!weeklyBreakdown[weekKey]) {
        weeklyBreakdown[weekKey] = { weekStart: weekKey, total: 0, count: 0 };
      }
      weeklyBreakdown[weekKey].total += expense.amount;
      weeklyBreakdown[weekKey].count++;

      // Monthly
      const monthKey = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyBreakdown[monthKey]) {
        monthlyBreakdown[monthKey] = { month: monthKey, total: 0, count: 0 };
      }
      monthlyBreakdown[monthKey].total += expense.amount;
      monthlyBreakdown[monthKey].count++;
    });

    // Convert to arrays and round values
    const dailyData = Object.values(dailyBreakdown).map(item => ({
      ...item,
      total: Math.round(item.total * 100) / 100
    })).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30);

    const weeklyData = Object.values(weeklyBreakdown).map(item => ({
      ...item,
      total: Math.round(item.total * 100) / 100
    })).sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart)).slice(0, 12);

    const monthlyData = Object.values(monthlyBreakdown).map(item => ({
      ...item,
      total: Math.round(item.total * 100) / 100
    })).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);

    // 4. TOP EXPENSES
    const topExpenses = expenses
      .map(expense => ({
        id: expense._id,
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
        paidBy: expense.payers && expense.payers.length > 0
          ? expense.payers.map(p => p.member.name).join(', ')
          : expense.paidBy?.name || 'Unknown'
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // 5. RECENT EXPENSES with pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 100, 500);
    const skip = (pageNum - 1) * limitNum;

    const recentExpenses = expenses
      .slice(skip, skip + limitNum)
      .map(expense => ({
        id: expense._id,
        title: expense.title,
        amount: expense.amount,
        date: expense.date,
        paidBy: expense.payers && expense.payers.length > 0
          ? expense.payers.map(p => ({ name: p.member.name, amount: p.amount }))
          : [{ name: expense.paidBy?.name || 'Unknown', amount: expense.amount }],
        sharedBy: expense.sharedBy?.map(m => m.name) || [],
        customShares: expense.customShares?.map(s => ({ name: s.member.name, amount: s.amount })) || null,
      }));

    // 6. SUMMARY STATISTICS
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const avgExpense = expenses.length > 0 ? totalAmount / expenses.length : 0;

    res.status(200).json({
      summary: {
        totalExpenses: expenses.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        averageExpense: Math.round(avgExpense * 100) / 100,
        dateRange: {
          start: startDate || (expenses.length > 0 ? expenses[expenses.length - 1].date : null),
          end: endDate || (expenses.length > 0 ? expenses[0].date : null),
        }
      },
      memberBreakdown: Object.values(memberBreakdown).sort((a, b) => b.totalPaid - a.totalPaid),
      categoryBreakdown,
      timeBreakdown: {
        daily: dailyData,
        weekly: weeklyData,
        monthly: monthlyData,
      },
      topExpenses,
      recentExpenses,
      pagination: {
        total: expenses.length,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(expenses.length / limitNum),
      }
    });
  } catch (error) {
    console.error('Get cost analytics error:', error);
    res.status(500).json({ message: 'Unable to fetch analytics. Please try again.' });
  }
};

module.exports = {
  getAllExpenses,
  createExpense,
  toggleExpenseSettled,
  deleteExpense,
  getExpenseStats,
  getCostAnalytics,
};
