const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 120, trim: true },
    formattedAddress: { type: String, required: true, maxlength: 300, trim: true },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    placeId: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const proposalHistorySchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    previous: {
      location: locationSchema,
      scheduledDate: String,
      scheduledDay: String,
      scheduledTime: String,
      scheduledAt: Date,
    },
    next: {
      location: locationSchema,
      scheduledDate: String,
      scheduledDay: String,
      scheduledTime: String,
      scheduledAt: Date,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Stable BullMQ job metadata (replaces embedded fire-at pseudo-jobs)
const bullJobSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ['t24h', 'day_morning', 't2h', 'at_event'],
      required: true,
    },
    jobId: { type: String, required: true },
    fireAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'sent', 'cancelled', 'failed'],
      default: 'scheduled',
    },
  },
  { _id: false }
);

const safeTradeSpotSchema = new mongoose.Schema(
  {
    chatThreadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    initiatorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'counter_proposed',
        'locked',
        'completed',
        'cancelled',
        'expired',
      ],
      default: 'pending',
      index: true,
    },
    location: { type: locationSchema, required: true },
    scheduledDate: { type: String, required: true },
    scheduledDay: { type: String, required: true },
    scheduledTime: { type: String, required: true },
    scheduledAt: { type: Date, required: true, index: true },
    timezoneOffsetMinutes: { type: Number, required: true },
    lockedAt: { type: Date, default: null },
    proposalHistory: { type: [proposalHistorySchema], default: [] },
    bullJobs: { type: [bullJobSchema], default: [] },
    // ponytail: retain 90 days after terminal status
  },
  { timestamps: true }
);

safeTradeSpotSchema.index({ chatThreadId: 1, status: 1 });

module.exports = mongoose.model('SafeTradeSpot', safeTradeSpotSchema);
