const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'From member is required'],
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'To member is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Settlement amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    paidDate: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      trim: true,
      maxlength: [200, 'Note cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster queries
settlementSchema.index({ paidDate: -1 });
settlementSchema.index({ from: 1, to: 1 });

module.exports = mongoose.model('Settlement', settlementSchema);
