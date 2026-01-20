const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    console.log('🔐 Auth middleware - Token received:', token ? 'yes' : 'no');
    
    if (!token) {
      console.log('❌ Auth middleware - No token provided');
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('🔐 Auth middleware - Token decoded, userId:', decoded.userId);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.log('❌ Auth middleware - User not found for userId:', decoded.userId);
      return res.status(401).json({ error: 'Token is not valid' });
    }

    console.log('✅ Auth middleware - User authenticated:', user.email);
    req.user = user;
    next();
  } catch (error) {
    console.log('❌ Auth middleware - Token verification failed:', error.message);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = auth;