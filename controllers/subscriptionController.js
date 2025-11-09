const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const subscriptionPlans = require('../config/subscriptionPlan');

class SubscriptionController {
  // Create checkout session
  async createCheckoutSession(req, res) {
    try {
      const { plan } = req.body;
      const userId = req.user.id;

      console.log('🛒 Creating checkout session for plan:', plan);

      // Validate plan
      if (!subscriptionPlans[plan]) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subscription plan. Available plans: basic, standard, premium'
        });
      }

      // Validate FRONTEND_URL
      const frontendUrl = process.env.FRONTEND_URL;
      if (!frontendUrl || !frontendUrl.startsWith('http')) {
        throw new Error('FRONTEND_URL must be a valid URL with http:// or https://');
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Create or get Stripe customer
      let customerId = user.subscription.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name,
          metadata: {
            userId: userId.toString()
          }
        });
        customerId = customer.id;
        
        // Save customer ID to user
        user.subscription.stripeCustomerId = customerId;
        await user.save();
        console.log('✅ Created new Stripe customer:', customerId);
      }

      const selectedPlan = subscriptionPlans[plan];

      // Validate Stripe Price ID
      if (!selectedPlan.stripePriceId) {
        return res.status(500).json({
          success: false,
          message: 'Subscription plan not properly configured'
        });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: selectedPlan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/subscription/cancel`,
        metadata: {
          userId: userId.toString(),
          plan: plan
        },
        subscription_data: {
          metadata: {
            userId: userId.toString(),
            plan: plan
          }
        }
      });

      console.log('✅ Checkout session created:', session.id);

      res.json({
        success: true,
        message: 'Checkout session created successfully',
        data: {
          sessionId: session.id,
          url: session.url
        }
      });

    } catch (error) {
      console.error('❌ Checkout session error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating checkout session',
        error: error.message
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

      const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });
      
      if (!user) {
        console.log('❌ User not found for customer:', customerId);
        return;
      }

      const plan = subscription.metadata?.plan || user.subscription.plan;

      switch (eventType) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'invoice.payment_succeeded':
          await this.handleSubscriptionActivation(user, subscription, plan);
          break;

        case 'customer.subscription.deleted':
        case 'invoice.payment_failed':
          await this.handleSubscriptionDeactivation(user, subscription);
          break;

        default:
          console.log(`ℹ️ Unhandled event type: ${eventType}`);
      }

    } catch (error) {
      console.error('❌ Error handling subscription update:', error);
    }
  }

  // Handle subscription activation
  async handleSubscriptionActivation(user, subscription, plan) {
    const selectedPlan = subscriptionPlans[plan];
    
    if (!selectedPlan) {
      console.log('❌ Invalid plan for subscription:', plan);
      return;
    }

    user.subscription.plan = plan;
    user.subscription.stripeSubscriptionId = subscription.id;
    user.subscription.status = subscription.status;
    user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    user.subscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    
    // Add credits only for new subscriptions or period renewal
    if (subscription.status === 'active') {
      user.credits += selectedPlan.credits;
      console.log(`✅ Added ${selectedPlan.credits} credits to user ${user.email}`);
    }

    await user.save();
    console.log(`✅ Subscription updated for user ${user.email}, status: ${subscription.status}`);
  }

  // Handle subscription deactivation
  async handleSubscriptionDeactivation(user, subscription) {
    user.subscription.status = subscription.status;
    user.subscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    
    await user.save();
    console.log(`📝 Subscription status updated for user ${user.email}: ${subscription.status}`);
  }

  // Get current subscription status
  async getSubscriptionStatus(req, res) {
    try {
      const user = await User.findById(req.user.id).select('-password');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if subscription is still active
      let isActive = false;
      if (user.subscription.status === 'active' && user.subscription.currentPeriodEnd) {
        isActive = new Date() < user.subscription.currentPeriodEnd;
      }

      res.json({
        success: true,
        data: {
          subscription: user.subscription,
          credits: user.credits,
          isActive: isActive,
          hasSubscription: !!user.subscription.plan
        }
      });

    } catch (error) {
      console.error('❌ Get subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching subscription status',
        error: error.message
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
          message: 'No active subscription found'
        });
      }

      // Cancel subscription at period end in Stripe
      const canceledSubscription = await stripe.subscriptions.update(
        user.subscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true
        }
      );

      // Update user subscription status
      user.subscription.cancelAtPeriodEnd = true;
      await user.save();

      res.json({
        success: true,
        message: 'Subscription will be canceled at the end of the billing period',
        data: {
          subscription: user.subscription
        }
      });

    } catch (error) {
      console.error('❌ Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Error canceling subscription',
        error: error.message
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
        stripePriceId: plan.stripePriceId
      }));

      res.json({
        success: true,
        data: { plans }
      });

    } catch (error) {
      console.error('❌ Get plans error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching subscription plans',
        error: error.message
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
          message: 'Invalid credit amount'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.credits < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient credits'
        });
      }

      user.credits -= amount;
      await user.save();

      res.json({
        success: true,
        message: `Successfully used ${amount} credits`,
        data: {
          creditsRemaining: user.credits,
          creditsUsed: amount
        }
      });

    } catch (error) {
      console.error('❌ Use credits error:', error);
      res.status(500).json({
        success: false,
        message: 'Error using credits',
        error: error.message
      });
    }
  }
}

module.exports = new SubscriptionController();