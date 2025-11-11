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
  getSkillSuggestions
} = require('../controllers/barterController');

// Friend request routes
router.post('/friend-request', auth, checkSubscriptionForFriendRequest, sendFriendRequest);
router.put('/friend-request/:requestId/accept', auth, acceptFriendRequest);

// Barter routes
router.post('/barter', auth, proposeBarter);
router.put('/barter/:barterId/accept', auth, acceptBarter);
router.put('/barter/complete', auth, completeBarter);

// Skill suggestions
router.get('/suggestions', auth, getSkillSuggestions);

module.exports = router;