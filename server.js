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

// MongoDB connection with retry logic
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/authapp");
    console.log("✅ MongoDB connected:", conn.connection.host);
    
    // Fix referralCode index issue
    try {
      const User = require('./models/User');
      await User.collection.dropIndex('referralCode_1');
      console.log("✅ Dropped old referralCode index");
    } catch (indexError) {
      // Index might not exist, which is fine
      console.log("ℹ️ No old referralCode index to drop");
    }
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    console.error("❌ MongoDB URI:", process.env.MONGODB_URI ? 'configured' : 'not configured');
    // Don't exit process in serverless environment
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  }
};

// Connect to MongoDB
connectDB();

// Test route
app.get("/", (req, res) => {
  console.log("Received request on /");
  
  // Check MongoDB connection status
  const mongoStatus = mongoose.connection.readyState;
  const mongoStatusText = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  }[mongoStatus] || 'unknown';
  
  res.json({ 
    message: "Server is running!",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: {
      uri: process.env.MONGODB_URI ? 'configured' : 'not configured',
      status: mongoStatusText,
      readyState: mongoStatus,
      host: mongoose.connection.host || 'not connected'
    },
    jwtSecret: process.env.JWT_SECRET ? 'configured' : 'NOT CONFIGURED',
    jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
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

// Debug JWT endpoint - REMOVE IN PRODUCTION
app.post("/debug-token", (req, res) => {
  const jwt = require('jsonwebtoken');
  const { token } = req.body;
  
  console.log('🔍 Debug token request received');
  console.log('🔍 Token provided:', token ? 'yes' : 'no');
  console.log('🔍 Token length:', token ? token.length : 0);
  console.log('🔍 Token preview:', token ? token.substring(0, 50) + '...' : 'none');
  
  if (!token) {
    return res.json({
      success: false,
      error: 'No token provided'
    });
  }
  
  try {
    console.log('🔍 JWT_SECRET configured:', process.env.JWT_SECRET ? 'yes' : 'NO');
    console.log('🔍 JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0);
    
    // Try to verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token decoded successfully:', decoded);
    
    res.json({
      success: true,
      message: 'Token is valid',
      decoded: decoded,
      jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0
    });
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    res.json({
      success: false,
      error: error.message,
      errorType: error.name,
      jwtSecretConfigured: process.env.JWT_SECRET ? 'yes' : 'NO',
      jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0
    });
  }
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
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 MongoDB: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
});