// Script to check user status
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_EMAIL = 'rminhal783@gmail.com';

async function checkUser() {
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

    console.log(`\n👤 User Details:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   isVerified: ${user.isVerified}`);
    console.log(`   authProvider: ${user.authProvider}`);
    console.log(`   Has Password: ${!!user.password}`);
    console.log(`   Credits: ${user.credits}`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkUser();
