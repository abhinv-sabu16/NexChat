/**
 * sockets/chat.socket.js
 *
 * All real-time features. Pure event orchestration — no DB or model imports.
 *
 * Auth:        socketAuthMiddleware      — middleware/auth (shared with REST + GQL)
 * Membership:  assertMembership          — services/roomService
 * Messages:    createMessage,
 *              markRoomAsRead            — services/messageService
 * Presence:    setPresence,
 *              isLastSocketForUser       — services/userService
 * Validation:  validate + schemas        — lib/validators
 *
 * Security model:
 *   - Every connection is authenticated at the handshake (socketAuthMiddleware)
 *   - Every room action verifies membership via assertMembership BEFORE socket.join()
 *   - All payloads are validated with Zod before reaching services
 *   - Errors are caught and returned via ack callbacks — never crash the server
 */

import { socketAuthMiddleware }          from '../middleware/auth.js';
import { assertMembership }              from '../services/roomService.js';
import { createMessage, markRoomAsRead } from '../services/messageService.js';
import { setPresence, isLastSocketForUser } from '../services/userService.js';
import { validate, SendMessageSchema, JoinRoomSchema } from '../lib/validators.js';
import { TYPING_TIMEOUT_MS }             from '../lib/constants.js';
import { AppError }                      from '../lib/errors.js';

// ─── Typing debounce registry ─────────────────────────────────────────────────
// Key: `${roomId}:${userId}` → NodeJS.Timeout
// Scoped to module — persists across connections, cleared on disconnect.

const typingTimers = new Map();

// ─── Error serializer ─────────────────────────────────────────────────────────

/**
 * Serialises any error into a safe ack payload.
 * AppError subclasses expose their message; unknown errors return a generic message.
 */
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
    userId:   socket.user._id,
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
  // ── Authentication middleware ─────────────────────────────────────────────
  // Every connection must carry a valid JWT in handshake.auth.token.
  // Uses the same getUserFromToken() as REST and GraphQL — zero duplication.
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const { user } = socket;
    console.info(`[socket] + ${user.username} (${socket.id})`);

    // Mark user online; broadcast to all other connected clients
    await setPresence(user._id, 'online');
    socket.broadcast.emit('presence:update', { userId: user._id, presence: 'online' });

    // ── join:room ───────────────────────────────────────────────────────────
    /**
     * Client must call this after loading a room via GraphQL.
     *
     * Security: assertMembership runs BEFORE socket.join().
     * A user who is not a room member never enters the Socket.io room,
     * meaning they can never receive any message:new or typing:update events.
     *
     * Payload: { roomId: string }
     * Ack:     { ok: true } | { ok: false, error: string, code: string }
     */
    socket.on('join:room', async (payload, ack) => {
      try {
        const { roomId } = validate(JoinRoomSchema, payload ?? {});

        // ✅ Membership verified BEFORE socket.join — this is the security gate
        await assertMembership(roomId, user._id);

        socket.join(roomId);

        // Mark all existing messages as read on join
        await markRoomAsRead(roomId, user._id);

        ack?.({ ok: true });
      } catch (err) {
        ack?.(serializeError(err));
      }
    });

    // ── leave:room ──────────────────────────────────────────────────────────
    /**
     * Graceful room exit. No auth check needed — leaving is always permitted.
     * Also stops any in-progress typing indicator.
     */
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
    /**
     * Send an encrypted message to a room.
     *
     * E2EE contract: `content` is AES-256-GCM ciphertext ("iv:ct" base64).
     * This handler stores and broadcasts it without reading or modifying it.
     *
     * Payload: { roomId: string, content: string, fileId?: string }
     * Ack:     { ok: true, messageId: string } | { ok: false, error, code }
     *
     * Flow:
     *   1. Validate payload (Zod)
     *   2. assertMembership (throws ForbiddenError if not a member)
     *   3. createMessage (service → DB write)
     *   4. io.to(roomId).emit — broadcast to all room members
     *   5. ack sender
     */
    socket.on('message:send', async (payload, ack) => {
      try {
        const { roomId, content, fileId } = validate(SendMessageSchema, payload ?? {});

        // createMessage internally calls assertMembership — one DB round trip
        const message = await createMessage({
          content,
          senderId: user._id,
          roomId,
          fileId:   fileId ?? null,
        });

        // Broadcast the full shaped event to all clients in the room
        io.to(roomId).emit('message:new', {
          id:        message._id.toString(),
          content:   message.content,
          sender: {
            id:        message.sender._id.toString(),
            username:  message.sender.username,
            publicKey: message.sender.publicKey,
          },
          file:      message.file ?? null,
          roomId,
          createdAt: message.createdAt.toISOString(),
        });

        ack?.({ ok: true, messageId: message._id.toString() });
      } catch (err) {
        ack?.(serializeError(err));
      }
    });

    // ── typing:start ────────────────────────────────────────────────────────
    /**
     * Broadcast that this user started typing.
     * Auto-stops after TYPING_TIMEOUT_MS with no further events (debounce).
     * No DB access — pure in-memory state.
     */
    socket.on('typing:start', (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      emitTypingUpdate(socket, roomId, true);

      const key = `${roomId}:${user._id}`;
      clearTypingTimer(key); // reset debounce on each keystroke
      typingTimers.set(
        key,
        setTimeout(() => {
          emitTypingUpdate(socket, roomId, false);
          typingTimers.delete(key);
        }, TYPING_TIMEOUT_MS)
      );
    });

    // ── typing:stop ─────────────────────────────────────────────────────────
    /**
     * Explicit stop (e.g. message sent, user blurred input).
     * Cancels the debounce timer and immediately notifies room.
     */
    socket.on('typing:stop', (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      const key = `${roomId}:${user._id}`;
      clearTypingTimer(key);
      emitTypingUpdate(socket, roomId, false);
    });

    // ── read:mark ───────────────────────────────────────────────────────────
    /**
     * Mark all messages in a room as read by this user.
     * Notifies room peers so they can update read-receipt UI.
     */
    socket.on('read:mark', async (payload) => {
      const roomId = payload?.roomId;
      if (!roomId) return;

      try {
        await markRoomAsRead(roomId, user._id);
        socket.to(roomId).emit('read:update', {
          userId: user._id.toString(),
          roomId,
        });
      } catch (err) {
        // read:mark has no ack — just log
        console.error('[socket] read:mark error:', err.message);
      }
    });

    // ── disconnect ──────────────────────────────────────────────────────────
    /**
     * Clean up:
     *   1. Cancel all typing timers for this user
     *   2. If this was the user's last socket, mark them offline
     */
    socket.on('disconnect', async (reason) => {
      console.info(`[socket] - ${user.username} (${socket.id}) reason=${reason}`);

      // Cancel any pending typing timers for this user across all rooms
      for (const [key] of typingTimers) {
        if (key.endsWith(`:${user._id}`)) {
          clearTypingTimer(key);
        }
      }

      try {
        const isLast = await isLastSocketForUser(io, socket.id, user._id);
        if (isLast) {
          await setPresence(user._id, 'offline');
          socket.broadcast.emit('presence:update', {
            userId:   user._id.toString(),
            presence: 'offline',
          });
        }
      } catch (err) {
        console.error('[socket] disconnect cleanup error:', err.message);
      }
    });
  });
}