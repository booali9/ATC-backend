// Script to simulate exactly what the login endpoint does
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
const EMAIL = 'rminhal783@gmail.com';
const PASSWORD = '123456789';

async function simulateLogin() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    console.log(`📊 URI: ${MONGODB_URI.substring(0, 60)}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}\n`);

    const User = require('../models/User');
    
    // Exactly as the login endpoint does it
    const user = await User.findOne({
      $or: [{ email: EMAIL }, { phone: EMAIL }]
    });

    if (!user) {
      console.log('❌ User not found');
      await mongoose.disconnect();
      return;
    }

    console.log('👤 User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   isVerified: ${user.isVerified}`);
    console.log(`   Has Password: ${!!user.password}`);
    console.log(`   Password Hash: ${user.password ? user.password.substring(0, 20) + '...' : 'none'}`);

    if (!user.isVerified) {
      console.log('\n❌ Login would fail: Please verify your account first');
      await mongoose.disconnect();
      return;
    }

    console.log('\n🔑 Testing password...');
    const isPasswordValid = await user.comparePassword(PASSWORD);
    console.log(`   Password valid: ${isPasswordValid}`);

    if (!isPasswordValid) {
      console.log('❌ Login would fail: Invalid credentials');
    } else {
      console.log('\n✅ Login would succeed!');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
  }
}

simulateLogin();
