const Member = require('../models/Member');
const Expense = require('../models/Expense');

/**
 * Sanitize string input to prevent XSS
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent basic XSS
    .substring(0, 50); // Limit length
};

/**
 * Get all members
 */
const getAllMembers = async (req, res) => {
  try {
    const members = await Member.find({ isActive: true }).sort({ createdAt: 1 });
    res.status(200).json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ message: 'Unable to fetch members. Please try again.' });
  }
};

/**
 * Create a new member
 */
const createMember = async (req, res) => {
  try {
    const { name } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Member name is required' });
    }

    const sanitizedName = sanitizeInput(name);

    if (sanitizedName.length < 1) {
      return res.status(400).json({ message: 'Member name must be at least 1 character' });
    }

    if (sanitizedName.length > 50) {
      return res.status(400).json({ message: 'Member name cannot exceed 50 characters' });
    }

    // Check for valid characters (alphanumeric and spaces only)
    const nameRegex = /^[a-zA-Z0-9\s\-_]+$/;
    if (!nameRegex.test(sanitizedName)) {
      return res.status(400).json({
        message: 'Member name can only contain letters, numbers, spaces, hyphens, and underscores'
      });
    }

    // Check if member with same name already exists (case-insensitive)
    const existingMember = await Member.findOne({
      name: { $regex: new RegExp(`^${sanitizedName}$`, 'i') },
      isActive: true,
    });

    if (existingMember) {
      return res.status(400).json({ message: 'A member with this name already exists' });
    }

    // Check member limit (prevent abuse)
    const memberCount = await Member.countDocuments({ isActive: true });
    if (memberCount >= 100) {
      return res.status(400).json({ message: 'Maximum member limit (100) reached' });
    }

    const member = new Member({ name: sanitizedName });
    await member.save();

    res.status(201).json(member);
  } catch (error) {
    console.error('Create member error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    res.status(500).json({ message: 'Unable to create member. Please try again.' });
  }
};

/**
 * Delete a member (soft delete)
 */
const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid member ID' });
    }

    const member = await Member.findById(id);

    if (!member || !member.isActive) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Check if member has any expenses
    const expenseCount = await Expense.countDocuments({ paidBy: id });

    if (expenseCount > 0) {
      return res.status(400).json({
        message: `Cannot delete member. This member has ${expenseCount} expense(s) recorded. Please delete those expenses first.`
      });
    }

    // Check if this is the last member
    const activeMemberCount = await Member.countDocuments({ isActive: true });
    if (activeMemberCount <= 1) {
      return res.status(400).json({
        message: 'Cannot delete the last member. At least one member must remain.'
      });
    }

    // Soft delete
    member.isActive = false;
    await member.save();

    res.status(200).json({
      message: 'Member deleted successfully',
      deletedMember: { id: member._id, name: member.name }
    });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ message: 'Unable to delete member. Please try again.' });
  }
};

/**
 * Get member count
 */
const getMemberCount = async (req, res) => {
  try {
    const count = await Member.countDocuments({ isActive: true });
    res.status(200).json({ count });
  } catch (error) {
    console.error('Get member count error:', error);
    res.status(500).json({ message: 'Unable to fetch member count. Please try again.' });
  }
};

module.exports = {
  getAllMembers,
  createMember,
  deleteMember,
  getMemberCount,
};
