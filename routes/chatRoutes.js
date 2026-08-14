const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const chatController = require('../controllers/chatController');
const safeTradeSpotController = require('../controllers/safeTradeSpotController');

// Specific routes MUST come before parameter routes
router.post('/send', auth, chatController.sendTextMessage);
router.post('/send-media', auth, upload.single('file'), chatController.sendMediaMessage);
router.get('/list', auth, chatController.getUserChats);
router.post('/get-or-create', auth, chatController.getOrCreateChat);

// Safe Trade Spot (before /:chatId)
router.post('/:chatThreadId/safe-trade-spot', auth, safeTradeSpotController.createInvite);
router.get('/:chatThreadId/safe-trade-spot/active', auth, safeTradeSpotController.getActiveForChat);

// Parameter routes LAST
router.put('/seen/:chatId', auth, chatController.markMessagesSeen);
router.get('/:chatId', auth, chatController.getChatMessages);

module.exports = router;
