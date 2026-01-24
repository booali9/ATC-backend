const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false, // Optional for OAuth users
      unique: true,
      sparse: true, // Allows multiple null values
      trim: true,
    },
    password: {
      type: String,
      required: false, // Optional for OAuth users
      minlength: 6,
    },
    clerkId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values for non-Clerk users
    },
    profileImage: {
      public_id: String,
      url: String,
    },
    skills_offered: [
      {
        type: String,
        trim: true,
      },
    ],
    skills_wanted: [
      {
        type: String,
        trim: true,
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Subscription fields
    subscription: {
      plan: {
        type: String,
        enum: ["basic", "standard", "premium", null],
        default: null,
      },
      stripeCustomerId: String,
      stripeSubscriptionId: String,
      revenueCatId: String,
      platform: {
        type: String,
        enum: ["ios", "android", "stripe", null],
        default: null,
      },
      productId: String, // App Store/Play Store product ID
      status: {
        type: String,
        enum: ["active", "canceled", "past_due", "unpaid", "incomplete", null],
        default: null,
      },
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },
    },

    credits: {
      type: Number,
      default: 0,
    },

    // Track processed Stripe invoices to prevent duplicate credit additions
    processedInvoices: [
      {
        type: String,
      },
    ],

    // Track processed checkout sessions to prevent duplicate credit additions
    processedCheckoutSessions: [
      {
        type: String,
      },
    ],

    // Track processed native transactions (iOS/Android) to prevent duplicate credit additions
    processedTransactions: [
      {
        type: String,
      },
    ],

    otp: {
      code: String,
      expiresAt: Date,
    },
    resetOtp: {
      code: String,
      expiresAt: Date,
    },

    // OAuth provider fields
    appleUserId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    googleUserId: {
      type: String,
      unique: true,
      sparse: true,
    },
    authProvider: {
      type: String,
      enum: ['email', 'apple', 'google', 'facebook', 'oauth', 'oauth_google', 'oauth_apple', 'oauth_facebook', null],
      default: 'email',
    },

    // Push notification token
    expoPushToken: {
      type: String,
      default: null,
    },

    // Notification preferences
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      subscriptionReminders: { type: Boolean, default: true },
    },

    // Referral code (optional, unique when present)
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple undefined values (NOT null - sparse only works with undefined)
      // No default - leave undefined to work with sparse index
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function (next) {
  // Only hash password if it exists and was modified
  if (!this.password || !this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
