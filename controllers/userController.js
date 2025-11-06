const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('../config/cloudinary');

// ✅ Get Profile
exports. getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
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
    if (skills) updates.skills = skills;
    if (serviceSeeking) updates.serviceSeeking = serviceSeeking;
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
