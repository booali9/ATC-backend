const Chat = require('../models/Chat');
const SafeTradeSpot = require('../models/SafeTradeSpot');
const TrustedContactShare = require('../models/TrustedContactShare');
const { hit } = require('../utils/rateLimit');
const {
  validateLocation,
  validateSchedule,
  validateEmail,
  validateRelationship,
} = require('../utils/safeTradeSpotValidation');
const { notifyBothParticipants } = require('../utils/safeTradeSpotNotifications');
const {
  scheduleLockNotifications,
  cancelNotificationJobs,
  enqueueTrustedContactEmail,
} = require('../jobs/safeTradeSpotQueue');

function userIdStr(u) {
  return (u?._id || u)?.toString();
}

function isParticipant(chat, userId) {
  return chat.participants.some((p) => userIdStr(p) === userId.toString());
}

function isSpotParticipant(spot, userId) {
  const id = userId.toString();
  return (
    spot.initiatorUserId.toString() === id ||
    spot.recipientUserId.toString() === id
  );
}

function cardPayload(spot) {
  return {
    safeTradeSpotId: spot._id.toString(),
    status: spot.status,
    location: spot.location,
    scheduledDate: spot.scheduledDate,
    scheduledDay: spot.scheduledDay,
    scheduledTime: spot.scheduledTime,
    scheduledAt: spot.scheduledAt,
    lockedAt: spot.lockedAt,
    initiatorUserId: spot.initiatorUserId.toString(),
    recipientUserId: spot.recipientUserId.toString(),
  };
}

function emitSpotUpdated(io, chatId, spot) {
  if (!io) return;
  io.to(chatId.toString()).emit('safeTradeSpotUpdated', {
    chatId: chatId.toString(),
    safeTradeSpot: {
      ...spot.toObject?.() ?? spot,
      _id: spot._id.toString(),
      chatThreadId: spot.chatThreadId.toString(),
      initiatorUserId: spot.initiatorUserId.toString(),
      recipientUserId: spot.recipientUserId.toString(),
    },
  });
}

async function pushChatCard(io, chat, senderId, type, spot, summary) {
  const message = {
    sender: senderId,
    type,
    content: summary,
    safeTradeSpotId: spot._id,
    payload: cardPayload(spot),
    seenBy: [senderId],
    createdAt: new Date(),
  };
  chat.messages.push(message);
  chat.updatedAt = new Date();
  await chat.save();

  const saved = chat.messages[chat.messages.length - 1];
  const fullMessage = {
    _id: saved._id.toString(),
    sender: senderId.toString(),
    type,
    content: summary,
    safeTradeSpotId: spot._id.toString(),
    payload: cardPayload(spot),
    seenBy: [senderId.toString()],
    createdAt: saved.createdAt,
    chatId: chat._id.toString(),
  };
  if (io) {
    io.to(chat._id.toString()).emit('newMessage', fullMessage);
    emitSpotUpdated(io, chat._id, spot);
  }
  return fullMessage;
}

async function assertChatParticipant(chatId, userId) {
  const chat = await Chat.findById(chatId);
  if (!chat) return { error: { status: 404, message: 'Chat not found' } };
  if (!isParticipant(chat, userId)) {
    return { error: { status: 403, message: 'Not a participant of this chat' } };
  }
  if (chat.participants.length !== 2) {
    return { error: { status: 400, message: 'Safe Trade Spot requires a 1:1 chat' } };
  }
  return { chat };
}

