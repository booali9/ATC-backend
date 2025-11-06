const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: { origin: ['http://localhost:3000'], methods: ['GET', 'POST'] }
});
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/authapp')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
  console.log('Received request on /');
  res.json({ message: 'Server is running!' });
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoute'));
app.use('/api/chat', require('./routes/chatRoutes'));

// Socket.IO
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('joinChat', (chatId) => {
    socket.join(chatId);
    console.log(`🟢 User joined chat room: ${chatId}`);
  });

  socket.on('leaveChat', (chatId) => {
    socket.leave(chatId);
    console.log(`🔴 User left chat room: ${chatId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
