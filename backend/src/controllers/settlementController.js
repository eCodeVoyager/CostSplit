const Settlement = require('../models/Settlement');
const Member = require('../models/Member');

/**
 * Mark a settlement as paid (create a settlement record)
 */
const markSettlementPaid = async (req, res) => {
  try {
    const { from, to, amount, note } = req.body;

    // Validation
    if (!from || !to || !amount) {
      return res.status(400).json({ message: 'From, to, and amount are required' });
    }

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    // Check if members exist
    const fromMember = await Member.findById(from);
    const toMember = await Member.findById(to);

    if (!fromMember || !toMember) {
      return res.status(404).json({ message: 'One or both members not found' });
    }

    if (from === to) {
      return res.status(400).json({ message: 'Cannot create settlement to the same person' });
    }

    // Create settlement
    const settlement = await Settlement.create({
      from,
      to,
      amount: Math.round(parsedAmount * 100) / 100,
      note: note ? note.trim().substring(0, 200) : undefined,
    });

    const populatedSettlement = await Settlement.findById(settlement._id)
      .populate('from', 'name')
      .populate('to', 'name');

    res.status(201).json({
      message: 'Settlement marked as paid',
      settlement: {
        _id: populatedSettlement._id,
        from: populatedSettlement.from.name,
        fromId: populatedSettlement.from._id,
        to: populatedSettlement.to.name,
        toId: populatedSettlement.to._id,
        amount: populatedSettlement.amount,
        paidDate: populatedSettlement.paidDate,
        note: populatedSettlement.note,
      },
    });
  } catch (error) {
    console.error('Mark settlement paid error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get settlement history with optional filters
 */
const getSettlementHistory = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let query = {};

    // Apply time period filter
    if (period) {
      const now = new Date();
      let filterDate = new Date();

      switch (period) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        default:
          filterDate = null;
      }

      if (filterDate) {
        query.paidDate = { $gte: filterDate };
      }
    }

    // Apply custom date range
    if (startDate && endDate) {
      query.paidDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const settlements = await Settlement.find(query)
      .populate('from', 'name')
      .populate('to', 'name')
      .sort({ paidDate: -1 });

    res.status(200).json({
      settlements: settlements.map(s => ({
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
    console.error('Get settlement history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete a settlement
 */
const deleteSettlement = async (req, res) => {
  try {
    const { id } = req.params;

    const settlement = await Settlement.findById(id);

    if (!settlement) {
      return res.status(404).json({ message: 'Settlement not found' });
    }

    await Settlement.findByIdAndDelete(id);

    res.status(200).json({ message: 'Settlement deleted successfully' });
  } catch (error) {
    console.error('Delete settlement error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  markSettlementPaid,
  getSettlementHistory,
  deleteSettlement,
};
