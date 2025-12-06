/**
 * Script to fix missing credits for a user after subscription payment
 *
 * Usage:
 *   node scripts/fixUserCredits.js <email> <creditsToAdd>
 *
 * Example:
 *   node scripts/fixUserCredits.js rminhal783@gmail.com 500
 *
 * This script requires MongoDB connection string in .env file
 */

require("dotenv").config();
const mongoose = require("mongoose");

// User model definition (inline to avoid path issues)
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    credits: { type: Number, default: 0 },
    subscription: {
      plan: String,
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      status: String,
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: Boolean,
    },
    processedInvoices: [String],
    processedCheckoutSessions: [String],
  },
  { timestamps: true, strict: false }
);

const User = mongoose.model("User", userSchema);

async function fixUserCredits(email, creditsToAdd) {
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DB_URI;

    if (!mongoUri) {
      console.error("❌ MongoDB URI not found in environment variables");
      console.log(
        "   Set MONGODB_URI, MONGO_URI, or DB_URI in your .env file"
      );
      process.exit(1);
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      console.error(`❌ User not found with email: ${email}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log("\n📊 Current User Status:");
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Current Credits: ${user.credits}`);
    console.log(`   Subscription Plan: ${user.subscription?.plan || "None"}`);
    console.log(
      `   Subscription Status: ${user.subscription?.status || "None"}`
    );

    const previousCredits = user.credits;
    const newCredits = previousCredits + parseInt(creditsToAdd, 10);

    // Update credits
    user.credits = newCredits;
    await user.save();

    console.log("\n✅ Credits Updated Successfully!");
    console.log(`   Previous Credits: ${previousCredits}`);
    console.log(`   Credits Added: +${creditsToAdd}`);
    console.log(`   New Credits: ${newCredits}`);

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log("Usage: node scripts/fixUserCredits.js <email> <creditsToAdd>");
  console.log("Example: node scripts/fixUserCredits.js user@example.com 500");
  process.exit(1);
}

const email = args[0];
const creditsToAdd = args[1];

if (isNaN(parseInt(creditsToAdd, 10))) {
  console.error("❌ creditsToAdd must be a number");
  process.exit(1);
}

console.log("=".repeat(50));
console.log("🔧 User Credits Fix Script");
console.log("=".repeat(50));
console.log(`   Email: ${email}`);
console.log(`   Credits to Add: ${creditsToAdd}`);
console.log("=".repeat(50));

fixUserCredits(email, creditsToAdd);
