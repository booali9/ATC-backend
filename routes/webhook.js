const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SubscriptionController = require('../controllers/subscriptionController');

// Webhook endpoint
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await SubscriptionController.handleSubscriptionUpdate(
        event.data.object, 
        event.type
      );
      break;
    case 'customer.subscription.deleted':
      await SubscriptionController.handleSubscriptionUpdate(
        event.data.object,
        event.type
      );
      break;
    case 'invoice.payment_succeeded':
      await SubscriptionController.handleSubscriptionUpdate(
        event.data.object.subscription,
        event.type
      );
      break;
    case 'invoice.payment_failed':
      await SubscriptionController.handleSubscriptionUpdate(
        event.data.object.subscription,
        event.type
      );
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({received: true});
});

module.exports = router;