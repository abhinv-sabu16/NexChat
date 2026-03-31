// client/hooks/useChat.js — React hook for real-time chat
import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  loadPrivateKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  encryptFile,
} from '../utils/crypto';

const SOCKET_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

// ──────────────────────────────────────────────
// useChat hook
// ──────────────────────────────────────────────
export function useChat({ token, userId, roomId }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [error, setError] = useState(null);

  // Shared key cache: recipientId → CryptoKey
  const sharedKeyCache = useRef(new Map());
  const typingTimerRef = useRef(null);

  // ── Connect on mount ───────────────────────────
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        // Server forced disconnect — don't auto-reconnect
        setError('Disconnected by server');
      }
    });

    socket.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
    });

    // Presence updates
    socket.on('presence:update', ({ userId: uid, status }) => {
      setOnlineUsers((prev) => ({ ...prev, [uid]: status }));
    });

    // Typing indicators
    socket.on('typing:update', ({ userId: uid, username, roomId: rid, isTyping }) => {
      if (rid !== roomId) return;
      setTypingUsers((prev) =>
        isTyping
          ? prev.includes(username) ? prev : [...prev, username]
          : prev.filter((u) => u !== username)
      );
    });

    // Reactions
    socket.on('reaction:update', ({ messageId, reactions }) => {
      setMessages((prev) =>
        prev.map((m) => m._id === messageId ? { ...m, reactions } : m)
      );
    });

    // Read receipts
    socket.on('receipts:update', ({ userId: uid, lastReadMessageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id <= lastReadMessageId
            ? { ...m, readBy: [...(m.readBy || []), uid] }
            : m
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // ── Join/leave room ────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    setMessages([]);
    setTypingUsers([]);
    socket.emit('room:join', { roomId });

    // Receive history
    socket.on('room:history', async (history) => {
      const decrypted = await Promise.all(history.map(decryptIncoming));
      setMessages(decrypted);
    });

    // Real-time new message
    socket.on('message:new', async (msg) => {
      const decrypted = await decryptIncoming(msg);
      setMessages((prev) => [...prev, decrypted]);
    });

    return () => {
      socket.emit('room:leave', { roomId });
      socket.off('room:history');
      socket.off('message:new');
    };
  }, [roomId]);

  // ── Decrypt incoming message ───────────────────
  const decryptIncoming = useCallback(async (msg) => {
    try {
      const key = await getSharedKey(msg.sender._id);
      const plaintext = await decryptMessage(msg.encryptedContent, msg.iv, key);
      return { ...msg, content: plaintext, decrypted: true };
    } catch {
      return { ...msg, content: '[Unable to decrypt]', decrypted: false };
    }
  }, []);

  // ── Get or derive shared key ───────────────────
  async function getSharedKey(recipientId) {
    if (sharedKeyCache.current.has(recipientId)) {
      return sharedKeyCache.current.get(recipientId);
    }

    // Fetch recipient's public key from server
    const res = await fetch(`/api/users/${recipientId}/public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { publicKeyJwk } = await res.json();

    const myPrivateKeyJwk = await loadPrivateKey();
    const sharedKey = await deriveSharedKey(myPrivateKeyJwk, publicKeyJwk);
    sharedKeyCache.current.set(recipientId, sharedKey);
    return sharedKey;
  }

  // ── Send a text message ────────────────────────
  const sendMessage = useCallback(async (text, recipientId) => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    const tempId = `temp-${Date.now()}`;
    const sharedKey = await getSharedKey(recipientId || userId);

    const { encryptedContent, iv } = await encryptMessage(text, sharedKey);

    // Optimistic update
    setMessages((prev) => [
      ...prev,
      {
        _id: tempId,
        roomId,
        sender: { _id: userId },
        content: text,
        encryptedContent,
        iv,
        type: 'text',
        createdAt: new Date().toISOString(),
        status: 'sending',
      },
    ]);

    socket.emit('message:send', {
      tempId,
      roomId,
      encryptedContent,
      iv,
      type: 'text',
    });

    // Replace temp message with server-confirmed one
    socket.once('message:ack', ({ tempId: tid, messageId }) => {
      setMessages((prev) =>
        prev.map((m) => m._id === tid ? { ...m, _id: messageId, status: 'sent' } : m)
      );
    });
  }, [roomId, userId, token]);

  // ── Send a file ─────────────────────────────────
  const sendFile = useCallback(async (file, recipientId) => {
    const socket = socketRef.current;
    if (!socket || !roomId) return;

    const sharedKey = await getSharedKey(recipientId || userId);
    const fileBuffer = await file.arrayBuffer();

    const { encryptedFile, encryptedFileKey, iv, fileKeyIv } =
      await encryptFile(fileBuffer, sharedKey);

    // Upload encrypted file to server
    const formData = new FormData();
    formData.append('file', new Blob([encryptedFile]), file.name);
    formData.append('encryptedFileKey', encryptedFileKey);
    formData.append('iv', iv);
    formData.append('fileKeyIv', fileKeyIv);

    const res = await fetch('/api/files/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const { fileId, url } = await res.json();

    // Send file message
    const { encryptedContent, iv: msgIv } = await encryptMessage(
      JSON.stringify({ fileId, url, name: file.name, size: file.size, type: file.type }),
      sharedKey
    );

    socket.emit('message:send', {
      roomId,
      encryptedContent,
      iv: msgIv,
      type: 'file',
      fileMetadata: {
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        encryptedFileKey,
        fileKeyIv,
      },
    });
  }, [roomId, userId, token]);

  // ── Typing indicator ───────────────────────────
  const startTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('typing:start', { roomId });
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => stopTyping(), 3000);
  }, [roomId]);

  const stopTyping = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('typing:stop', { roomId });
    clearTimeout(typingTimerRef.current);
  }, [roomId]);

  // ── Add reaction ───────────────────────────────
  const addReaction = useCallback((messageId, emoji) => {
    socketRef.current?.emit('reaction:add', { messageId, emoji });
  }, []);

  return {
    connected,
    messages,
    typingUsers,
    onlineUsers,
    error,
    sendMessage,
    sendFile,
    startTyping,
    stopTyping,
    addReaction,
  };
}
