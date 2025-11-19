const Member = require('../models/Member');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { calculateBalances, generateSettlements } = require('../utils/balanceCalculator');

/**
 * Get balances and settlements
 */
const getBalances = async (req, res) => {
  try {
    // Get ALL members (including inactive) to ensure balance calculations are accurate
    // Inactive members may have paid for expenses or owe money, so they must be included
    const members = await Member.find();

    if (members.length === 0) {
      return res.status(200).json({
        balances: [],
        settlements: [],
        completedSettlements: [],
        message: 'No members found',
      });
    }

    // Get all expenses with populated paidBy and payers
    const expenses = await Expense.find()
      .populate('paidBy', 'name')
      .populate('payers.member', 'name');

    // Get completed settlements
    const completedSettlements = await Settlement.find()
      .populate('from', 'name')
      .populate('to', 'name')
      .sort({ paidDate: -1 });

    // Calculate balances (excluding settled expenses and accounting for completed settlements)
    const balances = calculateBalances(members, expenses, completedSettlements);

    // Generate pending settlements
    const settlements = generateSettlements(balances);

    res.status(200).json({
      balances,
      settlements,
      completedSettlements: completedSettlements.map(s => ({
        _id: s._id,
        from: s.from.name,
        fromId: s.from._id,
        to: s.to.name,
        toId: s.to._id,
        amount: s.amount,
        paidDate: s.paidDate,
        note: s.note,
      })),
    });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getBalances,
};
