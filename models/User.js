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
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
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

    otp: {
      code: String,
      expiresAt: Date,
    },
    resetOtp: {
      code: String,
      expiresAt: Date,
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
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
