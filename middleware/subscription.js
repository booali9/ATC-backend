const User = require('../models/User');

// Middleware to check if user can send friend requests (needs sufficient credits)
const checkSubscriptionForFriendRequest = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Check if user has enough credits (10 required for friend request)
    if (!user.credits || user.credits < 10) {
      return res.status(403).json({
        success: false,
        message: `Insufficient credits. You need 10 credits to send a friend request. You currently have ${user.credits || 0} credits.`
      });
    }
    
    req.user = user; // Attach full user object
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { checkSubscriptionForFriendRequest };