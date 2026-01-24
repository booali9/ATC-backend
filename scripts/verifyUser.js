// Script to verify a user by email
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_EMAIL = 'rminhal783@gmail.com';

async function verifyUser() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    
    const user = await User.findOne({ email: USER_EMAIL.toLowerCase() });
    
    if (!user) {
      console.error(`❌ User with email ${USER_EMAIL} not found`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`👤 Found User: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current isVerified: ${user.isVerified}`);

    // Update the user's verification status
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: { isVerified: true } },
      { new: true }
    );

    console.log(`\n✅ User verified successfully!`);
    console.log(`   New isVerified: ${updatedUser.isVerified}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

verifyUser();
