const express = require('express');
const router = express.Router();
const { sendSubscriptionExpiryReminders } = require('../utils/pushNotifications');

/**
 * Cron endpoint to send subscription expiry reminders
 * This should be called by a cron job service (e.g., Vercel Cron, GitHub Actions, etc.)
 * 
 * For Vercel, add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/subscription-reminders",
 *     "schedule": "0 9 * * *"  // Every day at 9 AM
 *   }]
 * }
 */
router.get('/subscription-reminders', async (req, res) => {
  try {
    // Verify cron secret (optional security measure)
    const cronSecret = req.headers['x-cron-secret'];
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    console.log('🔔 Running subscription expiry reminder cron job...');

    // Send reminders for subscriptions expiring in 3 days
    const result3Days = await sendSubscriptionExpiryReminders(3);
    console.log('3-day reminders result:', result3Days);

    // Send reminders for subscriptions expiring in 1 day
    const result1Day = await sendSubscriptionExpiryReminders(1);
    console.log('1-day reminders result:', result1Day);

    // Send reminders for subscriptions expiring today
    const resultToday = await sendSubscriptionExpiryReminders(0);
    console.log('Today reminders result:', resultToday);

    res.json({
      success: true,
      message: 'Subscription expiry reminders sent',
      results: {
        threeDays: result3Days,
        oneDay: result1Day,
        today: resultToday,
      },
    });
  } catch (error) {
    console.error('Error in subscription reminder cron:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Manual trigger endpoint for testing (admin only)
 */
router.post('/test-notification', async (req, res) => {
  try {
    const { userId, days } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const User = require('../models/User');
    const { sendPushNotification } = require('../utils/pushNotifications');

    const user = await User.findById(userId);
    if (!user || !user.expoPushToken) {
      return res.status(404).json({ success: false, message: 'User not found or no push token' });
    }

    const result = await sendPushNotification(
      user.expoPushToken,
      'Subscription Expiring Soon! ⏰',
      `Hi ${user.name}! Your subscription will expire in ${days || 3} days. Renew now to continue enjoying all premium features without interruption.`,
      {
        type: 'subscription_expiry',
        userId: user._id.toString(),
        daysRemaining: days || 3,
        channelId: 'subscription',
      }
    );

    res.json({
      success: true,
      message: 'Test notification sent',
      result,
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
