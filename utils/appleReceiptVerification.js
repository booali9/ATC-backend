const axios = require('axios');

const APPLE_PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

const verifyAppleReceipt = async (receipt) => {
  const payload = {
    'receipt-data': receipt,
    password: process.env.APPLE_SHARED_SECRET,
  };

  try {
    // Try production first
    let res = await axios.post(APPLE_PROD, payload);

    // If sandbox receipt, try sandbox
    if (res.data.status === 21007) {
      res = await axios.post(APPLE_SANDBOX, payload);
    }

    return res.data;
  } catch (error) {
    console.error('Apple receipt verification failed:', error);
    throw error;
  }
};

module.exports = { verifyAppleReceipt };