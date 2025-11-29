const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload'); // your multer setup
const { 
  editProfile, 
  getProfile, 
  getUserById, 
  changePassword, 
  logout, 
  deleteAccount, 
  searchUsers, 
  addCredits,
  savePushToken,
  updateNotificationPreferences,
  removePushToken
} = require('../controllers/userController');

// Profile routes
router.get('/profile', auth, getProfile);
router.get('/profile/:userId', auth, getUserById);
router.put('/edit-profile', auth, upload.single('profileImage'), editProfile); // accept single file
router.put('/change-password', auth, changePassword);
router.post('/logout', auth, logout);
router.delete('/delete-account', auth, deleteAccount);

// Search routes
router.get('/search', auth, searchUsers);

// Push notification routes
router.post('/push-token', auth, savePushToken);
router.put('/notification-preferences', auth, updateNotificationPreferences);
router.delete('/push-token', auth, removePushToken);

// Admin routes
router.post('/add-credits', auth, addCredits);

module.exports = router;
