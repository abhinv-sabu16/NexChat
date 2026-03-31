require('dotenv').config();
process.on('uncaughtException', (err) => { console.error('CRITICAL: Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason); });
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { verifyToken, authMiddleware } = require('./middleware/auth');
const Message = require('./models/Message');
const Room = require('./models/Room');

const app = express();
const httpServer = createServer(app);

// ── Socket.io ──────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Express middleware ─────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ── REST routes ────────────────────────────────
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/users', authMiddleware, require('./routes/users'));
app.use('/api/rooms', authMiddleware, require('./routes/rooms'));
app.use('/api/files', authMiddleware, require('./routes/files'));

// ── MongoDB + Change Streams ───────────────────
async function connectDB() {
  console.log('🔗 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected, setting up streams...');
  setupChangeStreams();
}

function setupChangeStreams() {
  const stream = Message.watch(
    [{ $match: { operationType: 'insert' } }],
    { fullDocument: 'updateLookup' }
  );

  stream.on('change', (change) => {
    const msg = change.fullDocument;
    io.to(`room:${msg.roomId}`).emit('message:new', {
      _id:              msg._id,
      roomId:           msg.roomId,
      sender:           msg.sender,
      encryptedContent: msg.encryptedContent,
      iv:               msg.iv,
      type:             msg.type,
      fileMetadata:     msg.fileMetadata,
      createdAt:        msg.createdAt,
      reactions:        {},
    });
  });

  stream.on('error', () => setTimeout(setupChangeStreams, 5000));
}

// ── Socket.io auth middleware ──────────────────
io.use(async (socket, next) => {
  try {
    const user = await verifyToken(socket.handshake.auth.token);
    socket.userId   = user._id.toString();
    socket.username = user.username;
    next();
  } catch {
    next(new Error('Authentication failed'));
  }
});

// ── Socket.io events ───────────────────────────
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 ${socket.username} connected`);

  if (!onlineUsers.has(socket.userId)) onlineUsers.set(socket.userId, new Set());
  onlineUsers.get(socket.userId).add(socket.id);
  io.emit('presence:update', { userId: socket.userId, status: 'online' });

  socket.on('room:join', async ({ roomId }) => {
    try {
      let room;
      if (mongoose.Types.ObjectId.isValid(roomId)) {
        room = await Room.findById(roomId).select('members');
      } else {
        room = await Room.findOne({ slug: roomId }).select('members');
      }

      if (!room) return socket.emit('error', { message: 'Room not found' });
      if (!room.members.includes(socket.userId))
        return socket.emit('error', { message: 'Access denied' });

      socket.join(`room:${roomId}`);
      const history = await Message.find({ roomId: room._id })
        .sort({ createdAt: -1 }).limit(50).lean();
      socket.emit('room:history', history.reverse());
    } catch (err) {
      console.error('Room join error:', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('room:leave', ({ roomId }) => socket.leave(`room:${roomId}`));

  socket.on('message:send', async (payload) => {
    try {
      const { roomId, encryptedContent, iv, type = 'text', fileMetadata, tempId } = payload;
      let room;
      if (mongoose.Types.ObjectId.isValid(roomId)) {
        room = await Room.findById(roomId).select('members');
      } else {
        room = await Room.findOne({ slug: roomId }).select('members');
      }

      if (!room) return socket.emit('error', { message: 'Room not found' });
      if (!room.members.includes(socket.userId))
        return socket.emit('error', { message: 'Access denied' });

      const message = await Message.create({
        roomId: room._id, sender: { _id: socket.userId, username: socket.username },
        encryptedContent, iv, type, fileMetadata, status: 'sent',
      });
      await Room.findByIdAndUpdate(room._id, { lastActivity: new Date() });
      socket.emit('message:ack', { tempId, messageId: message._id });
    } catch (err) {
      console.error('Message send error:', err);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('typing:start', ({ roomId }) => {
    try {
      socket.to(`room:${roomId}`).emit('typing:update',
        { userId: socket.userId, username: socket.username, isTyping: true });
    } catch (err) { console.error('Typing start error:', err); }
  });

  socket.on('typing:stop', ({ roomId }) => {
    try {
      socket.to(`room:${roomId}`).emit('typing:update',
        { userId: socket.userId, username: socket.username, isTyping: false });
    } catch (err) { console.error('Typing stop error:', err); }
  });

  socket.on('reaction:add', async ({ messageId, emoji }) => {
    try {
      const msg = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { [`reactions.${emoji}`]: socket.userId } },
        { new: true }
      ).select('roomId reactions');
      if (msg) {
        io.to(`room:${msg.roomId}`).emit('reaction:update',
          { messageId, reactions: msg.reactions });
      }
    } catch (err) {
      console.error('Reaction error:', err);
    }
  });

  socket.on('message:read', async ({ roomId, lastMessageId }) => {
    try {
      await Message.updateMany(
        { roomId, _id: { $lte: lastMessageId }, 'readBy.userId': { $ne: socket.userId } },
        { $addToSet: { readBy: { userId: socket.userId, readAt: new Date() } } }
      );
      socket.to(`room:${roomId}`).emit('receipts:update',
        { userId: socket.userId, roomId, lastReadMessageId: lastMessageId });
    } catch (err) {
      console.error('Read receipt error:', err);
    }
  });

  socket.on('disconnect', () => {
    const sockets = onlineUsers.get(socket.userId);
    sockets?.delete(socket.id);
    if (!sockets?.size) {
      onlineUsers.delete(socket.userId);
      io.emit('presence:update', { userId: socket.userId, status: 'offline' });
    }
  });
});

// ── Start ──────────────────────────────────────
const PORT = process.env.PORT || 4000;
connectDB().then(() =>
  httpServer.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`))
).catch((err) => { console.error(err); process.exit(1); });

module.exports = { app, io };