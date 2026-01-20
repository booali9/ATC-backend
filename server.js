





















































const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://10.48.15.21:8081",
      "http://10.48.15.21:3000",
      "http://10.48.15.21:5000",
    ],
    methods: ["GET", "POST"],
  },
});
app.set("io", io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection with better error handling and timeout settings
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/authapp", {
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    bufferMaxEntries: 0,
    maxPoolSize: 10,
    minPoolSize: 5,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    console.error("❌ MongoDB URI:", process.env.MONGODB_URI ? 'configured' : 'not configured');
  });

// Test route
app.get("/", (req, res) => {
  console.log("Received request on /");
  res.json({ 
    message: "Server is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: process.env.MONGODB_URI ? 'configured' : 'not configured',
    jwtSecret: process.env.JWT_SECRET ? 'configured' : 'NOT CONFIGURED',
    routes: [
      'GET /',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/oauth-login',
      'POST /api/auth/apple-signin',
      'GET /api/user/profile',
      'POST /api/user/logout',
      'DELETE /api/user/delete-account'
    ]
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoute'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/barter', require('./routes/barterRoutes'));
app.use('/api/subscription', require('./routes/subscription'));
app.use('/api/cron', require('./routes/cronRoutes'));
app.use('/api/stream', require('./routes/streamRoutes'));
app.use('/webhook', require('./routes/webhook'))
app.use('/api/config', require('./routes/configRoutes'));

// Socket.IO
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("joinChat", (chatId) => {
    socket.join(chatId);
    console.log(`🟢 User joined chat room: ${chatId}`);
  });

  socket.on("leaveChat", (chatId) => {
    socket.leave(chatId);
    console.log(`🔴 User left chat room: ${chatId}`);
  });

  // ============ CALL EVENTS ============

  socket.on("initiateCall", (data) => {
    console.log("📞 Call initiated:", data);
    // Broadcast to the chat room except sender
    socket.to(data.chatId).emit("callInitiated", {
      chatId: data.chatId,
      callerId: data.callerId,
      callerName: data.callerName,
      callType: data.callType,
    });
  });

  socket.on("acceptCall", (data) => {
    console.log("✅ Call accepted:", data);
    // Notify the caller
    socket.to(data.chatId).emit("callAccepted", {
      chatId: data.chatId,
      receiverId: data.receiverId,
    });
  });

  socket.on("rejectCall", (data) => {
    console.log("❌ Call rejected:", data);
    // Notify the caller
    socket.to(data.chatId).emit("callRejected", {
      chatId: data.chatId,
      receiverId: data.receiverId,
    });
  });

  socket.on("endCall", (data) => {
    console.log("📞 Call ended:", data);
    // Notify all participants
    io.to(data.chatId).emit("callEnded", {
      chatId: data.chatId,
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 MongoDB: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
});
