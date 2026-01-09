const appleSignin = require('apple-signin-auth');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

// Apple Sign In Configuration
const APPLE_CONFIG = {
  clientId: process.env.APPLE_CLIENT_ID || 'com.booali.Atc', // Your app's bundle ID
  teamId: process.env.APPLE_TEAM_ID || '7M383KT75Y',
  keyId: process.env.APPLE_KEY_ID || '324VFURHZ5',
  // The private key should be stored in environment variable
  privateKey: process.env.APPLE_PRIVATE_KEY,
};

// Generate JWT Token for our app
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

/**
 * Generate the client secret for Apple Sign In
 * This is required when verifying authorization codes
 */
const generateAppleClientSecret = () => {
  const privateKey = APPLE_CONFIG.privateKey;
  
  if (!privateKey) {
    throw new Error('Apple private key not configured');
  }

  // Format the private key if needed (replace escaped newlines)
  const formattedKey = privateKey.replace(/\\n/g, '\n');

  const token = jwt.sign({}, formattedKey, {
    algorithm: 'ES256',
    expiresIn: '180d',
    audience: 'https://appleid.apple.com',
    issuer: APPLE_CONFIG.teamId,
    subject: APPLE_CONFIG.clientId,
    keyid: APPLE_CONFIG.keyId,
  });

  return token;
};

/**
 * Handle Apple Sign In
 * Verifies the identity token from Apple and creates/logs in the user
 */
const appleSignIn = async (req, res) => {
  try {
    const { identityToken, authorizationCode, user: appleUserId, email, fullName, nonce } = req.body;

    console.log('🍎 Apple Sign In request received:', {
      hasIdentityToken: !!identityToken,
      hasAuthCode: !!authorizationCode,
      appleUserId,
      hasEmail: !!email,
      hasFullName: !!fullName,
      hasNonce: !!nonce,
    });

    if (!identityToken || !appleUserId) {
      return res.status(400).json({ 
        error: 'Identity token and Apple user ID are required' 
      });
    }

    // Verify the identity token from Apple
    let verifiedToken;
    try {
      console.log('🔐 Verifying with clientId:', APPLE_CONFIG.clientId);
      console.log('🔐 Nonce received:', nonce ? 'yes' : 'no');
      
      // First try without nonce verification (for debugging)
      verifiedToken = await appleSignin.verifyIdToken(identityToken, {
        audience: APPLE_CONFIG.clientId,
        ignoreExpiration: false,
      });

      console.log('✅ Apple identity token verified:', {
        sub: verifiedToken.sub,
        email: verifiedToken.email,
        email_verified: verifiedToken.email_verified,
      });
    } catch (verifyError) {
      console.error('❌ Apple token verification failed:', verifyError.message);
      console.error('❌ Full error:', verifyError);
      return res.status(401).json({ 
        error: 'Invalid Apple identity token',
        details: verifyError.message 
      });
    }

    // The 'sub' claim is Apple's unique identifier for the user
    const appleUserIdentifier = verifiedToken.sub;
    
    // Email from token (most reliable) or from request
    const userEmail = verifiedToken.email || email;
    const userName = fullName || 'Apple User';

    if (!userEmail) {
      // This can happen if user has hidden their email and this isn't the first sign-in
      // Try to find user by Apple ID
      const existingUserByAppleId = await User.findOne({ appleUserId: appleUserIdentifier });
      
      if (!existingUserByAppleId) {
        return res.status(400).json({ 
          error: 'Email is required for first-time Apple Sign In. Please try again or use a different sign-in method.' 
        });
      }
    }

    // Check if user already exists by Apple User ID
    let user = await User.findOne({ appleUserId: appleUserIdentifier });
    let isNewUser = false;

    if (!user && userEmail) {
      // Check if user exists by email
      user = await User.findOne({ email: userEmail });
      
      if (user) {
        // Link Apple ID to existing user
        user.appleUserId = appleUserIdentifier;
        user.isVerified = true;
        await user.save();
        console.log('🔗 Linked Apple ID to existing user:', userEmail);
      }
    }

    if (!user) {
      // Create new user
      const uniquePhone = `apple_${appleUserIdentifier.slice(-10)}`;
      
      user = new User({
        name: userName,
        email: userEmail,
        phone: uniquePhone,
        password: `apple_oauth_${crypto.randomBytes(16).toString('hex')}`,
        appleUserId: appleUserIdentifier,
        isVerified: true, // OAuth users are automatically verified
        authProvider: 'apple',
      });

      await user.save();
      isNewUser = true;
      console.log('✅ New Apple user created:', userEmail);
    }

    // Generate JWT token
    const token = generateToken(user._id);

    console.log(`✅ Apple Sign In successful for ${user.email}`);

    res.status(200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      token: token,
      isNewUser,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        skills: user.skills_offered,
        serviceSeeking: user.skills_wanted,
        isVerified: user.isVerified,
        credits: user.credits,
      },
    });

  } catch (error) {
    console.error('🍎 Apple Sign In error:', error);
    res.status(500).json({ 
      error: 'Apple Sign In failed',
      details: error.message 
    });
  }
};

/**
 * Verify Apple authorization code and exchange for tokens
 * This is useful for server-to-server communication
 */
const verifyAppleAuthCode = async (req, res) => {
  try {
    const { authorizationCode, redirectUri } = req.body;

    if (!authorizationCode) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const clientSecret = generateAppleClientSecret();

    const tokenResponse = await appleSignin.getAuthorizationToken(authorizationCode, {
      clientId: APPLE_CONFIG.clientId,
      clientSecret: clientSecret,
      redirectUri: redirectUri || 'https://appleid.apple.com/auth/authorize',
    });

    res.status(200).json({
      success: true,
      tokens: tokenResponse,
    });

  } catch (error) {
    console.error('Apple auth code verification error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Revoke Apple tokens (for sign out / account deletion)
 */
const revokeAppleToken = async (req, res) => {
  try {
    const { token, tokenType = 'access_token' } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const clientSecret = generateAppleClientSecret();

    await appleSignin.revokeAuthorizationToken(token, {
      clientId: APPLE_CONFIG.clientId,
      clientSecret: clientSecret,
      tokenTypeHint: tokenType,
    });

    res.status(200).json({
      success: true,
      message: 'Token revoked successfully',
    });

  } catch (error) {
    console.error('Apple token revocation error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  appleSignIn,
  verifyAppleAuthCode,
  revokeAppleToken,
  generateAppleClientSecret,
};
