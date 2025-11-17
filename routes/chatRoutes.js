const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const chatController = require('../controllers/chatController');

// Specific routes MUST come before parameter routes
router.post('/send', auth, chatController.sendTextMessage);
router.post('/send-media', auth, upload.single('file'), chatController.sendMediaMessage);
router.get('/list', auth, chatController.getUserChats);
router.post('/get-or-create', auth, chatController.getOrCreateChat);

// Parameter routes LAST
router.put('/seen/:chatId', auth, chatController.markMessagesSeen);
router.get('/:chatId', auth, chatController.getChatMessages);

module.exports = router;
