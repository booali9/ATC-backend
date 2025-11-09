const subscriptionPlans = {
  basic: {
    name: 'Basic',
    price: 100, // $1.00 in cents
    credits: 100,
    interval: 'month',
    stripePriceId: process.env.STRIPE_BASIC_PRICE_ID // You'll set this in Stripe dashboard
  },
  standard: {
    name: 'Standard',
    price: 300, // $3.00 in cents
    credits: 350,
    interval: 'month',
    stripePriceId: process.env.STRIPE_STANDARD_PRICE_ID
  },
  premium: {
    name: 'Premium',
    price: 500, // $5.00 in cents
    credits: 500,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID
  }
};

module.exports = subscriptionPlans;