// Script to fix referralCode index issue
// This removes null referralCodes and recreates the sparse index
require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

async function fixReferralCodeIndex() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Step 1: Update all users with referralCode: null to unset the field
    console.log('\n📝 Removing null referralCode values...');
    const updateResult = await usersCollection.updateMany(
      { referralCode: null },
      { $unset: { referralCode: "" } }
    );
    console.log(`✅ Updated ${updateResult.modifiedCount} users (removed null referralCode)`);

    // Step 2: Drop the existing referralCode index if it exists
    console.log('\n📝 Dropping existing referralCode index...');
    try {
      await usersCollection.dropIndex('referralCode_1');
      console.log('✅ Dropped referralCode_1 index');
    } catch (dropError) {
      if (dropError.code === 27) {
        console.log('ℹ️ Index referralCode_1 does not exist, skipping drop');
      } else {
        throw dropError;
      }
    }

    // Step 3: Recreate the sparse unique index
    console.log('\n📝 Creating new sparse unique index on referralCode...');
    await usersCollection.createIndex(
      { referralCode: 1 },
      { unique: true, sparse: true }
    );
    console.log('✅ Created sparse unique index on referralCode');

    // Step 4: Verify the fix
    console.log('\n📝 Verifying fix...');
    const nullCount = await usersCollection.countDocuments({ referralCode: null });
    const undefinedCount = await usersCollection.countDocuments({ referralCode: { $exists: false } });
    console.log(`✅ Users with null referralCode: ${nullCount}`);
    console.log(`✅ Users without referralCode field: ${undefinedCount}`);

    await mongoose.disconnect();
    console.log('\n✅ Done! The referralCode index issue has been fixed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixReferralCodeIndex();
