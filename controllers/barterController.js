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

    // Create friend request FIRST
    const friendRequest = new FriendRequest({ from: fromUserId, to: toUserId });
    await friendRequest.save();

    // Deduct 100 credits AFTER successful creation
    await User.findByIdAndUpdate(fromUserId, { $inc: { credits: -100 } });
    console.log(`✅ Deducted 100 credits from user ${fromUserId} for friend request to ${toUserId}`);

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

    console.log('🔍 Accept friend request:', { requestId, userId: userId.toString() });

    const friendRequest = await FriendRequest.findById(requestId);
    
    if (!friendRequest) {
      console.log('❌ Friend request not found:', requestId);
      return res.status(404).json({ success: false, message: 'Friend request not found' });
    }

    console.log('📋 Friend request details:', {
      from: friendRequest.from.toString(),
      to: friendRequest.to.toString(),
      status: friendRequest.status,
      currentUser: userId.toString()
    });

    if (friendRequest.to.toString() !== userId.toString()) {
      console.log('❌ User not authorized to accept this request');
      return res.status(403).json({ success: false, message: 'You are not authorized to accept this request' });
    }

    if (friendRequest.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request already processed' });
    }

    // Check if sender has enough credits
    const sender = await User.findById(friendRequest.from);
    if (!sender) {
      return res.status(404).json({ success: false, message: 'Sender not found' });
    }

    console.log('💰 Sender credits:', sender.credits, 'Required: 10');

    if (sender.credits < 10) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot accept: The person who sent this request (${sender.name}) has insufficient credits. They need at least 10 credits.`,
        senderCredits: sender.credits,
        requiredCredits: 10
      });
    }

    // Update friend request status FIRST
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add to friends list
    await User.findByIdAndUpdate(friendRequest.from, { $push: { friends: friendRequest.to } });
    await User.findByIdAndUpdate(friendRequest.to, { $push: { friends: friendRequest.from } });

    // Deduct 10 credits from sender AFTER all updates succeed
    await User.findByIdAndUpdate(friendRequest.from, { $inc: { credits: -10 } });
    console.log(`✅ Deducted 10 credits from user ${friendRequest.from} for accepting friend request`);

    res.json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Propose barter with 10 credit deduction
exports.proposeBarter = async (req, res) => {
  try {
    const { friendRequestId, userId, offered_skill, wanted_skill } = req.body;
    const currentUserId = req.user._id;

    console.log('🔵 Propose Barter Request:', { friendRequestId, userId, offered_skill, wanted_skill, currentUserId });

    let friendRequest;

    // If friendRequestId is provided, use it
    if (friendRequestId) {
      friendRequest = await FriendRequest.findById(friendRequestId);
      console.log('📋 Found friend request by ID:', friendRequest?._id);
    } else if (userId) {
      // If only userId is provided, find the accepted friend request
      friendRequest = await FriendRequest.findOne({
        $or: [
          { from: currentUserId, to: userId },
          { from: userId, to: currentUserId }
        ],
        status: 'accepted'
      });
      console.log('📋 Found friend request by userId:', friendRequest?._id);
    }

    if (!friendRequest || friendRequest.status !== 'accepted') {
      console.log('❌ No accepted friend request found');
      return res.status(400).json({ success: false, message: 'No accepted friend request found. Please send and accept a friend request first.' });
    }

    if (friendRequest.from.toString() !== currentUserId.toString() && friendRequest.to.toString() !== currentUserId.toString()) {
      console.log('❌ Not authorized for this friend request');
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Check if barter already exists
    const existingBarter = await Barter.findOne({ friendRequest: friendRequest._id });
    if (existingBarter) {
      console.log('❌ Barter already exists:', existingBarter._id);
      return res.status(400).json({ success: false, message: 'Barter already proposed for this friend request' });
    }

    // Check credits
    const user = await User.findById(currentUserId);
    if (user.credits < 10) {
      console.log('❌ Insufficient credits:', user.credits);
      return res.status(400).json({ success: false, message: 'Insufficient credits. Need 10 credits to propose barter.' });
    }

    console.log('✅ All validations passed, creating barter...');

    // Create barter FIRST
    const barter = new Barter({
      requester: currentUserId,
      accepter: friendRequest.from.toString() === currentUserId.toString() ? friendRequest.to : friendRequest.from,
      friendRequest: friendRequest._id,
      offered_skill,
      wanted_skill
    });
    await barter.save();

    // Update friend request
    friendRequest.barter_proposed = true;
    await friendRequest.save();

    // Deduct 10 credits AFTER successful creation
    await User.findByIdAndUpdate(currentUserId, { $inc: { credits: -10 } });
    console.log(`✅ Deducted 10 credits from user ${currentUserId} for proposing barter`);

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

    // Update barter status FIRST
    barter.status = 'accepted';
    await barter.save();

    // Deduct 10 credits AFTER successful update
    await User.findByIdAndUpdate(userId, { $inc: { credits: -10 } });
    console.log(`✅ Deducted 10 credits from user ${userId} for accepting barter`);

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

// Get active trades for current user
exports.getActiveTrades = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query; // 'ongoing', 'completed', 'pending'

    console.log('🔍 Fetching trades for user:', userId, 'with status:', status);

    let query = {
      $or: [
        { requester: userId },
        { accepter: userId }
      ]
    };

    // Filter by status if provided
    if (status === 'ongoing') {
      query.status = 'accepted';
    } else if (status === 'completed') {
      query.status = 'completed';
    } else if (status === 'pending') {
      query.status = 'proposed';
    }

    console.log('📋 Query:', JSON.stringify(query));

    const trades = await Barter.find(query)
      .populate({
        path: 'requester',
        select: 'name profileImage rating'
      })
      .populate({
        path: 'accepter',
        select: 'name profileImage rating'
      })
      .sort({ createdAt: -1 });

    console.log('✅ Found trades:', trades.length);

    // Transform data to include otherUser (the user who is not the current user)
    const transformedTrades = trades.map(trade => {
      console.log('🔄 Transforming trade:', {
        id: trade._id,
        requester: trade.requester?._id,
        accepter: trade.accepter?._id,
        currentUser: userId
      });
      
      const otherUser = trade.requester?._id?.toString() === userId.toString() ? trade.accepter : trade.requester;
      
      if (!otherUser) {
        console.log('⚠️ No other user found for trade:', trade._id);
      }
      
      return {
        _id: trade._id,
        offered_skill: trade.offered_skill,
        wanted_skill: trade.wanted_skill,
        status: trade.status,
        otherUser: otherUser ? {
          _id: otherUser._id,
          name: otherUser.name,
          profileImage: otherUser.profileImage,
          rating: otherUser.rating
        } : null,
        createdAt: trade.createdAt
      };
    });

    res.json({ success: true, trades: transformedTrades });
  } catch (error) {
    console.error('❌ Error in getActiveTrades:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get pending friend requests for current user
exports.getPendingFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const friendRequests = await FriendRequest.find({
      to: userId,
      status: 'pending'
    })
    .populate('from', 'name email profileImage rating')
    .sort({ createdAt: -1 });

    res.json({ success: true, friendRequests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get pending barter proposals for current user
exports.getPendingBarters = async (req, res) => {
  try {
    const userId = req.user._id;

    const barters = await Barter.find({
      accepter: userId,
      status: 'proposed'
    })
    .populate('requester', 'name email profileImage rating')
    .sort({ createdAt: -1 });

    res.json({ success: true, barters });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};