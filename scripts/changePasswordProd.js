// Script to change password in PRODUCTION database
// Using the Vercel MongoDB URI
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// PRODUCTION MongoDB URI (from Vercel logs: hlnj4ui.mongodb.net)
// You need to provide the full URI here
const MONGODB_URI = process.env.PROD_MONGODB_URI || 'YOUR_PRODUCTION_MONGODB_URI_HERE';
const USER_EMAIL = 'rminhal783@gmail.com';
const NEW_PASSWORD = '123456789';

async function changePasswordProd() {
  try {
    console.log('🔄 Connecting to PRODUCTION MongoDB...');
    console.log(`📊 URI: ${MONGODB_URI.substring(0, 50)}...`);
    
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);

    const User = require('../models/User');
    
    // Find the user by email
    const user = await User.findOne({ email: USER_EMAIL.toLowerCase() });
    
    if (!user) {
      console.error(`❌ User with email ${USER_EMAIL} not found in PRODUCTION`);
      
      // List all users
      const allUsers = await User.find({}, 'email name isVerified');
      console.log('\n📋 Users in production database:');
      allUsers.forEach(u => console.log(`   - ${u.email} (verified: ${u.isVerified})`));
      
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`\n👤 Found User:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   isVerified: ${user.isVerified}`);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);

    // Update the user's password and set verified
    await User.findByIdAndUpdate(
      user._id,
      { $set: { password: hashedPassword, isVerified: true } },
      { new: true, runValidators: false }
    );

    console.log(`\n✅ Password updated and user verified for ${USER_EMAIL}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

changePasswordProd();
