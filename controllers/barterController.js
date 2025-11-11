const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const Barter = require('../models/Barter');

// Send friend request with 100 credit deduction
exports.sendFriendRequest = async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user._id;

    // Check if user has subscription or is not on free trial
    if (!req.user.subscription.plan) {
      return res.status(403).json({ success: false, message: 'Free trial users cannot send friend requests' });
    }

    // Check if user has enough credits
    if (req.user.credits < 100) {
      return res.status(400).json({ success: false, message: 'Insufficient credits. Need 100 credits to send friend request' });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { from: fromUserId, to: toUserId },
        { from: toUserId, to: fromUserId }
      ]
    });

    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Friend request already exists' });
    }

    // Deduct 100 credits
    await User.findByIdAndUpdate(fromUserId, { $inc: { credits: -100 } });

    // Create friend request
    const friendRequest = new FriendRequest({ from: fromUserId, to: toUserId });
    await friendRequest.save();

    res.json({ success: true, message: 'Friend request sent successfully', friendRequest });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Accept friend request with 10 credit deduction
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const friendRequest = await FriendRequest.findById(requestId);
    if (!friendRequest || friendRequest.to.toString() !== userId.toString()) {
      return res.status(404).json({ success: false, message: 'Friend request not found' });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already processed' });
    }

    // Check if sender has enough credits
    const sender = await User.findById(friendRequest.from);
    if (sender.credits < 10) {
      return res.status(400).json({ success: false, message: 'Sender has insufficient credits' });
    }

    // Deduct 10 credits from sender
    await User.findByIdAndUpdate(friendRequest.from, { $inc: { credits: -10 } });

    // Update friend request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add to friends list
    await User.findByIdAndUpdate(friendRequest.from, { $push: { friends: friendRequest.to } });
    await User.findByIdAndUpdate(friendRequest.to, { $push: { friends: friendRequest.from } });

    res.json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Propose barter with 10 credit deduction
exports.proposeBarter = async (req, res) => {
  try {
    const { friendRequestId, offered_skill, wanted_skill } = req.body;
    const userId = req.user._id;

    const friendRequest = await FriendRequest.findById(friendRequestId);
    if (!friendRequest || friendRequest.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Invalid friend request' });
    }

    if (friendRequest.from.toString() !== userId.toString() && friendRequest.to.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Check if barter already exists
    const existingBarter = await Barter.findOne({ friendRequest: friendRequestId });
    if (existingBarter) {
      return res.status(400).json({ success: false, message: 'Barter already proposed' });
    }

    // Check credits
    const user = await User.findById(userId);
    if (user.credits < 10) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct 10 credits
    await User.findByIdAndUpdate(userId, { $inc: { credits: -10 } });

    // Create barter
    const barter = new Barter({
      requester: userId,
      accepter: friendRequest.from.toString() === userId.toString() ? friendRequest.to : friendRequest.from,
      friendRequest: friendRequestId,
      offered_skill,
      wanted_skill
    });
    await barter.save();

    // Update friend request
    friendRequest.barter_proposed = true;
    await friendRequest.save();

    res.json({ success: true, message: 'Barter proposed successfully', barter });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Accept barter with 10 credit deduction and enable messaging
exports.acceptBarter = async (req, res) => {
  try {
    const { barterId } = req.params;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId);
    if (!barter || barter.accepter.toString() !== userId.toString()) {
      return res.status(404).json({ success: false, message: 'Barter not found' });
    }

    if (barter.status !== 'proposed') {
      return res.status(400).json({ success: false, message: 'Barter already processed' });
    }

    // Check credits
    const user = await User.findById(userId);
    if (user.credits < 10) {
      return res.status(400).json({ success: false, message: 'Insufficient credits' });
    }

    // Deduct 10 credits
    await User.findByIdAndUpdate(userId, { $inc: { credits: -10 } });

    // Update barter status
    barter.status = 'accepted';
    await barter.save();

    res.json({ success: true, message: 'Barter accepted. You can now message each other.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Complete barter and add reviews
exports.completeBarter = async (req, res) => {
  try {
    const { barterId, rating, comment } = req.body;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId);
    if (!barter) {
      return res.status(404).json({ success: false, message: 'Barter not found' });
    }

    if (barter.requester.toString() !== userId.toString() && barter.accepter.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (barter.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Barter not active' });
    }

    // Add review
    if (barter.requester.toString() === userId.toString()) {
      barter.requester_review = { rating, comment };
    } else {
      barter.accepter_review = { rating, comment };
    }

    barter.status = 'completed';
    barter.completed_at = new Date();
    await barter.save();

    res.json({ success: true, message: 'Barter completed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get skill-based suggestions
exports.getSkillSuggestions = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user.skills_wanted || user.skills_wanted.length === 0) {
      return res.json({ success: true, suggestions: [] });
    }

    // Find users who offer skills that this user wants
    const suggestions = await User.find({
      _id: { $ne: userId },
      skills_offered: { $in: user.skills_wanted }
    }).select('name profileImage skills_offered skills_wanted');

    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};