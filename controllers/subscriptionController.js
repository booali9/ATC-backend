const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");
const subscriptionPlans = require("../config/subscriptionPlan");

class SubscriptionController {
  // Create checkout session
  async createCheckoutSession(req, res) {
    try {
      const { plan, successRedirectUrl, cancelRedirectUrl } = req.body;
      const userId = req.user.id;

      console.log("🛒 Creating checkout session for plan:", plan);
      console.log("🔗 Success redirect URL from app:", successRedirectUrl);
      console.log("🔗 Cancel redirect URL from app:", cancelRedirectUrl);

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
      // HARDCODED to production backend URL to ensure it always works
      const backendUrl = "https://king-prawn-app-wksnq.ondigitalocean.app";

      // Include the app's redirect URL as a query parameter so backend can do HTTP 302 redirect
      const encodedSuccessRedirect = successRedirectUrl
        ? encodeURIComponent(successRedirectUrl)
        : "";
      const encodedCancelRedirect = cancelRedirectUrl
        ? encodeURIComponent(cancelRedirectUrl)
        : "";

      const successUrl = `${backendUrl}/api/subscription/success?session_id={CHECKOUT_SESSION_ID}&redirect_url=${encodedSuccessRedirect}`;
      const cancelUrl = `${backendUrl}/api/subscription/cancel?redirect_url=${encodedCancelRedirect}`;

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

  // Handle subscription updates from webhooks (subscription.created, updated, deleted)
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

      const plan =
        subscription.metadata?.plan || user.subscription.plan || "basic";

      switch (eventType) {
        case "customer.subscription.created":
          // New subscription created - credits will be added by invoice.payment_succeeded
          console.log(`📝 New subscription created for ${user.email}`);
          await this.updateSubscriptionInfo(user, subscription, plan);
          break;

        case "customer.subscription.updated":
          // Subscription updated (plan change, renewal, etc.)
          console.log(`📝 Subscription updated for ${user.email}`);
          await this.updateSubscriptionInfo(user, subscription, plan);
          break;

        case "customer.subscription.deleted":
          // Subscription canceled/deleted
          console.log(`📝 Subscription deleted for ${user.email}`);
          await this.handleSubscriptionDeactivation(user, subscription);
          break;

        default:
          console.log(`ℹ️ Unhandled subscription event: ${eventType}`);
      }
    } catch (error) {
      console.error("❌ Error handling subscription update:", error);
    }
  }

  // Handle invoice.payment_succeeded - THIS IS WHERE CREDITS ARE ADDED
  async handleInvoicePaymentSucceeded(event) {
    try {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const subscriptionId = invoice.subscription;

      console.log(`💰 Processing invoice.payment_succeeded`);
      console.log(`📧 Invoice ID: ${invoice.id}`);
      console.log(`👤 Customer ID: ${customerId}`);
      console.log(`📋 Subscription ID: ${subscriptionId}`);

      if (!subscriptionId) {
        console.log("ℹ️ Invoice not related to a subscription, skipping");
        return;
      }

      const user = await User.findOne({
        "subscription.stripeCustomerId": customerId,
      });

      if (!user) {
        console.log("❌ User not found for customer:", customerId);
        return;
      }

      // Get the subscription details from Stripe
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const plan =
        subscription.metadata?.plan || user.subscription?.plan || "basic";
      const selectedPlan = subscriptionPlans[plan];

      if (!selectedPlan) {
        console.log("❌ Invalid plan:", plan);
        return;
      }

      console.log(
        `📊 Before payment - User: ${user.email}, Credits: ${user.credits}, Plan: ${plan}`,
      );

      // Check if this invoice has already been processed
      const invoiceId = invoice.id;
      const currentProcessedInvoices = user.processedInvoices || [];

      if (currentProcessedInvoices.includes(invoiceId)) {
        console.log(
          `⚠️ Invoice ${invoiceId} already processed, skipping credit addition`,
        );
        return;
      }

      // Use findOneAndUpdate to avoid version conflicts
      const creditsToAdd = selectedPlan.credits;

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          processedInvoices: { $ne: invoiceId }, // Double-check not already processed
        },
        {
          $set: {
            "subscription.plan": plan,
            "subscription.stripeSubscriptionId": subscriptionId,
            "subscription.status": subscription.status,
            "subscription.currentPeriodEnd": subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            "subscription.cancelAtPeriodEnd":
              subscription.cancel_at_period_end || false,
          },
          $inc: { credits: creditsToAdd },
          $push: {
            processedInvoices: {
              $each: [invoiceId],
              $slice: -50, // Keep only last 50
            },
          },
        },
        { new: true, runValidators: false },
      );

