// Script to find all users with this email
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const USER_EMAIL = 'rminhal783@gmail.com';

async function findUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    console.log(`📊 Using URI: ${MONGODB_URI.substring(0, 50)}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`);

    const User = require('../models/User');
    
    // Find all users with this email (case insensitive)
    const users = await User.find({ 
      email: { $regex: new RegExp(USER_EMAIL, 'i') }
    });
    
    console.log(`\n📧 Found ${users.length} user(s) matching "${USER_EMAIL}":\n`);
    
    users.forEach((user, i) => {
      console.log(`--- User ${i + 1} ---`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   isVerified: ${user.isVerified}`);
      console.log(`   authProvider: ${user.authProvider}`);
      console.log(`   Has Password: ${!!user.password}`);
      console.log('');
    });

    // Also count total users
    const totalUsers = await User.countDocuments();
    console.log(`📊 Total users in database: ${totalUsers}`);

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

findUsers();
