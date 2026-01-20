const User = require('../models/User');

// Middleware to check if user can send friend requests (not free trial)
const checkSubscriptionForFriendRequest = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.subscription.plan) {
      return res.status(403).json({
        success: false,
        message: 'Free trial users cannot send friend requests. Please upgrade your subscription.'
      });
    }
    req.user = user; // Attach full user object
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { checkSubscriptionForFriendRequest };