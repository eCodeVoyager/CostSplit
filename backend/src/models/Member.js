const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Member name is required'],
      trim: true,
      minlength: [1, 'Name must be at least 1 character'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
memberSchema.index({ name: 1 });
memberSchema.index({ isActive: 1 });

module.exports = mongoose.model('Member', memberSchema);
