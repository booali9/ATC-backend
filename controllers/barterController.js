const FriendRequest = require("../models/FriendRequest");
const User = require("../models/User");
const Barter = require("../models/Barter");
const {
  sendBarterProposalNotification,
  sendFriendRequestAcceptedNotification,
  sendBarterAcceptedNotification,
} = require("../utils/pushNotifications");

// Send friend request with 10 credit deduction
exports.sendFriendRequest = async (req, res) => {
  try {
    const { toUserId } = req.body;
    const fromUserId = req.user._id;

    // Check if user has subscription or is not on free trial
    if (!req.user.subscription.plan) {
      return res.status(403).json({
        success: false,
        message: "Free trial users cannot send friend requests",
      });
    }

    // Check if user has enough credits
    if (req.user.credits < 10) {
      return res.status(400).json({
        success: false,
        message: "Insufficient credits. Need 10 credits to send friend request",
      });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { from: fromUserId, to: toUserId },
        { from: toUserId, to: fromUserId },
      ],
    });

    if (existingRequest) {
      return res
        .status(400)
        .json({ success: false, message: "Friend request already exists" });
    }

    // Create friend request FIRST
    const friendRequest = new FriendRequest({ from: fromUserId, to: toUserId });
    await friendRequest.save();

    // Deduct 10 credits AFTER successful creation
    await User.findByIdAndUpdate(fromUserId, { $inc: { credits: -10 } });
    console.log(
      `✅ Deducted 10 credits from user ${fromUserId} for friend request to ${toUserId}`,
    );

    res.json({
      success: true,
      message: "Friend request sent successfully",
      friendRequest,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Accept friend request with 10 credit deduction
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    console.log("🔍 Accept friend request:", {
      requestId,
      userId: userId.toString(),
    });

    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      console.log("❌ Friend request not found:", requestId);
      return res
        .status(404)
        .json({ success: false, message: "Friend request not found" });
    }

    console.log("📋 Friend request details:", {
      from: friendRequest.from.toString(),
      to: friendRequest.to.toString(),
      status: friendRequest.status,
      currentUser: userId.toString(),
    });

    if (friendRequest.to.toString() !== userId.toString()) {
      console.log("❌ User not authorized to accept this request");
      return res.status(403).json({
        success: false,
        message: "You are not authorized to accept this request",
      });
    }

    if (friendRequest.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "Request already processed" });
    }

    // Check if sender has enough credits
    const sender = await User.findById(friendRequest.from);
    if (!sender) {
      return res
        .status(404)
        .json({ success: false, message: "Sender not found" });
    }

    console.log("💰 Sender credits:", sender.credits, "Required: 10");

    if (sender.credits < 10) {
      return res.status(400).json({
        success: false,
        message: `Cannot accept: The person who sent this request (${sender.name}) has insufficient credits. They need at least 10 credits.`,
        senderCredits: sender.credits,
        requiredCredits: 10,
      });
    }

    // Update friend request status FIRST
    friendRequest.status = "accepted";
    await friendRequest.save();

    // Add to friends list
    await User.findByIdAndUpdate(friendRequest.from, {
      $push: { friends: friendRequest.to },
    });
    await User.findByIdAndUpdate(friendRequest.to, {
      $push: { friends: friendRequest.from },
    });

    // Deduct 10 credits from sender AFTER all updates succeed
    await User.findByIdAndUpdate(friendRequest.from, {
      $inc: { credits: -10 },
    });
    console.log(
      `✅ Deducted 10 credits from user ${friendRequest.from} for accepting friend request`,
    );

    // Send push notification to the original sender
    const accepter = await User.findById(userId);
    sendFriendRequestAcceptedNotification(
      friendRequest.from.toString(),
      accepter.name,
    );

    res.json({ success: true, message: "Friend request accepted" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Propose barter with 10 credit deduction
exports.proposeBarter = async (req, res) => {
  try {
    const { friendRequestId, userId, offered_skill, wanted_skill } = req.body;
    const currentUserId = req.user._id;

    console.log("🔵 Propose Barter Request:", {
      friendRequestId,
      userId,
      offered_skill,
      wanted_skill,
      currentUserId,
    });

    let friendRequest;

    // If friendRequestId is provided, use it
    if (friendRequestId) {
      friendRequest = await FriendRequest.findById(friendRequestId);
      console.log("📋 Found friend request by ID:", friendRequest?._id);
    } else if (userId) {
      // If only userId is provided, find the accepted friend request
      friendRequest = await FriendRequest.findOne({
        $or: [
          { from: currentUserId, to: userId },
          { from: userId, to: currentUserId },
        ],
        status: "accepted",
      });
      console.log("📋 Found friend request by userId:", friendRequest?._id);
    }

    if (!friendRequest || friendRequest.status !== "accepted") {
      console.log("❌ No accepted friend request found");
      return res.status(400).json({
        success: false,
        message:
          "No accepted friend request found. Please send and accept a friend request first.",
      });
    }

    if (
      friendRequest.from.toString() !== currentUserId.toString() &&
      friendRequest.to.toString() !== currentUserId.toString()
    ) {
      console.log("❌ Not authorized for this friend request");
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    // Check if barter already exists
    const existingBarter = await Barter.findOne({
      friendRequest: friendRequest._id,
    });
    if (existingBarter) {
      console.log("❌ Barter already exists:", existingBarter._id);
      return res.status(400).json({
        success: false,
        message: "Barter already proposed for this friend request",
      });
    }

    // Check credits
    const user = await User.findById(currentUserId);
    if (user.credits < 10) {
      console.log("❌ Insufficient credits:", user.credits);
      return res.status(400).json({
        success: false,
        message: "Insufficient credits. Need 10 credits to propose barter.",
      });
    }

    console.log("✅ All validations passed, creating barter...");

    // Create barter FIRST
    const barter = new Barter({
      requester: currentUserId,
      accepter:
        friendRequest.from.toString() === currentUserId.toString()
          ? friendRequest.to
          : friendRequest.from,
      friendRequest: friendRequest._id,
      offered_skill,
      wanted_skill,
    });
    await barter.save();

    // Update friend request
    friendRequest.barter_proposed = true;
    await friendRequest.save();

    // Deduct 10 credits AFTER successful creation
    await User.findByIdAndUpdate(currentUserId, { $inc: { credits: -10 } });
    console.log(
      `✅ Deducted 10 credits from user ${currentUserId} for proposing barter`,
    );

    // Send push notification to the accepter (target user)
    const proposer = await User.findById(currentUserId);
    const targetUserId =
      friendRequest.from.toString() === currentUserId.toString()
        ? friendRequest.to.toString()
        : friendRequest.from.toString();
    sendBarterProposalNotification(targetUserId, proposer.name, offered_skill);

    res.json({
      success: true,
      message: "Barter proposed successfully",
      barter,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Accept barter with 10 credit deduction and enable messaging
exports.acceptBarter = async (req, res) => {
  try {
    const { barterId } = req.params;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId);
    if (!barter || barter.accepter.toString() !== userId.toString()) {
      return res
        .status(404)
        .json({ success: false, message: "Barter not found" });
    }

    if (barter.status !== "proposed") {
      return res
        .status(400)
        .json({ success: false, message: "Barter already processed" });
    }

    // Check credits
    const user = await User.findById(userId);
    if (user.credits < 10) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient credits" });
    }

    // Update barter status FIRST
    barter.status = "accepted";
    await barter.save();

    // Deduct 10 credits AFTER successful update
    await User.findByIdAndUpdate(userId, { $inc: { credits: -10 } });
    console.log(
      `✅ Deducted 10 credits from user ${userId} for accepting barter`,
    );

    // Send push notification to the proposer
    const accepter = await User.findById(userId);
    sendBarterAcceptedNotification(
      barter.requester.toString(),
      accepter.name,
      barterId,
    );

    res.json({
      success: true,
      message: "Barter accepted. You can now message each other.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Complete barter and add reviews
exports.completeBarter = async (req, res) => {
  try {
    const { barterId, rating, comment } = req.body;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId);
    if (!barter) {
      return res
        .status(404)
        .json({ success: false, message: "Barter not found" });
    }

    if (
      barter.requester.toString() !== userId.toString() &&
      barter.accepter.toString() !== userId.toString()
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    if (barter.status !== "accepted") {
      return res
        .status(400)
        .json({ success: false, message: "Barter not active" });
    }

    // Add review
    if (barter.requester.toString() === userId.toString()) {
      barter.requester_review = { rating, comment };
    } else {
      barter.accepter_review = { rating, comment };
    }

    barter.status = "completed";
    barter.completed_at = new Date();
    await barter.save();

    res.json({ success: true, message: "Barter completed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
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
      skills_offered: { $in: user.skills_wanted },
    }).select("name profileImage skills_offered skills_wanted");

    res.json({ success: true, suggestions });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get active trades for current user
exports.getActiveTrades = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query; // 'ongoing', 'completed', 'pending'

    console.log("🔍 Fetching trades for user:", userId, "with status:", status);

    let query = {
      $or: [{ requester: userId }, { accepter: userId }],
    };

    // Filter by status if provided
    if (status === "ongoing") {
      query.status = "accepted";
    } else if (status === "completed") {
      query.status = "completed";
    } else if (status === "pending") {
      query.status = "proposed";
    }

    console.log("📋 Query:", JSON.stringify(query));

    const trades = await Barter.find(query)
      .populate({
        path: "requester",
        select: "name profileImage",
      })
      .populate({
        path: "accepter",
        select: "name profileImage",
      })
      .sort({ createdAt: -1 });

    console.log("✅ Found trades:", trades.length);

    // Transform data to include otherUser (the user who is not the current user)
    const transformedTrades = await Promise.all(
      trades.map(async (trade) => {
        console.log("🔄 Transforming trade:", {
          id: trade._id,
          requester: trade.requester?._id,
          accepter: trade.accepter?._id,
          currentUser: userId,
        });

        const otherUser =
          trade.requester?._id?.toString() === userId.toString()
            ? trade.accepter
            : trade.requester;

        if (!otherUser) {
          console.log("⚠️ No other user found for trade:", trade._id);
          return {
            _id: trade._id,
            offered_skill: trade.offered_skill,
            wanted_skill: trade.wanted_skill,
            status: trade.status,
            otherUser: null,
            createdAt: trade.createdAt,
          };
        }

        // Calculate rating and review count for the other user
        const completedBarters = await Barter.find({
          status: "completed",
          $or: [{ requester: otherUser._id }, { accepter: otherUser._id }],
        });

        let totalRating = 0;
        let reviewCount = 0;

        completedBarters.forEach((completedBarter) => {
          let review = null;
          if (
            completedBarter.requester.toString() === otherUser._id.toString()
          ) {
            review = completedBarter.accepter_review;
          } else {
            review = completedBarter.requester_review;
          }

          if (review && review.rating) {
            totalRating += review.rating;
            reviewCount++;
          }
        });

        const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

        return {
          _id: trade._id,
          offered_skill: trade.offered_skill,
          wanted_skill: trade.wanted_skill,
          status: trade.status,
          otherUser: {
            _id: otherUser._id,
            name: otherUser.name,
            profileImage: otherUser.profileImage,
            rating: averageRating,
          },
          createdAt: trade.createdAt,
        };
      }),
    );

    res.json({ success: true, trades: transformedTrades });
  } catch (error) {
    console.error("❌ Error in getActiveTrades:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get pending friend requests for current user
exports.getPendingFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    const friendRequests = await FriendRequest.find({
      to: userId,
      status: "pending",
    })
      .populate("from", "name email profileImage")
      .sort({ createdAt: -1 });

    // Calculate rating for each sender
    const friendRequestsWithRatings = await Promise.all(
      friendRequests.map(async (request) => {
        const completedBarters = await Barter.find({
          status: "completed",
          $or: [
            { requester: request.from._id },
            { accepter: request.from._id },
          ],
        });

        let totalRating = 0;
        let reviewCount = 0;

        completedBarters.forEach((barter) => {
          let review = null;
          if (barter.requester.toString() === request.from._id.toString()) {
            review = barter.accepter_review;
          } else {
            review = barter.requester_review;
          }

          if (review && review.rating) {
            totalRating += review.rating;
            reviewCount++;
          }
        });

        const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

        return {
          ...request.toObject(),
          from: {
            ...request.from.toObject(),
            rating: averageRating,
          },
        };
      }),
    );

    res.json({ success: true, friendRequests: friendRequestsWithRatings });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get all friend requests (sent and received) for current user
exports.getAllFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get requests sent TO current user
    const receivedRequests = await FriendRequest.find({
      to: userId,
      status: "pending",
    })
      .populate("from", "name email profileImage")
      .populate("to", "name email profileImage")
      .sort({ createdAt: -1 });

    // Get requests sent BY current user
    const sentRequests = await FriendRequest.find({
      from: userId,
      status: "pending",
    })
      .populate("from", "name email profileImage")
      .populate("to", "name email profileImage")
      .sort({ createdAt: -1 });

    // Calculate ratings for received requests
    const receivedRequestsWithRatings = await Promise.all(
      receivedRequests.map(async (request) => {
        const completedBarters = await Barter.find({
          status: "completed",
          $or: [
            { requester: request.from._id },
            { accepter: request.from._id },
          ],
        });

        let totalRating = 0;
        let reviewCount = 0;

        completedBarters.forEach((barter) => {
          let review = null;
          if (barter.requester.toString() === request.from._id.toString()) {
            review = barter.accepter_review;
          } else {
            review = barter.requester_review;
          }

          if (review && review.rating) {
            totalRating += review.rating;
            reviewCount++;
          }
        });

        const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

        return {
          ...request.toObject(),
          from: {
            ...request.from.toObject(),
            rating: averageRating,
          },
        };
      }),
    );

    // Calculate ratings for sent requests
    const sentRequestsWithRatings = await Promise.all(
      sentRequests.map(async (request) => {
        const completedBarters = await Barter.find({
          status: "completed",
          $or: [{ requester: request.to._id }, { accepter: request.to._id }],
        });

        let totalRating = 0;
        let reviewCount = 0;

        completedBarters.forEach((barter) => {
          let review = null;
          if (barter.requester.toString() === request.to._id.toString()) {
            review = barter.accepter_review;
          } else {
            review = barter.requester_review;
          }

          if (review && review.rating) {
            totalRating += review.rating;
            reviewCount++;
          }
        });

        const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

        return {
          ...request.toObject(),
          to: {
            ...request.to.toObject(),
            rating: averageRating,
          },
        };
      }),
    );

    res.json({
      success: true,
      receivedRequests: receivedRequestsWithRatings,
      sentRequests: sentRequestsWithRatings,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get pending barter proposals for current user
exports.getPendingBarters = async (req, res) => {
  try {
    const userId = req.user._id;

    const barters = await Barter.find({
      accepter: userId,
      status: "proposed",
    })
      .populate("requester", "name email profileImage")
      .sort({ createdAt: -1 });

    // Calculate rating for each requester
    const bartersWithRatings = await Promise.all(
      barters.map(async (barter) => {
        const completedBarters = await Barter.find({
          status: "completed",
          $or: [
            { requester: barter.requester._id },
            { accepter: barter.requester._id },
          ],
        });

        let totalRating = 0;
        let reviewCount = 0;

        completedBarters.forEach((completedBarter) => {
          let review = null;
          if (
            completedBarter.requester.toString() ===
            barter.requester._id.toString()
          ) {
            review = completedBarter.accepter_review;
          } else {
            review = completedBarter.requester_review;
          }

          if (review && review.rating) {
            totalRating += review.rating;
            reviewCount++;
          }
        });

        const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

        return {
          ...barter.toObject(),
          requester: {
            ...barter.requester.toObject(),
            rating: averageRating,
          },
        };
      }),
    );

    res.json({ success: true, barters: bartersWithRatings });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Get barter by ID
exports.getBarterById = async (req, res) => {
  try {
    const { barterId } = req.params;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId)
      .populate("requester", "name email profileImage")
      .populate("accepter", "name email profileImage");

    if (!barter) {
      return res
        .status(404)
        .json({ success: false, message: "Barter not found" });
    }

    // Check if user is part of this barter
    if (
      barter.requester._id.toString() !== userId.toString() &&
      barter.accepter._id.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this barter",
      });
    }

    // Determine the other user
    const otherUserId =
      barter.requester._id.toString() === userId.toString()
        ? barter.accepter._id
        : barter.requester._id;

    // Calculate rating and review count for the other user
    const completedBarters = await Barter.find({
      status: "completed",
      $or: [{ requester: otherUserId }, { accepter: otherUserId }],
    });

    let totalRating = 0;
    let reviewCount = 0;

    completedBarters.forEach((completedBarter) => {
      let review = null;
      if (completedBarter.requester.toString() === otherUserId.toString()) {
        review = completedBarter.accepter_review;
      } else {
        review = completedBarter.requester_review;
      }

      if (review && review.rating) {
        totalRating += review.rating;
        reviewCount++;
      }
    });

    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    // Get the other user data
    const otherUser =
      barter.requester._id.toString() === userId.toString()
        ? barter.accepter
        : barter.requester;

    res.json({
      success: true,
      barter: {
        _id: barter._id,
        offered_skill: barter.offered_skill,
        wanted_skill: barter.wanted_skill,
        status: barter.status,
        requester: barter.requester,
        accepter: barter.accepter,
        otherUser: {
          _id: otherUser._id,
          name: otherUser.name,
          profileImage: otherUser.profileImage,
          rating: averageRating,
          reviewCount: reviewCount,
        },
        createdAt: barter.createdAt,
        completed_at: barter.completed_at,
        requester_review: barter.requester_review,
        accepter_review: barter.accepter_review,
      },
    });
  } catch (error) {
    console.error("❌ Error in getBarterById:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

// Cancel barter
exports.cancelBarter = async (req, res) => {
  try {
    const { barterId } = req.params;
    const userId = req.user._id;

    const barter = await Barter.findById(barterId);

    if (!barter) {
      return res
        .status(404)
        .json({ success: false, message: "Barter not found" });
    }

    // Check if user is part of this barter
    if (
      barter.requester.toString() !== userId.toString() &&
      barter.accepter.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this barter",
      });
    }

    // Only allow canceling proposed or accepted barters
    if (barter.status === "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Cannot cancel a completed barter" });
    }

    if (barter.status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Barter is already cancelled" });
    }

    barter.status = "cancelled";
    await barter.save();

    res.json({ success: true, message: "Barter cancelled successfully" });
  } catch (error) {
    console.error("❌ Error in cancelBarter:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
