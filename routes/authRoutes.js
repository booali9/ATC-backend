const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  completeProfile,
  login,
  oauthLogin,
  forgotPassword,
  resetPassword,
  getProfile
} = require('../controllers/authController');

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes
router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/oauth-login', oauthLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/complete-profile', auth, upload.single('profileImage'), completeProfile);
// Protected routes

router.get('/profile', auth, getProfile);

module.exports = router;