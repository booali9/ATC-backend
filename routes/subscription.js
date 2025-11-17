const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const SubscriptionController = require('../controllers/subscriptionController');

// All routes require authentication
router.use(auth);

// Create checkout session
router.post('/create-checkout-session', SubscriptionController.createCheckoutSession);

// Get subscription status
router.get('/status', SubscriptionController.getSubscriptionStatus);

// Verify subscription from Stripe
router.post('/verify', SubscriptionController.verifySubscription);

// Cancel subscription
router.post('/cancel', SubscriptionController.cancelSubscription);

// Get available plans
router.get('/plans', SubscriptionController.getSubscriptionPlans);

module.exports = router;