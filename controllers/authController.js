const User = require('../models/User');
const { generateOTP, isOTPExpired } = require('../utils/otpGenerator');
const { sendRegistrationOTP, sendResetPasswordOTP } = require('../utils/emailService');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register - Send OTP
const register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });
    console.log(existingUser)
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User with this email or phone already exists' 
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = new User({
      name,
      email,
      phone,
      password,
      otp: {
        code: otpCode,
        expiresAt: otpExpires
      }
    });

    await user.save();

    // Send OTP via Email
    const emailSent = await sendRegistrationOTP(email, name, otpCode);

    if (!emailSent) {
      // If email fails, delete the user and return error
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({ 
        error: 'Failed to send OTP email. Please try again.' 
      });
    }

    res.status(200).json({
      message: 'OTP sent successfully to your email',
      userId: user._id,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify OTP - UPDATED: Now returns JWT token
const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!user.otp || user.otp.code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (isOTPExpired(user.otp.expiresAt)) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    // Mark user as verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    res.status(200).json({
      message: 'OTP verified successfully',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified
      },
      nextStep: 'complete-profile'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Complete Profile - UPDATED: Uses token from middleware
const completeProfile = async (req, res) => {
  try {
    const { skills, serviceSeeking } = req.body;
    const userId = req.user.id; // From auth middleware
    console.log(userId)

    const user = await User.findById(userId);
    console.log(user)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let profileImage = {};
    
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'user-profiles'
      });

      profileImage = {
        public_id: result.public_id,
        url: result.secure_url
      };
    }

    user.profileImage = profileImage;
    user.skills_offered = typeof skills === 'string' ? skills.split(',') : skills;
    user.skills_wanted = serviceSeeking;

    await user.save();

    // Generate new token with updated user data
    const token = generateToken(user._id);

    res.status(200).json({
      message: 'Profile completed successfully',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        skills: user.skills_offered,
        serviceSeeking: user.skills_wanted,
        isVerified: user.isVerified,
        credits: user.credits
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login - Returns JWT token
const login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    const user = await User.findOne({
      $or: [{ email }, { phone }]
    });
    console.log(user)

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ error: 'Please verify your account first' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      message: 'Login successful',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        skills: user.skills_offered,
        serviceSeeking: user.skills_wanted,
        isVerified: user.isVerified,
        credits: user.credits
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({ 
        message: 'If the email exists, a reset OTP has been sent' 
      });
    }

    const resetOtpCode = generateOTP();
    const resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.resetOtp = {
      code: resetOtpCode,
      expiresAt: resetOtpExpires
    };

    await user.save();

    // Send reset password OTP via Email
    const emailSent = await sendResetPasswordOTP(email, user.name, resetOtpCode);

    if (!emailSent) {
      user.resetOtp = undefined;
      await user.save();
      return res.status(500).json({ 
        error: 'Failed to send reset OTP email. Please try again.' 
      });
    }

    res.status(200).json({
      message: 'Reset OTP sent successfully to your email',
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.resetOtp || user.resetOtp.code !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (isOTPExpired(user.resetOtp.expiresAt)) {
      return res.status(400).json({ error: 'OTP has expired' });
    }

    user.password = newPassword;
    user.resetOtp = undefined;
    await user.save();

    res.status(200).json({ message: 'Password reset successfully' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// OAuth Login - For users authenticated via OAuth providers (Google, Apple, Facebook)
// These users are already verified by the provider
// If user doesn't exist, create them automatically
const oauthLogin = async (req, res) => {
  try {
    const { email, clerkId, provider, name } = req.body;

    console.log(`🔄 OAuth login request:`, { email, clerkId, provider, name: name ? 'provided' : 'missing' });

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Normalize provider name to match enum
    let normalizedProvider = 'oauth';
    if (provider) {
      if (provider.includes('google')) normalizedProvider = 'google';
      else if (provider.includes('apple')) normalizedProvider = 'apple';
      else if (provider.includes('facebook')) normalizedProvider = 'facebook';
      else normalizedProvider = 'oauth';
    }

    // Try to find user by email or clerkId
    let user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        ...(clerkId ? [{ clerkId }] : [])
      ]
    });

    // If user doesn't exist, create them (OAuth registration)
    if (!user) {
      const userName = name || email.split('@')[0];
      console.log(`📝 Creating new OAuth user: ${email} via ${normalizedProvider}, name: ${userName}`);
      
      user = new User({
        name: userName,
        email: email.toLowerCase(),
        clerkId: clerkId || undefined,
        authProvider: normalizedProvider,
        isVerified: true, // OAuth users are pre-verified by the provider
        // No password or phone required for OAuth users
      });
      
      try {
        await user.save();
        console.log(`✅ OAuth user created: ${user._id}`);
      } catch (saveError) {
        console.error(`❌ Error saving new OAuth user:`, saveError.message);
        // If it's a duplicate key error, try to find the existing user
        if (saveError.code === 11000) {
          user = await User.findOne({ email: email.toLowerCase() });
          if (!user) {
            throw new Error('User creation failed due to duplicate key, but user not found');
          }
          console.log(`ℹ️ Found existing user after duplicate error: ${user._id}`);
        } else {
          throw saveError;
        }
      }
    } else {
      console.log(`ℹ️ Found existing OAuth user: ${user._id}`);
      
      // Build update object - only update what's needed
      const updateFields = {};
      
      // Update clerkId if not set
      if (clerkId && !user.clerkId) {
        updateFields.clerkId = clerkId;
      }
      
      // Update auth provider if not set or is 'email' (upgrading from email to OAuth)
      if (normalizedProvider && (!user.authProvider || user.authProvider === 'email')) {
        updateFields.authProvider = normalizedProvider;
      }
      
      // Mark as verified if not already
      if (!user.isVerified) {
        updateFields.isVerified = true;
      }
      
      // Fix missing name if user has no name
      const userName = name || email.split('@')[0];
      if (!user.name) {
        updateFields.name = userName;
        console.log(`ℹ️ Setting missing name for user: ${userName}`);
      }
      
      // Only update if there are changes
      if (Object.keys(updateFields).length > 0) {
        // Use findByIdAndUpdate to avoid full document validation
        user = await User.findByIdAndUpdate(
          user._id,
          { $set: updateFields },
          { new: true, runValidators: false } // Skip validators to avoid issues with legacy data
        );
        console.log(`✅ Updated OAuth user fields:`, Object.keys(updateFields));
      }
    }

    // Generate JWT token
    const token = generateToken(user._id);

    console.log(`✅ OAuth login successful for ${email} via ${normalizedProvider}`);

    res.status(200).json({
      message: 'OAuth login successful',
      token: token,
      user: {
        id: user._id,
        name: user.name || name || email.split('@')[0], // Fallback for response
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        skills: user.skills_offered,
        serviceSeeking: user.skills_wanted,
        isVerified: user.isVerified,
        credits: user.credits
      }
    });

  } catch (error) {
    console.error('OAuth login error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  verifyOtp,
  completeProfile,
  login,
  oauthLogin,
  forgotPassword,
  resetPassword,
  getProfile
};