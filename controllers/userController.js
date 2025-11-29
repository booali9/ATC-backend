const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('../config/cloudinary');

// ✅ Get Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ Get Another User's Profile by ID
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ Edit Profile
exports.editProfile = async (req, res) => {
  try {
    const { name, phone, skills, serviceSeeking } = req.body;
    let profileImage = undefined;

    // If file is sent in multipart/form-data
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'profile_images',
        width: 500,
        crop: 'scale',
      });
      profileImage = {
        public_id: result.public_id,
        url: result.secure_url,
      };
    }

    // Build update object
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (skills) updates.skills_offered = Array.isArray(skills) ? skills : [skills];
    if (serviceSeeking) updates.skills_wanted = serviceSeeking;
    if (profileImage) updates.profileImage = profileImage;

    const updatedUser = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    res.json({ success: true, message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating profile', error: error.message });
  }
};

// ✅ Change Password (after verifying old password)
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Please provide both old and new passwords' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Old password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error changing password', error: error.message });
  }
};

// ✅ Logout (client should remove token)
exports.logout = async (req, res) => {
  try {
    // Option 1: Client removes token on logout (stateless JWT)
    res.json({ success: true, message: 'Logged out successfully (remove token on client side)' });

    // Option 2 (Optional): If you use a token blacklist, you can store it in DB or cache
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error logging out', error: error.message });
  }
};

// ✅ Delete Account
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting account', error: error.message });
  }
};

// ✅ Search Users
exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const currentUserId = req.user._id;

    if (!query || query.trim().length === 0) {
      return res.json({ success: true, users: [] });
    }

    // Search by name or email, excluding current user
    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('_id name email profileImage skills_offered skills_wanted rating').limit(20);

    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error searching users', error: error.message });
  }
};

// ✅ Admin: Add credits to user (for refunds/corrections)
exports.addCredits = async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;
    
    if (!userId || !credits) {
      return res.status(400).json({ success: false, message: 'userId and credits are required' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { credits: credits } },
      { new: true }
    ).select('-password');

    console.log(`✅ Added ${credits} credits to user ${user.email}. Reason: ${reason || 'Manual adjustment'}`);

    res.json({ 
      success: true, 
      message: `Successfully added ${credits} credits`,
      user 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// ✅ Save Push Token
exports.savePushToken = async (req, res) => {
  try {
    const { expoPushToken } = req.body;

    if (!expoPushToken) {
      return res.status(400).json({ success: false, message: 'Push token is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { expoPushToken: expoPushToken },
      { new: true }
    ).select('-password');

    console.log(`✅ Push token saved for user ${user.email}`);

    res.json({
      success: true,
      message: 'Push token saved successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error saving push token', error: error.message });
  }
};

// ✅ Update Notification Preferences
exports.updateNotificationPreferences = async (req, res) => {
  try {
    const { email, push, subscriptionReminders } = req.body;

    const updates = {};
    if (typeof email === 'boolean') updates['notificationPreferences.email'] = email;
    if (typeof push === 'boolean') updates['notificationPreferences.push'] = push;
    if (typeof subscriptionReminders === 'boolean') updates['notificationPreferences.subscriptionReminders'] = subscriptionReminders;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Notification preferences updated',
      notificationPreferences: user.notificationPreferences,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating preferences', error: error.message });
  }
};

// ✅ Remove Push Token (on logout)
exports.removePushToken = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { expoPushToken: null });

    res.json({
      success: true,
      message: 'Push token removed successfully',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error removing push token', error: error.message });
  }
};

