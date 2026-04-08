/**
 * sockets/chat.socket.js
 *
 * All real-time features. Pure event orchestration — no DB or model imports.
 */

import { socketAuthMiddleware }          from '../middleware/auth.js';
import { assertMembership }              from '../services/roomService.js';
import { createMessage, markRoomAsRead } from '../services/messageService.js';
import { setPresence, isLastSocketForUser } from '../services/userService.js';
import { validate, SendMessageSchema, JoinRoomSchema } from '../lib/validators.js';
import { TYPING_TIMEOUT_MS }             from '../lib/constants.js';
import { AppError }                      from '../lib/errors.js';

// ─── Typing debounce registry ─────────────────────────────────────────────────
const typingTimers = new Map();

// ─── Error serializer ─────────────────────────────────────────────────────────

function serializeError(err) {
  if (err instanceof AppError) {
    return { ok: false, error: err.message, code: err.code };
  }
  console.error('[socket] Unexpected error:', err);
  return { ok: false, error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' };
}

// ─── Typing helpers ───────────────────────────────────────────────────────────

function emitTypingUpdate(socket, roomId, isTyping) {
  socket.to(roomId).emit('typing:update', {
    userId:   socket.user._id.toString(),
    username: socket.user.username,
    roomId,
    isTyping,
  });
}

function clearTypingTimer(key) {
  const timer = typingTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    typingTimers.delete(key);
  }
}

// ─── Main registration ────────────────────────────────────────────────────────

export function registerChatSocket(io) {
  io.use(socketAuthMiddleware);

  io.engine.on('connection_error', (err) => {
    console.error(`[socket] Engine connection error: ${err.code} — ${err.message}`);
  });

  io.on('connection', async (socket) => {
    const { user } = socket;
    console.info(`[socket] + ${user.username} (${socket.id})`);

    // Mark user online
    await setPresence(user._id, 'online');
    socket.broadcast.emit('presence:update', { 
      userId: user._id.toString(), 
      presence: 'online' 
    });

    // ── join:room ───────────────────────────────────────────────────────────
    socket.on('join:room', async (payload, ack) => {
      try {
        const { roomId } = validate(JoinRoomSchema, payload ?? {});

        // Verify membership
        await assertMembership(roomId, user._id);

        // Join the Socket.io room
        socket.join(roomId);

        // Mark all existing messages as read
        await markRoomAsRead(roomId, user._id);

        ack?.({ ok: true });
      } catch (err) {
        ack?.(serializeError(err));
      }
    });

    // ── leave:room ──────────────────────────────────────────────────────────
    socket.on('leave:room', (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      const typingKey = `${roomId}:${user._id}`;
      if (typingTimers.has(typingKey)) {
        emitTypingUpdate(socket, roomId, false);
        clearTypingTimer(typingKey);
      }

      socket.leave(roomId);
    });

    // ── message:send ────────────────────────────────────────────────────────
    socket.on('message:send', async (payload, ack) => {
      try {
        const { roomId, content, fileId } = validate(SendMessageSchema, payload ?? {});

        // Create message with full population
        const message = await createMessage({
          content,
          senderId: user._id,
          roomId,
          fileId: fileId ?? null,
        });

        // Prepare the event payload
        const messageEvent = {
          id: message._id.toString(),
          content: message.content,
          sender: {
            id: message.sender._id.toString(),
            username: message.sender.username,
            publicKey: message.sender.publicKey,
          },
          file: message.file ? {
            id: message.file._id.toString(),
            originalName: message.file.originalName,
            mimeType: message.file.mimeType,
            sizeBytes: message.file.sizeBytes,
            s3Key: message.file.s3Key,
            encryptedFileKey: message.file.encryptedFileKey,
          } : null,
          roomId: roomId.toString(),
          readBy: message.readBy.map(u => u._id.toString()),
          createdAt: message.createdAt.toISOString(),
        };

        // Broadcast to ENTIRE room including sender
        // This ensures sender sees their own message
        io.in(roomId).emit('message:new', messageEvent);

        // Acknowledge to sender
        ack?.({ 
          ok: true, 
          messageId: message._id.toString(),
          createdAt: message.createdAt.toISOString()
        });

      } catch (err) {
        ack?.(serializeError(err));
      }
    });

    // ── typing:start ────────────────────────────────────────────────────────
    socket.on('typing:start', (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      emitTypingUpdate(socket, roomId, true);

      const key = `${roomId}:${user._id}`;
      clearTypingTimer(key);
      typingTimers.set(
        key,
        setTimeout(() => {
          emitTypingUpdate(socket, roomId, false);
          typingTimers.delete(key);
        }, TYPING_TIMEOUT_MS)
      );
    });

    // ── typing:stop ─────────────────────────────────────────────────────────
    socket.on('typing:stop', (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      const key = `${roomId}:${user._id}`;
      clearTypingTimer(key);
      emitTypingUpdate(socket, roomId, false);
    });

    // ── read:mark ───────────────────────────────────────────────────────────
    socket.on('read:mark', async (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      try {
        await markRoomAsRead(roomId, user._id);
        
        // Notify others in the room
        socket.to(roomId).emit('read:update', {
          userId: user._id.toString(),
          roomId: roomId.toString(),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('[socket] read:mark error:', err.message);
      }
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.info(`[socket] - ${user.username} (${socket.id}) reason=${reason}`);

      // Cancel all typing timers for this user
      for (const [key] of typingTimers) {
        if (key.endsWith(`:${user._id}`)) {
          const roomId = key.split(':')[0];
          emitTypingUpdate(socket, roomId, false);
          clearTypingTimer(key);
        }
      }

      try {
        const isLast = await isLastSocketForUser(io, socket.id, user._id);
        if (isLast) {
          await setPresence(user._id, 'offline');
          socket.broadcast.emit('presence:update', {
            userId: user._id.toString(),
            presence: 'offline',
          });
        }
      } catch (err) {
        console.error('[socket] disconnect cleanup error:', err.message);
      }
    });
  });
}