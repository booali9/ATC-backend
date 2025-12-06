const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const SubscriptionController = require("../controllers/subscriptionController");

// ============================================
// PUBLIC ROUTES (No authentication required)
// These are used by Stripe to redirect after payment
// ============================================

// Redirect route for successful payment - redirects to app deep link
router.get("/success", (req, res) => {
  const sessionId = req.query.session_id || "";
  console.log("✅ Payment success redirect, session:", sessionId);

  // Send an HTML page that will redirect to the app
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #008C99 0%, #00A8B5 100%);
          color: white;
          text-align: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .icon {
          width: 80px;
          height: 80px;
          background: #10B981;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 40px;
        }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .btn {
          background: #008C99;
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        .loading { margin-top: 20px; color: #008C99; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✓</div>
        <h1>Payment Successful!</h1>
        <p>Your subscription has been activated. Redirecting you back to the app...</p>
        <a href="atc://subscription/success?session_id=${sessionId}" class="btn">Return to App</a>
        <p class="loading">If not redirected automatically, tap the button above.</p>
      </div>
      <script>
        // Try to redirect to app immediately
        setTimeout(function() {
          window.location.href = "atc://subscription/success?session_id=${sessionId}";
        }, 1000);

        // Fallback: try again after 2 seconds
        setTimeout(function() {
          window.location.href = "atc://subscription/success?session_id=${sessionId}";
        }, 2500);
      </script>
    </body>
    </html>
  `);
});

// Redirect route for cancelled payment - redirects to app deep link
router.get("/cancel", (req, res) => {
  console.log("❌ Payment cancelled redirect");

  // Send an HTML page that will redirect to the app
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Cancelled</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #008C99 0%, #00A8B5 100%);
          color: white;
          text-align: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 400px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        .icon {
          width: 80px;
          height: 80px;
          background: #EF4444;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 40px;
        }
        h1 { color: #333; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .btn {
          background: #008C99;
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        .loading { margin-top: 20px; color: #008C99; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✕</div>
        <h1>Payment Cancelled</h1>
        <p>Your payment was not completed. No charges have been made. Redirecting you back to the app...</p>
        <a href="atc://subscription/cancel" class="btn">Return to App</a>
        <p class="loading">If not redirected automatically, tap the button above.</p>
      </div>
      <script>
        // Try to redirect to app immediately
        setTimeout(function() {
          window.location.href = "atc://subscription/cancel";
        }, 1000);

        // Fallback: try again after 2 seconds
        setTimeout(function() {
          window.location.href = "atc://subscription/cancel";
        }, 2500);
      </script>
    </body>
    </html>
  `);
});

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// All routes below require authentication
router.use(auth);

// Create checkout session
router.post(
  "/create-checkout-session",
  SubscriptionController.createCheckoutSession,
);

// Get subscription status
router.get("/status", SubscriptionController.getSubscriptionStatus);

// Verify subscription from Stripe
router.post("/verify", SubscriptionController.verifySubscription);

// Cancel subscription
router.post("/cancel", SubscriptionController.cancelSubscription);

// Get available plans
router.get("/plans", SubscriptionController.getSubscriptionPlans);

module.exports = router;
