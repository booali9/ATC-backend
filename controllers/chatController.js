const Chat = require('../models/Chat');
const User = require('../models/User');
const Barter = require('../models/Barter');
const cloudinary = require('../middleware/upload');

// Send text message
exports.sendTextMessage = async (req, res) => {
  try {
    const { chatId, content } = req.body;
    const chat = await Chat.findById(chatId).populate('participants');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Check if barter is still active
    const otherUserId = chat.participants.find(p => p._id.toString() !== req.user._id.toString())._id;
    const activeBarter = await Barter.findOne({
      $or: [
        { requester: req.user._id, accepter: otherUserId },
        { requester: otherUserId, accepter: req.user._id }
      ],
      status: 'accepted'
    });

    if (!activeBarter) {
      return res.status(403).json({ success: false, message: 'Messaging only allowed during active barters' });
    }

    const message = {
      sender: req.user._id,
      type: 'text',
      content,
      seenBy: [req.user._id]
    };
    chat.messages.push(message);
    chat.updatedAt = new Date();
    await chat.save();

    // Emit via Socket.io
    const io = req.app.get('io');
    io.to(chatId.toString()).emit('newMessage', { chatId, message });

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Send media message
exports.sendMediaMessage = async (req, res) => {
  try {
    const { chatId } = req.body;
    const chat = await Chat.findById(chatId).populate('participants');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // Check if barter is still active
    const otherUserId = chat.participants.find(p => p._id.toString() !== req.user._id.toString())._id;
    const activeBarter = await Barter.findOne({
      $or: [
        { requester: req.user._id, accepter: otherUserId },
        { requester: otherUserId, accepter: req.user._id }
      ],
      status: 'accepted'
    });

    if (!activeBarter) {
      return res.status(403).json({ success: false, message: 'Messaging only allowed during active barters' });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'chat-media'
    });

    const message = {
      sender: req.user._id,
      type: req.file.mimetype.startsWith('image') ? 'image' : 'voice',
      content: result.secure_url,
      seenBy: [req.user._id]
    };
    chat.messages.push(message);
    chat.updatedAt = new Date();
    await chat.save();

    const io = req.app.get('io');
    io.to(chatId.toString()).emit('newMessage', { chatId, message });

    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark messages as seen
exports.markMessagesSeen = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    chat.messages.forEach(msg => {
      if (!msg.seenBy.includes(req.user._id)) msg.seenBy.push(req.user._id);
    });

    await chat.save();
    const io = req.app.get('io');
    io.to(chat._id.toString()).emit('messagesSeen', { chatId: chat._id, userId: req.user._id });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get chat messages
exports.getChatMessages = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId)
      .populate('messages.sender', 'name profileImage');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    res.json({ success: true, chat });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all chats for user (only active barters)
exports.getUserChats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get all active barters for this user
    const activeBarters = await Barter.find({
      $or: [
        { requester: userId },
        { accepter: userId }
      ],
      status: 'accepted'
    });

    if (activeBarters.length === 0) {
      return res.json({ success: true, chats: [] });
    }

    // Get other user IDs from active barters
    const otherUserIds = activeBarters.map(barter =>
      barter.requester.toString() === userId.toString() ? barter.accepter : barter.requester
    );

    let chats = await Chat.find({
      participants: { $all: [userId], $in: otherUserIds }
    })
      .populate('participants', 'name profileImage')
      .populate('messages.sender', 'name profileImage')
      .sort({ updatedAt: -1 });

    const chatList = chats.map(chat => {
      const otherUser = chat.participants.find(p => p._id.toString() !== userId.toString());
      const lastMessage = chat.messages[chat.messages.length - 1] || null;
      const unreadCount = chat.messages.filter(msg => !msg.seenBy.includes(userId)).length;

      return {
        chatId: chat._id,
        otherUser: otherUser ? { _id: otherUser._id, name: otherUser.name, profileImage: otherUser.profileImage } : null,
        lastMessage,
        unreadCount,
        updatedAt: chat.updatedAt
      };
    });

    res.json({ success: true, chats: chatList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get or create chat with another user (only if active barter exists)
exports.getOrCreateChat = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    const currentUserId = req.user._id;

    const otherUser = await User.findById(otherUserId);
    if (!otherUser) return res.status(404).json({ message: 'User not found' });

    // Check if there's an active barter between these users
    const activeBarter = await Barter.findOne({
      $or: [
        { requester: currentUserId, accepter: otherUserId },
        { requester: otherUserId, accepter: currentUserId }
      ],
      status: 'accepted'
    });

    if (!activeBarter) {
      return res.status(403).json({ success: false, message: 'Messaging only allowed between users with active barters' });
    }

    let chat = await Chat.findOne({
      participants: { $all: [currentUserId, otherUserId] }
    });

    if (!chat) {
      chat = new Chat({ participants: [currentUserId, otherUserId], messages: [] });
      await chat.save();
    }

    res.json({ success: true, chatId: chat._id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
