const mongoose = require('mongoose');

const barterSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accepter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  friendRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'FriendRequest', required: true },
  offered_skill: { type: String, required: true },
  wanted_skill: { type: String, required: true },
  status: { type: String, enum: ['proposed', 'accepted', 'completed'], default: 'proposed' },
  requester_review: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String
  },
  accepter_review: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String
  },
  completed_at: Date
}, { timestamps: true });

module.exports = mongoose.model('Barter', barterSchema);