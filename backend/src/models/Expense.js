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
    // Single payer (for backward compatibility)
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: function() {
        return !this.payers || this.payers.length === 0;
      },
    },
    // Multiple payers (when expense is split among multiple people who paid)
    payers: [{
      member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        required: true,
      },
      amount: {
        type: Number,
        required: true,
        min: [0.01, 'Payer amount must be greater than 0'],
      },
    }],
    date: {
      type: Date,
      default: Date.now,
    },
    memberCountAtTime: {
      type: Number,
      required: true,
    },
    // Settlement tracking
    settled: {
      type: Boolean,
      default: false,
    },
    settledDate: {
      type: Date,
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
