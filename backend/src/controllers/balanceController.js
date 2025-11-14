const Member = require('../models/Member');
const Expense = require('../models/Expense');
const { calculateBalances, generateSettlements } = require('../utils/balanceCalculator');

/**
 * Get balances and settlements
 */
const getBalances = async (req, res) => {
  try {
    // Get all active members
    const members = await Member.find({ isActive: true });

    if (members.length === 0) {
      return res.status(200).json({
        balances: [],
        settlements: [],
        message: 'No active members found',
      });
    }

    // Get all expenses with populated paidBy
    const expenses = await Expense.find().populate('paidBy', 'name');

    // Calculate balances
    const balances = calculateBalances(members, expenses);

    // Generate settlements
    const settlements = generateSettlements(balances);

    res.status(200).json({
      balances,
      settlements,
    });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getBalances,
};
