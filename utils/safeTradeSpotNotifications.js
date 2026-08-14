const User = require('../models/User');
const { sendPushNotification } = require('./pushNotifications');

async function notifyUser(userId, title, body, data) {
  const user = await User.findById(userId);
  if (!user?.expoPushToken || user.notificationPreferences?.push === false) {
    return { success: false };
  }
  return sendPushNotification(user.expoPushToken, title, body, data);
}

async function notifyBothParticipants(spot, title, body) {
  const data = {
    type: 'safe_trade_spot',
    chatId: spot.chatThreadId.toString(),
    safeTradeSpotId: spot._id.toString(),
  };
  await Promise.all([
    notifyUser(spot.initiatorUserId, title, body, data),
    notifyUser(spot.recipientUserId, title, body, data),
  ]);
}

module.exports = {
  notifyBothParticipants,
  notifyUser,
};
