const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Expense title is required'],
      trim: true,
      minlength: [1, 'Title must be at least 1 character'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Paid by member is required'],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    memberCountAtTime: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
expenseSchema.index({ date: -1 });
expenseSchema.index({ paidBy: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
