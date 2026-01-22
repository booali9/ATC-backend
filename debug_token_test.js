// Simple test to debug JWT token issue
require('dotenv').config();
const jwt = require('jsonwebtoken');

// Test JWT_SECRET from environment
const JWT_SECRET = process.env.JWT_SECRET;
console.log('🔐 JWT_SECRET from env:', JWT_SECRET ? 'configured' : 'NOT CONFIGURED');

if (!JWT_SECRET) {
  console.log('❌ JWT_SECRET not found in environment variables');
  process.exit(1);
}

// Create a test token (similar to what Apple auth creates)
const testUserId = '507f1f77bcf86cd799439011'; // Sample MongoDB ObjectId
const testToken = jwt.sign({ userId: testUserId }, JWT_SECRET, { expiresIn: '30d' });

console.log('🔐 Generated test token:', testToken);

// Try to verify the token
try {
  const decoded = jwt.verify(testToken, JWT_SECRET);
  console.log('✅ Token verified successfully:', decoded);
} catch (error) {
  console.log('❌ Token verification failed:', error.message);
}

// Test with different JWT_SECRET to simulate mismatch
const WRONG_SECRET = 'WRONG_SECRET';
try {
  const decoded = jwt.verify(testToken, WRONG_SECRET);
  console.log('✅ Token verified with wrong secret:', decoded);
} catch (error) {
  console.log('❌ Token verification failed with wrong secret:', error.message);
}