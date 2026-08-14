const mongoose = require('mongoose');

const trustedContactShareSchema = new mongoose.Schema(
  {
    safeTradeSpotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SafeTradeSpot',
      required: true,
      index: true,
    },
    sharedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    relationship: { type: String, required: true, trim: true, maxlength: 80 },
    snapshotDate: { type: String, required: true },
    snapshotDay: { type: String, required: true },
    snapshotTime: { type: String, required: true },
    snapshotLocation: {
      name: { type: String, required: true },
      formattedAddress: { type: String, required: true },
      lat: Number,
      lng: Number,
    },
    emailSentAt: { type: Date, default: null },
    emailStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TrustedContactShare', trustedContactShareSchema);
