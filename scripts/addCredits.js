// Script to add credits to a user by ID
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_ID = '6962b50bdaac0a777252ace8'; // The logged-in user ID
const CREDITS_TO_SET = 5000;

async function addCredits() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    
    const user = await User.findById(USER_ID);
    
    if (!user) {
      console.error(`❌ User with ID ${USER_ID} not found`);
      process.exit(1);
    }

    console.log(`👤 User ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Credits: ${user.credits || 0}`);

    // Update the user
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: { credits: CREDITS_TO_SET } },
      { new: true, runValidators: false }
    );

    console.log(`\n✅ Set credits to ${CREDITS_TO_SET}`);
    console.log(`💰 Verified credits: ${updatedUser.credits}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addCredits();
