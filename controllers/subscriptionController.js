const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const subscriptionPlans = require("../config/subscriptionPlan");

class SubscriptionController {
  // Create checkout session
  async createCheckoutSession(req, res) {
    try {
      const { plan } = req.body;
      const userId = req.user.id;

      console.log("🛒 Creating checkout session for plan:", plan);

      // Validate plan
      if (!subscriptionPlans[plan]) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid subscription plan. Available plans: basic, standard, premium",
        });
      }

      // Validate FRONTEND_URL
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl || !frontendUrl.startsWith("http")) {
        throw new Error(
          "FRONTEND_URL must be a valid URL with http:// or https://",
        );
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Create or get Stripe customer
      let customerId = user.subscription.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString(),
          },
        });
        customerId = customer.id;

        // Save customer ID to user
        user.subscription.stripeCustomerId = customerId;
        await user.save();
        console.log("✅ Created new Stripe customer:", customerId);
      }

      const selectedPlan = subscriptionPlans[plan];

      // Validate Stripe Price ID
      if (!selectedPlan.stripePriceId) {
        return res.status(500).json({
          success: false,
          message: "Subscription plan not properly configured",
        });
      }

      // Use backend redirect endpoints that will redirect to app deep links
      // This is needed because Stripe only accepts http/https URLs
      // BACKEND_URL should be set to the deployed backend URL like https://king-prawn-app-wksnq.ondigitalocean.app
      const backendUrl =
        process.env.BACKEND_URL ||
        "https://king-prawn-app-wksnq.ondigitalocean.app";
      const successUrl = `${backendUrl}/api/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${backendUrl}/api/subscription/cancel`;

      console.log("🔗 Success URL:", successUrl);
      console.log("🔗 Cancel URL:", cancelUrl);

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: selectedPlan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId.toString(),
          plan: plan,
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            plan: plan,
          },
        },
      });

      console.log("✅ Checkout session created:", session.id);

      res.json({
        success: true,
        message: "Checkout session created successfully",
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (error) {
      console.error("❌ Checkout session error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating checkout session",
        error: error.message,
      });
    }
  }

  // Handle subscription updates from webhooks
  async handleSubscriptionUpdate(event) {
    try {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const eventType = event.type;

      console.log(`🔄 Processing ${eventType} for customer:`, customerId);

      const user = await User.findOne({
        "subscription.stripeCustomerId": customerId,
      });

      if (!user) {
        console.log("❌ User not found for customer:", customerId);
        return;
      }

      const plan = subscription.metadata?.plan || user.subscription.plan;

      switch (eventType) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "invoice.payment_succeeded":
          await this.handleSubscriptionActivation(user, subscription, plan);
          break;

        case "customer.subscription.deleted":
        case "invoice.payment_failed":
          await this.handleSubscriptionDeactivation(user, subscription);
          break;

        default:
          console.log(`ℹ️ Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      console.error("❌ Error handling subscription update:", error);
    }
  }

  // Handle subscription activation
  async handleSubscriptionActivation(user, subscription, plan) {
    const selectedPlan = subscriptionPlans[plan];

    if (!selectedPlan) {
      console.log("❌ Invalid plan for subscription:", plan);
      return;
    }

    console.log(
      `📊 Before activation - Status: ${user.subscription.status}, Credits: ${user.credits}`,
    );

    // Track if subscription was previously inactive
    const wasInactive = user.subscription.status !== "active";

    user.subscription.plan = plan;
    user.subscription.stripeSubscriptionId = subscription.id;
    user.subscription.status = subscription.status;

    // Safely handle date conversion
    if (subscription.current_period_end) {
      user.subscription.currentPeriodEnd = new Date(
        subscription.current_period_end * 1000,
      );
    } else {
      console.log(`⚠️ No current_period_end, using 30 days from now`);
      user.subscription.currentPeriodEnd = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      );
    }

    user.subscription.cancelAtPeriodEnd =
      subscription.cancel_at_period_end || false;

    // Add credits only when subscription becomes active (not already active)
    if (subscription.status === "active" && wasInactive) {
      user.credits += selectedPlan.credits;
      console.log(
        `✅ Added ${selectedPlan.credits} credits to user ${user.email} (status changed to active)`,
      );
      console.log(`📊 New credit balance: ${user.credits}`);
    } else {
      console.log(
        `ℹ️ Credits not modified. Already active or status not active. Current credits: ${user.credits}`,
      );
    }

    await user.save();
    console.log(
      `✅ Subscription updated for user ${user.email}, status: ${subscription.status}`,
    );
  }

  // Handle subscription deactivation
  async handleSubscriptionDeactivation(user, subscription) {
    user.subscription.status = subscription.status;
    user.subscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;

    await user.save();
    console.log(
      `📝 Subscription status updated for user ${user.email}: ${subscription.status}`,
    );
  }

  // Get current subscription status
  async getSubscriptionStatus(req, res) {
    try {
      const user = await User.findById(req.user.id).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if subscription is still active
      let isActive = false;
      if (
        user.subscription.status === "active" &&
        user.subscription.currentPeriodEnd
      ) {
        isActive = new Date() < user.subscription.currentPeriodEnd;
      }

      res.json({
        success: true,
        data: {
          subscription: user.subscription,
          credits: user.credits,
          isActive: isActive,
          hasSubscription: !!user.subscription.plan,
        },
      });
    } catch (error) {
      console.error("❌ Get subscription error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching subscription status",
        error: error.message,
      });
    }
  }

  // Verify and sync subscription from Stripe
  async verifySubscription(req, res) {
    try {
      const user = await User.findById(req.user.id);

      if (!user || !user.subscription.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          message: "No Stripe customer found",
        });
      }

      // Get subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.subscription.stripeCustomerId,
        limit: 1,
      });

      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        const plan = subscription.metadata?.plan || "basic";
        const selectedPlan = subscriptionPlans[plan];

        console.log(
          `🔄 Syncing subscription for user ${user.email}:`,
          subscription.status,
        );
        console.log(
          `📊 Subscription object:`,
          JSON.stringify(subscription, null, 2),
        );
        console.log(`📊 Current user credits: ${user.credits}`);
        console.log(
          `📊 Current subscription status: ${user.subscription.status}`,
        );

        // Track if this is a new subscription or status change
        const wasInactive = user.subscription.status !== "active";
        const isNowActive = subscription.status === "active";

        // Update user with latest subscription info
        user.subscription.plan = plan;
        user.subscription.stripeSubscriptionId = subscription.id;
        user.subscription.status = subscription.status;

        // Safely handle date conversion
        if (subscription.current_period_end) {
          user.subscription.currentPeriodEnd = new Date(
            subscription.current_period_end * 1000,
          );
          console.log(
            `📅 Period end date: ${user.subscription.currentPeriodEnd}`,
          );
        } else {
          console.log(
            `⚠️ No current_period_end in subscription, using 30 days from now`,
          );
          user.subscription.currentPeriodEnd = new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          );
        }

        user.subscription.cancelAtPeriodEnd =
          subscription.cancel_at_period_end || false;

        // Add credits if subscription just became active
        if (isNowActive && wasInactive) {
          user.credits += selectedPlan.credits;
          console.log(
            `✅ Added ${selectedPlan.credits} credits to user ${user.email} (new subscription)`,
          );
          console.log(`📊 New credit balance: ${user.credits}`);
        } else if (isNowActive && user.credits === 0) {
          // Special case: active subscription but 0 credits (webhook might have failed)
          user.credits += selectedPlan.credits;
          console.log(
            `⚠️ CORRECTION: User has active subscription but 0 credits. Adding ${selectedPlan.credits} credits.`,
          );
          console.log(`📊 New credit balance: ${user.credits}`);
        } else if (isNowActive) {
          console.log(
            `ℹ️ Subscription already active, credits not modified. Current: ${user.credits}`,
          );
        }

        await user.save();

        return res.json({
          success: true,
          message: "Subscription verified and synced",
          data: {
            subscription: user.subscription,
            credits: user.credits,
          },
        });
      }

      res.json({
        success: true,
        message: "No active subscription found",
        data: {
          subscription: user.subscription,
          credits: user.credits,
        },
      });
    } catch (error) {
      console.error("❌ Verify subscription error:", error);
      res.status(500).json({
        success: false,
        message: "Error verifying subscription",
        error: error.message,
      });
    }
  }

  // Cancel subscription
  async cancelSubscription(req, res) {
    try {
      const user = await User.findById(req.user.id);

      if (!user || !user.subscription.stripeSubscriptionId) {
        return res.status(400).json({
          success: false,
          message: "No active subscription found",
        });
      }

      // Cancel subscription at period end in Stripe
      const canceledSubscription = await stripe.subscriptions.update(
        user.subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        },
      );

      // Update user subscription status
      user.subscription.cancelAtPeriodEnd = true;
      await user.save();

      res.json({
        success: true,
        message:
          "Subscription will be canceled at the end of the billing period",
        data: {
          subscription: user.subscription,
        },
      });
    } catch (error) {
      console.error("❌ Cancel subscription error:", error);
      res.status(500).json({
        success: false,
        message: "Error canceling subscription",
        error: error.message,
      });
    }
  }

  // Get available plans
  async getSubscriptionPlans(req, res) {
    try {
      const plans = Object.entries(subscriptionPlans).map(([key, plan]) => ({
        id: key,
        name: plan.name,
        price: plan.price / 100, // Convert to dollars
        credits: plan.credits,
        interval: plan.interval,
        description: plan.description,
        stripePriceId: plan.stripePriceId,
      }));

      res.json({
        success: true,
        data: { plans },
      });
    } catch (error) {
      console.error("❌ Get plans error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching subscription plans",
        error: error.message,
      });
    }
  }

  // Use credits
  async useCredits(req, res) {
    try {
      const { amount } = req.body;
      const userId = req.user.id;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid credit amount",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (user.credits < amount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient credits",
        });
      }

      user.credits -= amount;
      await user.save();

      res.json({
        success: true,
        message: `Successfully used ${amount} credits`,
        data: {
          creditsRemaining: user.credits,
          creditsUsed: amount,
        },
      });
    } catch (error) {
      console.error("❌ Use credits error:", error);
      res.status(500).json({
        success: false,
        message: "Error using credits",
        error: error.message,
      });
    }
  }
}

module.exports = new SubscriptionController();
