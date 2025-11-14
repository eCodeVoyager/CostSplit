const Member = require('../models/Member');

/**
 * Get all members
 */
const getAllMembers = async (req, res) => {
  try {
    const members = await Member.find({ isActive: true }).sort({ createdAt: 1 });
    res.status(200).json(members);
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a new member
 */
const createMember = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Member name is required' });
    }

    // Check if member with same name already exists
    const existingMember = await Member.findOne({
      name: name.trim(),
      isActive: true,
    });

    if (existingMember) {
      return res.status(400).json({ message: 'Member with this name already exists' });
    }

    const member = new Member({ name: name.trim() });
    await member.save();

    res.status(201).json(member);
  } catch (error) {
    console.error('Create member error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete a member (soft delete)
 */
const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    const member = await Member.findById(id);

    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Soft delete
    member.isActive = false;
    await member.save();

    res.status(200).json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete member error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllMembers,
  createMember,
  deleteMember,
  getMemberCount,
};
