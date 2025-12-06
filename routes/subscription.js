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
  const redirectUrl = req.query.redirect_url || "";
  console.log("✅ Payment success redirect, session:", sessionId);
  console.log("🔗 Redirect URL from query:", redirectUrl);

  // Determine the deep link URL
  // If redirect_url is provided, decode and use it; otherwise use default app scheme
  let appDeepLink;
  if (redirectUrl) {
    try {
      appDeepLink = decodeURIComponent(redirectUrl);
      // Append session_id if not already in the URL
      if (!appDeepLink.includes("session_id")) {
        appDeepLink += `?session_id=${sessionId}&status=success`;
      }
    } catch (e) {
      appDeepLink = `atc://subscription/success?session_id=${sessionId}`;
    }
  } else {
    appDeepLink = `atc://subscription/success?session_id=${sessionId}`;
  }

  console.log("🚀 Redirecting to app deep link:", appDeepLink);

  // ALWAYS do HTTP 302 redirect first - this is the most reliable method
  // The browser/WebView will handle the custom scheme redirect
  res.redirect(302, appDeepLink);
});

// Redirect route for cancelled payment - redirects to app deep link
router.get("/cancel", (req, res) => {
  const redirectUrl = req.query.redirect_url || "";
  console.log("❌ Payment cancelled redirect");
  console.log("🔗 Redirect URL from query:", redirectUrl);

  // Determine the deep link URL
  let appDeepLink;
  if (redirectUrl) {
    try {
      appDeepLink = decodeURIComponent(redirectUrl);
      if (!appDeepLink.includes("status")) {
        appDeepLink += `?status=cancelled`;
      }
    } catch (e) {
      appDeepLink = "atc://subscription/cancel?status=cancelled";
    }
  } else {
    appDeepLink = "atc://subscription/cancel?status=cancelled";
  }

  console.log("🚀 Redirecting to app deep link:", appDeepLink);

  // ALWAYS do HTTP 302 redirect - this is the most reliable method
  res.redirect(302, appDeepLink);
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
