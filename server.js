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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/authapp')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/user', require('./routes/userRoute'));
app.use('/api/chat', require('./routes/chatRoutes'));

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinChat', (chatId) => {
    socket.join(chatId);
    console.log(`User joined chat room: ${chatId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});
