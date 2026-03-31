/**
 * utils/socket.js
 *
 * Socket.io client singleton.
 * Token is injected into handshake.auth so the server's socketAuthMiddleware
 * can verify it before the connection is accepted.
 *
 * Exports typed wrappers for every server event so components never
 * construct raw event strings directly.
 */

import { io } from 'socket.io-client';
import { getAccessToken } from './api.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL?? 'http://localhost:4000';

// ─── Singleton socket instance ────────────────────────────────────────────────

let socket = null;

/**
 * Creates (or returns existing) authenticated Socket.io connection.
 * Must be called after login when a valid access token is available.
 *
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket() {
  if (socket?.connected) return socket;

  socket = io(SERVER_URL, {
    // JWT passed in handshake — verified by socketAuthMiddleware on the server
    auth: { token: getAccessToken() },

    // Reconnection with exponential backoff (max 5 retries)
    reconnection:        true,
    reconnectionAttempts: 5,
    reconnectionDelay:   1_000,
    reconnectionDelayMax: 10_000,

    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () =>
    console.info('[socket] connected:', socket.id)
  );
  socket.on('disconnect', (reason) =>
    console.info('[socket] disconnected:', reason)
  );
  socket.on('connect_error', (err) =>
    console.warn('[socket] connection error:', err.message)
  );

  return socket;
}

/**
 * Disconnects and destroys the socket.
 * Call on logout.
 */
export function destroySocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// ─── Typed emitters ───────────────────────────────────────────────────────────
// Wrappers return a Promise that resolves with the server's ack payload,
// or rejects if the ack indicates failure or times out.

const ACK_TIMEOUT_MS = 8_000;

function emitWithAck(event, payload) {
  return new Promise((resolve, reject) => {
    const s = getSocket();

    const timer = setTimeout(
      () => reject(new Error(`Socket ack timeout: ${event}`)),
      ACK_TIMEOUT_MS
    );

    s.emit(event, payload, (ack) => {
      clearTimeout(timer);
      if (ack?.ok === false) {
        reject(new Error(ack.error ?? `Socket event failed: ${event}`));
      } else {
        resolve(ack);
      }
    });
  });
}

/**
 * Join a Socket.io room after loading it via GraphQL.
 * Server verifies membership before allowing the join.
 *
 * @param {string} roomId
 */
export function joinRoom(roomId) {
  return emitWithAck('join:room', { roomId });
}

/**
 * Leave a room.
 * @param {string} roomId
 */
export function leaveRoom(roomId) {
  getSocket().emit('leave:room', { roomId });
}

/**
 * Send an encrypted message. Content must be pre-encrypted ciphertext.
 *
 * @param {{ roomId: string, content: string, fileId?: string }}
 */
export function sendMessage({ roomId, content, fileId = null }) {
  return emitWithAck('message:send', { roomId, content, fileId });
}

/**
 * Notify room peers that this user started typing.
 * @param {string} roomId
 */
export function emitTypingStart(roomId) {
  getSocket().emit('typing:start', { roomId });
}

/**
 * Notify room peers that this user stopped typing.
 * @param {string} roomId
 */
export function emitTypingStop(roomId) {
  getSocket().emit('typing:stop', { roomId });
}

/**
 * Mark all messages in a room as read.
 * @param {string} roomId
 */
export function markRoomRead(roomId) {
  getSocket().emit('read:mark', { roomId });
}