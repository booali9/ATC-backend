const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload'); // your multer setup
const { editProfile, getProfile, changePassword, logout, deleteAccount } = require('../controllers/userController');

// Profile routes
router.get('/profile', auth, getProfile);
router.put('/edit-profile', auth, upload.single('profileImage'), editProfile); // accept single file
router.put('/change-password', auth, changePassword);
router.post('/logout', auth, logout);
router.delete('/delete-account', auth, deleteAccount);

module.exports = router;
