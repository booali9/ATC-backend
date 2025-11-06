const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const chatController = require('../controllers/chatController');

router.post('/send', auth, chatController.sendTextMessage);
router.post('/send-media', auth, upload.single('file'), chatController.sendMediaMessage);
router.put('/seen/:chatId', auth, chatController.markMessagesSeen);
router.get('/:chatId', auth, chatController.getChatMessages);
router.get('/list', auth, chatController.getUserChats);
router.post('/get-or-create', auth, chatController.getOrCreateChat);

module.exports = router;
