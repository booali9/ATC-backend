const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkSubscriptionForFriendRequest } = require('../middleware/subscription');
const {
  sendFriendRequest,
  acceptFriendRequest,
  proposeBarter,
  acceptBarter,
  completeBarter,
  getSkillSuggestions,
  getActiveTrades,
  getPendingFriendRequests,
  getPendingBarters,
  getAllFriendRequests
} = require('../controllers/barterController');

// Friend request routes
router.get('/friend-requests', auth, getPendingFriendRequests);
router.get('/friend-requests/all', auth, getAllFriendRequests);
router.get('/pending-barters', auth, getPendingBarters);
router.post('/friend-request', auth, checkSubscriptionForFriendRequest, sendFriendRequest);
router.put('/friend-request/:requestId/accept', auth, acceptFriendRequest);

// Get active trades (MUST be before /:barterId routes)
router.get('/trades', auth, getActiveTrades);

// Skill suggestions
router.get('/suggestions', auth, getSkillSuggestions);

// Barter routes
router.post('/barter', auth, proposeBarter);
router.put('/barter/:barterId/accept', auth, acceptBarter);
router.put('/barter/complete', auth, completeBarter);

module.exports = router;