exports.createInvite = async (req, res) => {
  try {
    const chatThreadId = req.params.chatThreadId;
    const userId = req.user._id;

    const rate = await hit(`sts-create:${userId}`, 10, 60 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: 'Too many invites. Try later.' });
    }

    const { chat, error } = await assertChatParticipant(chatThreadId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const chatRate = await hit(`sts-create-chat:${chatThreadId}`, 5, 60 * 60 * 1000);
    if (!chatRate.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many Safe Trade Spot invites in this chat.',
      });
    }

    const loc = validateLocation(req.body.location);
    if (!loc.ok) return res.status(400).json({ success: false, message: loc.error });
    if (loc.location.lat == null || loc.location.lng == null) {
      return res.status(400).json({
        success: false,
        message: 'Location coordinates (lat/lng) are required — pick a map pin',
      });
    }

    const sched = validateSchedule(
      req.body.scheduledDate,
      req.body.scheduledTime,
      req.body.timezoneOffsetMinutes ?? new Date().getTimezoneOffset()
    );
    if (!sched.ok) return res.status(400).json({ success: false, message: sched.error });

    const other = chat.participants.find((p) => userIdStr(p) !== userId.toString());

    // Atomic: only create if no active spot for this chat
    const open = await SafeTradeSpot.findOne({
      chatThreadId,
      status: { $in: ['pending', 'counter_proposed', 'locked'] },
    });
    if (open) {
      return res.status(409).json({
        success: false,
        message: 'An active Safe Trade Spot already exists for this chat',
        safeTradeSpot: open,
      });
    }

    let spot;
    try {
      spot = await SafeTradeSpot.create({
        chatThreadId,
        initiatorUserId: userId,
        recipientUserId: other._id || other,
        status: 'pending',
        location: loc.location,
        scheduledDate: sched.scheduledDate,
        scheduledDay: sched.scheduledDay,
        scheduledTime: sched.scheduledTime,
        scheduledAt: sched.scheduledAt,
        timezoneOffsetMinutes: sched.timezoneOffsetMinutes,
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        return res.status(409).json({
          success: false,
          message: 'An active Safe Trade Spot already exists for this chat',
        });
      }
      throw createErr;
    }

    const io = req.app.get('io');
    const message = await pushChatCard(
      io,
      chat,
      userId,
      'safe_trade_spot_invite',
      spot,
      `Safe Trade Spot proposed: ${spot.location.name} · ${spot.scheduledDay} ${spot.scheduledDate} ${spot.scheduledTime}`
    );

    await notifyBothParticipants(
      spot,
      'Safe Trade Spot invite',
      `${req.user.name || 'Someone'} proposed a meetup`
    );

    res.status(201).json({ success: true, safeTradeSpot: spot, message });
  } catch (err) {
    console.error('createInvite', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.respond = async (req, res) => {
  try {
    const userId = req.user._id;
    const { action } = req.body;
    if (!['accept', 'counter_propose'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be accept or counter_propose',
      });
    }

    const existing = await SafeTradeSpot.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isSpotParticipant(existing, userId)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { chat, error } = await assertChatParticipant(existing.chatThreadId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const io = req.app.get('io');

    if (action === 'accept') {
      // Atomic lock: only one winner if double-tapped
      const spot = await SafeTradeSpot.findOneAndUpdate(
        {
          _id: req.params.id,
          recipientUserId: userId,
          status: { $in: ['pending', 'counter_proposed'] },
        },
        { $set: { status: 'locked', lockedAt: new Date() } },
        { new: true }
      );

      if (!spot) {
        const current = await SafeTradeSpot.findById(req.params.id);
        if (current?.status === 'locked') {
          return res.json({ success: true, safeTradeSpot: current }); // idempotent
        }
        return res.status(403).json({
          success: false,
          message: 'Only the current recipient can accept, or spot is no longer pending',
        });
      }

      await scheduleLockNotifications(spot);

      const message = await pushChatCard(
        io,
        chat,
        userId,
        'safe_trade_spot_update',
        spot,
        `Safe Trade Spot locked: ${spot.location.name} · ${spot.scheduledDay} ${spot.scheduledDate} ${spot.scheduledTime}`
      );

      await notifyBothParticipants(
        spot,
        'Safe Trade Spot confirmed',
        `Meetup locked for ${spot.scheduledDate} at ${spot.scheduledTime}`
      );

      return res.json({ success: true, safeTradeSpot: spot, message });
    }

    // counter_propose
    const loc = validateLocation(req.body.location || existing.location);
    if (!loc.ok) return res.status(400).json({ success: false, message: loc.error });
    if (loc.location.lat == null || loc.location.lng == null) {
      return res.status(400).json({
        success: false,
        message: 'Location coordinates (lat/lng) are required — pick a map pin',
      });
    }

    const sched = validateSchedule(
      req.body.scheduledDate || existing.scheduledDate,
      req.body.scheduledTime || existing.scheduledTime,
      req.body.timezoneOffsetMinutes ?? existing.timezoneOffsetMinutes
    );
    if (!sched.ok) return res.status(400).json({ success: false, message: sched.error });

    const previous = {
      location: existing.location,
      scheduledDate: existing.scheduledDate,
      scheduledDay: existing.scheduledDay,
      scheduledTime: existing.scheduledTime,
      scheduledAt: existing.scheduledAt,
    };
    const next = {
      location: loc.location,
      scheduledDate: sched.scheduledDate,
      scheduledDay: sched.scheduledDay,
      scheduledTime: sched.scheduledTime,
      scheduledAt: sched.scheduledAt,
    };

    const spot = await SafeTradeSpot.findOneAndUpdate(
      {
        _id: req.params.id,
        recipientUserId: userId,
        status: { $in: ['pending', 'counter_proposed'] },
      },
      {
        $set: {
          location: loc.location,
          scheduledDate: sched.scheduledDate,
          scheduledDay: sched.scheduledDay,
          scheduledTime: sched.scheduledTime,
          scheduledAt: sched.scheduledAt,
          timezoneOffsetMinutes: sched.timezoneOffsetMinutes,
          status: 'counter_proposed',
          initiatorUserId: userId,
          recipientUserId: existing.initiatorUserId,
        },
        $push: {
          proposalHistory: {
            actorUserId: userId,
            previous,
            next,
            createdAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!spot) {
      return res.status(403).json({
        success: false,
        message: 'Only the current recipient can counter-propose, or spot is no longer pending',
      });
    }

    const message = await pushChatCard(
      io,
      chat,
      userId,
      'safe_trade_spot_invite',
      spot,
      `Safe Trade Spot counter-proposal: ${spot.location.name} · ${spot.scheduledDay} ${spot.scheduledDate} ${spot.scheduledTime}`
    );

    await notifyBothParticipants(
      spot,
      'Safe Trade Spot counter-proposal',
      `${req.user.name || 'Someone'} proposed a new time/place`
    );

    res.json({ success: true, safeTradeSpot: spot, message });
  } catch (err) {
    console.error('respond', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const spot = await SafeTradeSpot.findById(req.params.id);
    if (!spot) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isSpotParticipant(spot, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, safeTradeSpot: spot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getActiveForChat = async (req, res) => {
  try {
    const { chat, error } = await assertChatParticipant(req.params.chatThreadId, req.user._id);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const spot = await SafeTradeSpot.findOne({
      chatThreadId: chat._id,
      status: { $in: ['pending', 'counter_proposed', 'locked'] },
    }).sort({ updatedAt: -1 });

    res.json({ success: true, safeTradeSpot: spot || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const userId = req.user._id;

    const spot = await SafeTradeSpot.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ initiatorUserId: userId }, { recipientUserId: userId }],
        status: { $in: ['pending', 'counter_proposed', 'locked'] },
      },
      { $set: { status: 'cancelled' } },
      { new: true }
    );

    if (!spot) {
      const current = await SafeTradeSpot.findById(req.params.id);
      if (!current) return res.status(404).json({ success: false, message: 'Not found' });
      if (!isSpotParticipant(current, userId)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      if (['cancelled', 'completed', 'expired'].includes(current.status)) {
        return res.json({ success: true, safeTradeSpot: current });
      }
      return res.status(400).json({ success: false, message: 'Cannot cancel this spot' });
    }

    await cancelNotificationJobs(spot);

    const { chat } = await assertChatParticipant(spot.chatThreadId, userId);
    const io = req.app.get('io');
    let message = null;
    if (chat) {
      message = await pushChatCard(
        io,
        chat,
        userId,
        'safe_trade_spot_update',
        spot,
        'Safe Trade Spot cancelled'
      );
    }

    await notifyBothParticipants(spot, 'Safe Trade Spot cancelled', 'The meetup was cancelled');

    res.json({ success: true, safeTradeSpot: spot, message });
  } catch (err) {
    console.error('cancel', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.shareLocation = async (req, res) => {
  try {
    const spot = await SafeTradeSpot.findById(req.params.id);
    if (!spot) return res.status(404).json({ success: false, message: 'Not found' });
    if (!isSpotParticipant(spot, req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (spot.status !== 'locked') {
      return res.status(400).json({
        success: false,
        message: 'Share is only allowed when the Safe Trade Spot is locked',
      });
    }

    const rate = await hit(`sts-share:${req.user._id}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return res.status(429).json({ success: false, message: 'Share limit reached (5/hour)' });
    }

    const emailCheck = validateEmail(req.body.recipientEmail);
    if (!emailCheck.ok) {
      return res.status(400).json({ success: false, message: emailCheck.error });
    }
    const relCheck = validateRelationship(req.body.relationship);
    if (!relCheck.ok) {
      return res.status(400).json({ success: false, message: relCheck.error });
    }

    const share = await TrustedContactShare.create({
      safeTradeSpotId: spot._id,
      sharedByUserId: req.user._id,
      recipientEmail: emailCheck.email,
      relationship: relCheck.relationship,
      snapshotDate: spot.scheduledDate,
      snapshotDay: spot.scheduledDay,
      snapshotTime: spot.scheduledTime,
      snapshotLocation: {
        name: spot.location.name,
        formattedAddress: spot.location.formattedAddress,
        lat: spot.location.lat,
        lng: spot.location.lng,
      },
      emailStatus: 'pending',
    });

    try {
      await enqueueTrustedContactEmail(share._id);
    } catch (queueErr) {
      // Fallback: send inline with one retry if Redis unavailable
      console.warn('Email queue unavailable, sending inline:', queueErr.message);
      const { sendTrustedContactShareEmail } = require('../utils/emailService');
      try {
        await sendTrustedContactShareEmail({
          to: emailCheck.email,
          sharedByName: req.user.name || 'An ATC user',
          relationship: relCheck.relationship,
          snapshotDate: spot.scheduledDate,
          snapshotDay: spot.scheduledDay,
          snapshotTime: spot.scheduledTime,
          locationName: spot.location.name,
          locationAddress: spot.location.formattedAddress,
        });
        share.emailStatus = 'sent';
        share.emailSentAt = new Date();
        await share.save();
      } catch (sendErr) {
        try {
          await sendTrustedContactShareEmail({
            to: emailCheck.email,
            sharedByName: req.user.name || 'An ATC user',
            relationship: relCheck.relationship,
            snapshotDate: spot.scheduledDate,
            snapshotDay: spot.scheduledDay,
            snapshotTime: spot.scheduledTime,
            locationName: spot.location.name,
            locationAddress: spot.location.formattedAddress,
          });
          share.emailStatus = 'sent';
          share.emailSentAt = new Date();
          await share.save();
        } catch (retryErr) {
          share.emailStatus = 'failed';
          await share.save();
          return res.status(502).json({
            success: false,
            message: 'Failed to send email',
            shareId: share._id,
          });
        }
      }
    }

    res.status(202).json({
      success: true,
      share: {
        id: share._id,
        emailStatus: share.emailStatus,
        emailSentAt: share.emailSentAt,
      },
    });
  } catch (err) {
    console.error('shareLocation', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
