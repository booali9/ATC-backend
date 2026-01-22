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
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.log('❌ Auth middleware - User not found for userId:', decoded.userId);
      console.log('❌ Auth middleware - User search result:', user);
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