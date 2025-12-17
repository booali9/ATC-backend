const express = require('express');
const router = express.Router();
const { StreamChat } = require('stream-chat');
const auth = require('../middleware/auth');

// Stream credentials - these should be in environment variables
const STREAM_API_KEY = process.env.STREAM_API_KEY || '4nhmrz6pc29u';
const STREAM_API_SECRET = process.env.STREAM_API_SECRET || 'f9etuu3gzf62hvzyrx65j7krhwfgdnvmm2zz7vpbxubg2qn7xjz6wuw5sfgv6prr';

// Initialize Stream client
let serverClient = null;

try {
  serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);
  console.log('✅ Stream Chat client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Stream Chat client:', error);
}

/**
 * @route   POST /api/stream/token
 * @desc    Generate a Stream token for authenticated user
 * @access  Private
 */
router.post('/token', auth, async (req, res) => {
  try {
    if (!serverClient) {
      return res.status(500).json({ 
        success: false, 
        message: 'Stream client not initialized' 
      });
    }

    const userId = req.user.id.toString();
    const userName = req.user.name || 'User';

    // Create token for the user
    const token = serverClient.createToken(userId);

    // Upsert user in Stream (ensures user exists)
    await serverClient.upsertUser({
      id: userId,
      name: userName,
      image: req.user.profileImage || null,
    });

    console.log(`🎫 Generated Stream token for user: ${userId}`);

    res.json({
      success: true,
      token,
      userId,
      apiKey: STREAM_API_KEY,
    });
  } catch (error) {
    console.error('❌ Error generating Stream token:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate Stream token',
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/stream/token
 * @desc    Generate a Stream token for authenticated user (GET version)
 * @access  Private
 */
router.get('/token', auth, async (req, res) => {
  try {
    if (!serverClient) {
      return res.status(500).json({ 
        success: false, 
        message: 'Stream client not initialized' 
      });
    }

    const userId = req.user.id.toString();
    const userName = req.user.name || 'User';

    // Create token for the user
    const token = serverClient.createToken(userId);

    // Upsert user in Stream (ensures user exists)
    await serverClient.upsertUser({
      id: userId,
      name: userName,
      image: req.user.profileImage || null,
    });

    console.log(`🎫 Generated Stream token for user: ${userId}`);

    res.json({
      success: true,
      token,
      userId,
      apiKey: STREAM_API_KEY,
    });
  } catch (error) {
    console.error('❌ Error generating Stream token:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate Stream token',
      error: error.message 
    });
  }
});

module.exports = router;
