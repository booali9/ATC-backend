const fetch = require('node-fetch');
const User = require('../models/User');

/**
 * Send a push notification to a specific user
 * @param {string} expoPushToken - The user's Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification message body
 * @param {object} data - Additional data to send with notification
 */
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken) {
    console.log('No push token provided');
    return { success: false, error: 'No push token' };
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
    priority: 'high',
    channelId: data.channelId || 'default',
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('Push notification sent:', result);
    return { success: true, result };
  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notifications to multiple users
 * @param {Array} messages - Array of message objects with to, title, body, data
 */
async function sendBulkPushNotifications(messages) {
  if (!messages || messages.length === 0) {
    return { success: false, error: 'No messages provided' };
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log('Bulk push notifications sent:', result);
    return { success: true, result };
  } catch (error) {
    console.error('Error sending bulk push notifications:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send subscription expiry reminder to users whose subscription ends in X days
 * @param {number} daysBeforeExpiry - Number of days before expiry to send reminder
 */
async function sendSubscriptionExpiryReminders(daysBeforeExpiry = 3) {
  try {
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + daysBeforeExpiry);
    
    // Find users whose subscription ends on the target date
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const usersToNotify = await User.find({
      'subscription.status': 'active',
      'subscription.currentPeriodEnd': {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      expoPushToken: { $ne: null },
      'notificationPreferences.push': true,
      'notificationPreferences.subscriptionReminders': true,
    });

    console.log(`Found ${usersToNotify.length} users to notify about subscription expiry`);

    const notifications = usersToNotify.map((user) => ({
      to: user.expoPushToken,
      sound: 'default',
      title: 'Subscription Expiring Soon! ⏰',
      body: `Hi ${user.name}! Your subscription will expire in ${daysBeforeExpiry} days. Renew now to continue enjoying all premium features without interruption.`,
      data: {
        type: 'subscription_expiry',
        userId: user._id.toString(),
        daysRemaining: daysBeforeExpiry,
        channelId: 'subscription',
      },
      priority: 'high',
      channelId: 'subscription',
    }));

    if (notifications.length > 0) {
      return await sendBulkPushNotifications(notifications);
    }

    return { success: true, message: 'No users to notify' };
  } catch (error) {
    console.error('Error sending subscription expiry reminders:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a notification for new barter proposal
 * @param {string} userId - The recipient user ID
 * @param {string} proposerName - Name of the user who proposed the barter
 * @param {string} offeredSkill - The skill being offered
 */
async function sendBarterProposalNotification(userId, proposerName, offeredSkill) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.expoPushToken || !user.notificationPreferences?.push) {
      return { success: false, error: 'User not found or notifications disabled' };
    }

    return await sendPushNotification(
      user.expoPushToken,
      'New Barter Proposal! 🤝',
      `${proposerName} wants to trade "${offeredSkill}" with you. Check it out!`,
      {
        type: 'barter_proposal',
        userId: userId,
      }
    );
  } catch (error) {
    console.error('Error sending barter proposal notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a notification for new message
 * @param {string} userId - The recipient user ID
 * @param {string} senderName - Name of the message sender
 * @param {string} chatId - The chat ID
 * @param {string} messagePreview - Preview of the message
 */
async function sendNewMessageNotification(userId, senderName, chatId, messagePreview) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.expoPushToken || !user.notificationPreferences?.push) {
      return { success: false, error: 'User not found or notifications disabled' };
    }

    return await sendPushNotification(
      user.expoPushToken,
      `New message from ${senderName} 💬`,
      messagePreview.length > 50 ? messagePreview.substring(0, 50) + '...' : messagePreview,
      {
        type: 'new_message',
        chatId: chatId,
        senderId: userId,
      }
    );
  } catch (error) {
    console.error('Error sending new message notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a notification when friend request is accepted
 * @param {string} userId - The user who sent the original request
 * @param {string} accepterName - Name of the user who accepted
 */
async function sendFriendRequestAcceptedNotification(userId, accepterName) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.expoPushToken || !user.notificationPreferences?.push) {
      return { success: false, error: 'User not found or notifications disabled' };
    }

    return await sendPushNotification(
      user.expoPushToken,
      'Friend Request Accepted! 🎉',
      `${accepterName} accepted your friend request. You can now propose a barter!`,
      {
        type: 'friend_request_accepted',
        userId: userId,
      }
    );
  } catch (error) {
    console.error('Error sending friend request accepted notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a notification when barter is accepted
 * @param {string} userId - The user who proposed the barter
 * @param {string} accepterName - Name of the user who accepted
 * @param {string} barterId - The barter ID
 */
async function sendBarterAcceptedNotification(userId, accepterName, barterId) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.expoPushToken || !user.notificationPreferences?.push) {
      return { success: false, error: 'User not found or notifications disabled' };
    }

    return await sendPushNotification(
      user.expoPushToken,
      'Barter Accepted! 🎉',
      `${accepterName} accepted your barter proposal. Start trading now!`,
      {
        type: 'barter_accepted',
        barterId: barterId,
      }
    );
  } catch (error) {
    console.error('Error sending barter accepted notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPushNotification,
  sendBulkPushNotifications,
  sendSubscriptionExpiryReminders,
  sendBarterProposalNotification,
  sendNewMessageNotification,
  sendFriendRequestAcceptedNotification,
  sendBarterAcceptedNotification,
};
