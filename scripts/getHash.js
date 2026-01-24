// Script to get the full password hash
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_EMAIL = 'rminhal783@gmail.com';

async function getHash() {
  try {
    await mongoose.connect(MONGODB_URI);
    const User = require('../models/User');
    
    const user = await User.findOne({ email: USER_EMAIL.toLowerCase() });
    
    if (!user) {
      console.log('User not found');
      process.exit(1);
    }

    console.log('Email:', user.email);
    console.log('Full Password Hash:');
    console.log(user.password);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

getHash();
