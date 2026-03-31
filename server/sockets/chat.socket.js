/**
 * sockets/chat.socket.js
 *
 * All real-time features live here. GraphQL is NOT used for any of this.
 * Business logic (DB writes) is delegated to messageService.
 */

import jwt from 'jsonwebtoken';
import User    from '../models/User.js';
import Room    from '../models/Room.js';
import {
  createMessage,
  markRoomAsRead,
} from '../services/messageService.js';

// ─── Typing debounce map (roomId:userId → timeout) ────────────────────────────
const typingTimers = new Map();
const TYPING_TIMEOUT_MS = 3000;

// ─── Socket authentication ────────────────────────────────────────────────────

/**
 * Middleware: validates JWT passed in socket.handshake.auth.token.
 * Rejects the connection immediately if the token is missing or invalid.
 */
async function socketAuthMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token.'));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(payload.sub).lean();

    if (!user) return next(new Error('User not found.'));

    // Attach user to socket for use in all event handlers
    socket.user = user;
    next();
  } catch {
    next(new Error('Invalid or expired token.'));
  }
}

// ─── Room membership guard ────────────────────────────────────────────────────

async function assertRoomMember(roomId, userId) {
  const room = await Room.findById(roomId).lean();
  if (!room) throw new Error(`Room ${roomId} not found.`);

  const isMember = room.members.some((m) => m.toString() === userId.toString());
  if (!isMember) throw new Error('You are not a member of this room.');

  return room;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export function registerChatSocket(io) {
  // Apply auth middleware to every incoming socket connection
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const { user } = socket;
    console.log(`[socket] connected: ${user.username} (${socket.id})`);

    // Mark user online
    await User.findByIdAndUpdate(user._id, { presence: 'online' });
    socket.broadcast.emit('presence:update', { userId: user._id, presence: 'online' });

    // ── join:room ─────────────────────────────────────────────────────────────
    // Client calls this after loading a room via GraphQL.

    socket.on('join:room', async (roomId, ack) => {
      try {
        await assertRoomMember(roomId, user._id);
        socket.join(roomId);
        // Mark existing messages as read on join
        await markRoomAsRead(roomId, user._id);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // ── leave:room ────────────────────────────────────────────────────────────

    socket.on('leave:room', (roomId) => {
      socket.leave(roomId);
    });

    // ── message:send ──────────────────────────────────────────────────────────
    /**
     * Expected payload:
     * {
     *   roomId:  string,
     *   content: string,   // AES-256-GCM ciphertext "iv:ct" — never decrypted here
     *   fileId?: string,   // Optional: ObjectId of a previously uploaded File
     * }
     */
    socket.on('message:send', async (payload, ack) => {
      try {
        const { roomId, content, fileId } = payload ?? {};

        if (!roomId || !content) {
          return ack?.({ ok: false, error: 'roomId and content are required.' });
        }

        await assertRoomMember(roomId, user._id);

        // Delegate DB write to service — shared with GraphQL resolver
        const message = await createMessage({
          content,
          senderId: user._id,
          roomId,
          fileId: fileId ?? null,
        });

        // Broadcast to all clients in the room (including sender)
        io.to(roomId).emit('message:new', {
          id:        message._id,
          content:   message.content,
          sender:    {
            id:        message.sender._id,
            username:  message.sender.username,
            publicKey: message.sender.publicKey,
          },
          file:      message.file ?? null,
          roomId,
          createdAt: message.createdAt,
        });

        ack?.({ ok: true, messageId: message._id });
      } catch (err) {
        console.error('[socket] message:send', err);
        ack?.({ ok: false, error: err.message });
      }
    });

    // ── typing:start / typing:stop ────────────────────────────────────────────
    /**
     * Client emits typing:start when the user begins typing.
     * Auto-stops after 3 s of no further events (debounce).
     */
    socket.on('typing:start', async ({ roomId } = {}) => {
      if (!roomId) return;

      // Broadcast to others in the room
      socket.to(roomId).emit('typing:update', {
        userId:   user._id,
        username: user.username,
        roomId,
        isTyping: true,
      });

      // Debounce: automatically send stop after 3 s
      const key = `${roomId}:${user._id}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.set(
        key,
        setTimeout(() => {
          socket.to(roomId).emit('typing:update', {
            userId:   user._id,
            username: user.username,
            roomId,
            isTyping: false,
          });
          typingTimers.delete(key);
        }, TYPING_TIMEOUT_MS)
      );
    });

    socket.on('typing:stop', ({ roomId } = {}) => {
      if (!roomId) return;

      const key = `${roomId}:${user._id}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);

      socket.to(roomId).emit('typing:update', {
        userId:   user._id,
        username: user.username,
        roomId,
        isTyping: false,
      });
    });

    // ── read:mark ─────────────────────────────────────────────────────────────

    socket.on('read:mark', async ({ roomId } = {}) => {
      if (!roomId) return;
      await markRoomAsRead(roomId, user._id);
      // Notify others that this user has read the room
      socket.to(roomId).emit('read:update', {
        userId: user._id,
        roomId,
      });
    });

    // ── disconnect ────────────────────────────────────────────────────────────

    socket.on('disconnect', async () => {
      console.log(`[socket] disconnected: ${user.username} (${socket.id})`);

      // Clean up any pending typing timers for this socket
      for (const [key, timer] of typingTimers.entries()) {
        if (key.endsWith(`:${user._id}`)) {
          clearTimeout(timer);
          typingTimers.delete(key);
        }
      }

      // Check if user has any other active sockets before marking offline
      const sockets = await io.fetchSockets();
      const stillConnected = sockets.some(
        (s) => s.id !== socket.id && s.user?._id.toString() === user._id.toString()
      );

      if (!stillConnected) {
        await User.findByIdAndUpdate(user._id, { presence: 'offline' });
        socket.broadcast.emit('presence:update', {
          userId:   user._id,
          presence: 'offline',
        });
      }
    });
  });
}