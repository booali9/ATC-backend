const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔐 Auth middleware - Token received:', token ? 'yes' : 'no');
    console.log('🔐 Auth middleware - Token length:', token ? token.length : 0);
    console.log('🔐 Auth middleware - Token preview:', token ? token.substring(0, 50) + '...' : 'none');
    
    if (!token) {
      console.log('❌ Auth middleware - No token provided');
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    console.log('🔐 Auth middleware - JWT_SECRET configured:', process.env.JWT_SECRET ? 'yes' : 'NO');
    console.log('🔐 Auth middleware - JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 Auth middleware - Token decoded successfully');
    console.log('🔐 Auth middleware - Decoded payload:', JSON.stringify(decoded, null, 2));
    console.log('🔐 Auth middleware - Looking for userId:', decoded.userId);
    console.log('🔐 Auth middleware - UserId type:', typeof decoded.userId);
    
    // Ensure userId is properly formatted for MongoDB lookup
    let userId = decoded.userId;
    if (typeof userId === 'string' && userId.length === 24) {
      // Looks like a valid ObjectId string
      console.log('🔐 Auth middleware - Using userId as ObjectId string');
    } else {
      console.log('🔐 Auth middleware - Invalid userId format:', userId);
    }
    
    const user = await User.findById(userId).select('-password');
    console.log('🔐 Auth middleware - Database query for userId:', userId);
    console.log('🔐 Auth middleware - User found:', user ? 'yes' : 'NO');
    
    if (!user) {
      // Try alternative lookup methods
      console.log('❌ Auth middleware - Trying alternative user lookup...');
      
      try {
        // Try finding by string conversion
        const userByString = await User.findOne({ _id: userId }).select('-password');
        console.log('❌ Auth middleware - User found by string lookup:', userByString ? 'yes' : 'no');
        
        if (userByString) {
          console.log('✅ Auth middleware - Found user with alternative lookup');
          req.user = userByString;
          return next();
        }
      } catch (altError) {
        console.log('❌ Auth middleware - Alternative lookup failed:', altError.message);
      }
    }
    
    if (!user) {
      console.log('❌ Auth middleware - User not found for userId:', decoded.userId);
      console.log('❌ Auth middleware - User search result:', user);
      
      // Try to find user with different query to debug
      try {
        const userCount = await User.countDocuments();
        console.log('❌ Auth middleware - Total users in database:', userCount);
        
        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('_id email createdAt');
        console.log('❌ Auth middleware - Recent users:', recentUsers.map(u => ({ id: u._id.toString(), email: u.email, created: u.createdAt })));
      } catch (debugError) {
        console.log('❌ Auth middleware - Debug query failed:', debugError.message);
      }
      
      return res.status(401).json({ error: 'Token is not valid' });
    }

    console.log('✅ Auth middleware - User found:', user.email, 'ID:', user._id);
    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Auth middleware - Token verification failed:', error.message);
    console.log('❌ Auth middleware - Error type:', error.name);
    console.log('❌ Auth middleware - Full error:', error);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = auth;