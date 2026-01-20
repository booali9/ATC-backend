const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const SubscriptionController = require("../controllers/subscriptionController");

// Webhook endpoint
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.log(`Webhook signature verification failed.`, err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`📬 Webhook received: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // For subscription events, pass the full event
        await SubscriptionController.handleSubscriptionUpdate(event);
        break;

      case "invoice.payment_succeeded":
        // For invoice payment succeeded, this is the key event for adding credits
        // Pass the full event so we can handle it properly
        console.log(
          `💰 Invoice payment succeeded for subscription: ${event.data.object.subscription}`,
        );
        await SubscriptionController.handleInvoicePaymentSucceeded(event);
        break;

      case "invoice.payment_failed":
        console.log(
          `❌ Invoice payment failed for subscription: ${event.data.object.subscription}`,
        );
        await SubscriptionController.handleInvoicePaymentFailed(event);
        break;

      case "checkout.session.completed":
        // Handle checkout session completed - this is when user completes payment
        console.log(`✅ Checkout session completed: ${event.data.object.id}`);
        await SubscriptionController.handleCheckoutCompleted(event);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  },
);

// RevenueCat Webhook
router.post('/revenuecat', async (req, res) => {
  await SubscriptionController.handleRevenueCatWebhook(req, res);
});

module.exports = router;
