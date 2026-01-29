const subscriptionPlans = {
  basic: {
    name: 'Builder',
    price: 100, // $1.00 in cents
    credits: 100,
    description: 'One-time purchase of 100 credits'
  },
  standard: {
    name: 'Legacy Member',
    price: 300, // $3.00 in cents
    credits: 350,
    description: 'One-time purchase of 350 credits'
  },
  premium: {
    name: 'Supporter',
    price: 500, // $5.00 in cents
    credits: 500,
    description: 'One-time purchase of 500 credits'
  }
};

module.exports = subscriptionPlans;