      if (updatedUser) {
        console.log(
          `✅ Added ${creditsToAdd} credits to ${user.email} for invoice ${invoiceId}`,
        );
        console.log(`📊 New credit balance: ${updatedUser.credits}`);
      } else {
        console.log(`ℹ️ Invoice ${invoiceId} was already processed (race condition prevented)`);
      }
    } catch (error) {
      console.error("❌ Error handling invoice.payment_succeeded:", error);
    }
  }

  // Handle invoice.payment_failed
  async handleInvoicePaymentFailed(event) {
    try {
      const invoice = event.data.object;
      const customerId = invoice.customer;

      console.log(
        `❌ Processing invoice.payment_failed for customer:`,
        customerId,
      );

      const user = await User.findOne({
        "subscription.stripeCustomerId": customerId,
      });

      if (!user) {
        console.log("❌ User not found for customer:", customerId);
        return;
      }

      // We don't deactivate immediately - Stripe will retry the payment
      // The subscription status will be updated via customer.subscription.updated
      console.log(
        `⚠️ Payment failed for ${user.email}, waiting for Stripe retry or subscription update`,
      );
    } catch (error) {
      console.error("❌ Error handling invoice.payment_failed:", error);
    }
  }

  // Handle checkout.session.completed - IMMEDIATE credit addition for new checkouts
  async handleCheckoutCompleted(event) {
    try {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      console.log(`✅ Processing checkout.session.completed`);
      console.log(`📧 Session ID: ${session.id}`);
      console.log(`👤 Customer ID: ${customerId}`);
      console.log(`📋 Subscription ID: ${subscriptionId}`);

      if (!subscriptionId) {
        console.log("ℹ️ Checkout not for a subscription, skipping");
        return;
      }

      let user = await User.findOne({
        "subscription.stripeCustomerId": customerId,
      });

      if (!user) {
        // Try to find by userId in metadata
        const userId = session.metadata?.userId;
        if (userId) {
          // Use findByIdAndUpdate to set the customer ID atomically
          user = await User.findByIdAndUpdate(
            userId,
            { $set: { "subscription.stripeCustomerId": customerId } },
            { new: true, runValidators: false },
          );
          if (user) {
            console.log(`✅ Found user by metadata userId: ${userId}`);
          }
        }
        if (!user) {
          console.log("❌ User not found for customer:", customerId);
          return;
        }
      }

      await this.processCheckoutForUser(user, session, subscriptionId);
    } catch (error) {
      console.error("❌ Error handling checkout.session.completed:", error);
    }
  }

  async processCheckoutForUser(user, session, subscriptionId) {
    const plan = session.metadata?.plan || user.subscription?.plan || "basic";
    const selectedPlan = subscriptionPlans[plan];

    if (!selectedPlan) {
      console.log("❌ Invalid plan:", plan);
      return;
    }

    console.log(`📊 Processing checkout for ${user.email}, Plan: ${plan}`);

    // Get the subscription from Stripe for the latest info
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Check if this session has already been processed
    const sessionId = session.id;
    const currentProcessedSessions = user.processedCheckoutSessions || [];

    if (currentProcessedSessions.includes(sessionId)) {
      console.log(
        `⚠️ Checkout session ${sessionId} already processed, skipping`,
      );
      return;
    }

    // Use findOneAndUpdate to avoid version conflicts
    const creditsToAdd = selectedPlan.credits;

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        processedCheckoutSessions: { $ne: sessionId }, // Double-check not already processed
      },
      {
        $set: {
          "subscription.plan": plan,
          "subscription.stripeSubscriptionId": subscriptionId,
          "subscription.status": subscription.status,
          "subscription.currentPeriodEnd": subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          "subscription.cancelAtPeriodEnd":
            subscription.cancel_at_period_end || false,
        },
        $inc: { credits: creditsToAdd },
        $push: {
          processedCheckoutSessions: {
            $each: [sessionId],
            $slice: -20, // Keep only last 20
          },
        },
      },
      { new: true, runValidators: false },
    );

    if (updatedUser) {
      console.log(
        `✅ Checkout completed: Added ${creditsToAdd} credits to ${user.email}`,
      );
      console.log(`📊 New credit balance: ${updatedUser.credits}`);
    } else {
      console.log(`ℹ️ Session ${sessionId} was already processed (race condition prevented)`);
    }
  }

  // Update subscription info without adding credits
  async updateSubscriptionInfo(user, subscription, plan) {
    // Use findByIdAndUpdate to avoid version conflicts
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          "subscription.plan": plan,
          "subscription.stripeSubscriptionId": subscription.id,
          "subscription.status": subscription.status,
          "subscription.currentPeriodEnd": subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          "subscription.cancelAtPeriodEnd":
            subscription.cancel_at_period_end || false,
        },
      },
      { runValidators: false },
    );
    console.log(
      `✅ Subscription info updated for ${user.email}, status: ${subscription.status}`,
    );
  }

  // Handle subscription deactivation
  async handleSubscriptionDeactivation(user, subscription) {
    // Use findByIdAndUpdate to avoid version conflicts
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          "subscription.status": subscription.status,
          "subscription.cancelAtPeriodEnd": subscription.cancel_at_period_end || false,
        },
      },
      { runValidators: false },
    );
    console.log(
      `📝 Subscription deactivated for user ${user.email}: ${subscription.status}`,
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

      if (!user || !user.subscription?.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          message: "No Stripe customer found",
        });
      }

      // Get subscriptions from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.subscription.stripeCustomerId,
        limit: 1,
        status: "active",
      });

      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        const plan =
          subscription.metadata?.plan || user.subscription?.plan || "basic";
        const selectedPlan = subscriptionPlans[plan];

        console.log(
          `🔄 Verifying subscription for user ${user.email}:`,
          subscription.status,
        );
        console.log(`📊 Current user credits: ${user.credits}`);
        console.log(
          `📊 Current subscription status: ${user.subscription?.status}`,
        );
        console.log(
          `📊 Plan: ${plan}, Credits in plan: ${selectedPlan?.credits}`,
        );

        // Check if this is a different subscription than what we have stored
        const isNewSubscription =
          user.subscription?.stripeSubscriptionId !== subscription.id;
        const wasInactive = user.subscription?.status !== "active";
        const isNowActive = subscription.status === "active";

        // Calculate new credits
        let creditsToAdd = 0;
        const currentProcessedSessions = user.processedCheckoutSessions || [];
        const subscriptionMarker = `sub_${subscription.id}`;

        if (isNewSubscription && isNowActive) {
          if (!currentProcessedSessions.includes(subscriptionMarker)) {
            creditsToAdd = selectedPlan.credits;
            console.log(
              `✅ Will add ${creditsToAdd} credits for new subscription ${subscription.id}`,
            );
          } else {
            console.log(
              `ℹ️ Subscription ${subscription.id} already processed via webhook`,
            );
          }
        } else if (isNowActive && wasInactive) {
          creditsToAdd = selectedPlan.credits;
          console.log(
            `✅ Will add ${creditsToAdd} credits (status changed to active)`,
          );
        } else if (isNowActive && user.credits === 0) {
          creditsToAdd = selectedPlan.credits;
          console.log(
            `⚠️ RECOVERY: Will add ${creditsToAdd} credits (active but had 0)`,
          );
        } else {
          console.log(`ℹ️ Credits not modified. Current: ${user.credits}`);
        }

        // Build update object
        const updateData = {
          "subscription.plan": plan,
          "subscription.stripeSubscriptionId": subscription.id,
          "subscription.status": subscription.status,
          "subscription.currentPeriodEnd": subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          "subscription.cancelAtPeriodEnd":
            subscription.cancel_at_period_end || false,
        };

        // Build the update operation
        const updateOperation = { $set: updateData };

        // Add credits if needed
        if (creditsToAdd > 0) {
          updateOperation.$inc = { credits: creditsToAdd };
          // Add subscription marker to prevent duplicate processing
          updateOperation.$addToSet = {
            processedCheckoutSessions: subscriptionMarker,
          };
        }

        // Use findByIdAndUpdate to avoid version conflicts
        const updatedUser = await User.findByIdAndUpdate(
          req.user.id,
          updateOperation,
          { new: true, runValidators: false },
        );

        console.log(`📊 New credit balance: ${updatedUser.credits}`);

        return res.json({
          success: true,
          message: "Subscription verified and synced",
          data: {
            subscription: updatedUser.subscription,
            credits: updatedUser.credits,
            plan: plan,
            planCredits: selectedPlan?.credits,
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

  // Manual credit addition for fixing issues (admin use)
  async addCreditsManually(req, res) {
    try {
      const { userId, credits, reason } = req.body;

      if (!userId || !credits) {
        return res.status(400).json({
          success: false,
          message: "userId and credits are required",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const previousCredits = user.credits;
      user.credits += credits;
      await user.save();

      console.log(
        `🔧 Manual credit adjustment for ${user.email}: ${previousCredits} -> ${user.credits} (${credits > 0 ? "+" : ""}${credits}). Reason: ${reason || "No reason provided"}`,
      );

      res.json({
        success: true,
        message: `Added ${credits} credits to user`,
        data: {
          previousCredits,
          newCredits: user.credits,
          creditsAdded: credits,
        },
      });
    } catch (error) {
      console.error("❌ Add credits error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding credits",
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
