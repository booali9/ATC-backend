// Script to change password for a user by email
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_EMAIL = 'rminhal783@gmail.com';
const NEW_PASSWORD = '123456789';

async function changePassword() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    
    // Find the user by email
    const user = await User.findOne({ email: USER_EMAIL.toLowerCase() });
    
    if (!user) {
      console.error(`❌ User with email ${USER_EMAIL} not found`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`👤 Found User:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 12);

    // Update the user's password directly (bypassing the pre-save hook)
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: { password: hashedPassword } },
      { new: true, runValidators: false }
    );

    console.log(`\n✅ Password updated successfully for ${USER_EMAIL}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

changePassword();
