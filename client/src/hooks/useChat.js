/**
 * hooks/useChat.js
 *
 * Primary chat hook. Manages the full lifecycle of a chat room:
 *   - Load room + message history via GraphQL
 *   - Join the Socket.io room (after GraphQL data arrives)
 *   - Send encrypted messages
 *   - Receive real-time messages and decrypt them
 *   - Typing indicators (debounced)
 *   - Presence updates
 *   - Read receipts
 *   - Paginated history loading
 *
 * E2EE: messages are encrypted before emit and decrypted on receipt.
 * The hook derives shared keys per sender and caches them to avoid
 * redundant ECDH operations.
 *
 * @param {string|null} roomId - ID of the room to join. null = no active room.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { gql, QUERIES, getFileDownloadUrl } from '../utils/api.js';
import {
  getSocket,
  joinRoom,
  leaveRoom,
  sendMessage as socketSendMessage,
  emitTypingStart,
  emitTypingStop,
  markRoomRead,
} from '../utils/socket.js';
import {
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  decryptFile,
} from '../utils/crypto.js';
import { useAuth } from '../context/AuthContext.jsx';

const TYPING_DEBOUNCE_MS = 300;

export function useChat(roomId) {
  const { user } = useAuth();

  const [room,       setRoom]       = useState(null);
  const [messages,   setMessages]   = useState([]);
  const [members,    setMembers]    = useState([]);
  const [typing,     setTyping]     = useState({}); // { userId: username }
  const [presence,   setPresence]   = useState({}); // { userId: 'online'|'away'|'offline' }
  const [loading,    setLoading]    = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,    setHasMore]    = useState(true);
  const [error,      setError]      = useState(null);

  // Shared key cache: { userId → CryptoKey }
  // Avoids running ECDH on every incoming message from the same sender.
  const sharedKeyCache = useRef({});

  // Typing debounce timer ref
  const typingTimer = useRef(null);
  // Track whether we're currently "typing" to avoid redundant emits
  const isTyping = useRef(false);

  // ── Shared key helper ─────────────────────────────────────────────────────

  const getSharedKey = useCallback(async (senderId, senderPublicKey) => {
    if (sharedKeyCache.current[senderId]) {
      return sharedKeyCache.current[senderId];
    }
    if (!senderPublicKey) {
      throw new Error(`No public key available for user ${senderId}`);
    }
    const key = await deriveSharedKey(senderPublicKey);
    sharedKeyCache.current[senderId] = key;
    return key;
  }, []);

  // ── Decrypt a raw message from the server ─────────────────────────────────

  const decryptIncomingMessage = useCallback(async (msg, availableMembers = members) => {
    try {
      const isOwn = msg.sender.id === user?.id;
      let peerId, peerPubKey;

      if (isOwn) {
        // If we sent it, we must derive using the same key we used to encrypt it (the recipient's)
        const recipient = availableMembers.find((m) => m.id !== user.id) ?? availableMembers[0];
        if (!recipient) throw new Error('No recipient found');
        peerId = recipient.id;
        peerPubKey = recipient.publicKey;
      } else {
        // If they sent it, we derive using their key
        peerId = msg.sender.id;
        peerPubKey = msg.sender.publicKey;
      }

      const sharedKey = await getSharedKey(peerId, peerPubKey);
      const plaintext = await decryptMessage(msg.content, sharedKey);
      return { ...msg, plaintext, decryptError: null };
    } catch (err) {
      // Decryption failure is non-fatal — show a placeholder
      return { ...msg, plaintext: null, decryptError: err.message };
    }
  }, [getSharedKey, user, members]);

  // ── Load room + history via GraphQL ───────────────────────────────────────

  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);

    try {
      const data = await gql(QUERIES.ROOM, { id: roomId, limit: 20 });
      const r    = data.room;

      setRoom(r);
      setMembers(r.members);

      // Seed presence map from current member list
      const presenceMap = {};
      r.members.forEach((m) => { presenceMap[m.id] = m.presence; });
      setPresence(presenceMap);

      // Decrypt all history messages using the newly fetched members
      const decrypted = await Promise.all(r.messages.map(msg => decryptIncomingMessage(msg, r.members)));
      setMessages(decrypted);
      setHasMore(r.messages.length === 20);

      // Join the Socket.io room (server validates membership again)
      await joinRoom(roomId);
      markRoomRead(roomId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roomId, decryptIncomingMessage]);

  // ── Load older messages (pagination) ─────────────────────────────────────

  const loadMoreMessages = useCallback(async () => {
    if (!roomId || !hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);

    try {
      const oldest = messages[0];
      const data   = await gql(QUERIES.ROOM, {
        id:     roomId,
        limit:  20,
        before: oldest.createdAt,
      });
      const older = data.room.messages;

      if (older.length === 0) {
        setHasMore(false);
        return;
      }

      const decrypted = await Promise.all(older.map(decryptIncomingMessage));
      setMessages((prev) => [...decrypted, ...prev]);
      setHasMore(older.length === 20);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [roomId, hasMore, loadingMore, messages, decryptIncomingMessage]);

  // ── Send a message ────────────────────────────────────────────────────────

  /**
   * Encrypts and sends a plaintext message to the current room.
   * Stops any in-progress typing indicator.
   *
   * @param {string}      plaintext
   * @param {string|null} [fileId] - Optional file attachment ObjectId
   */
  const sendMessage = useCallback(async (plaintext, fileId = null) => {
    if (!roomId || !user) throw new Error('No active room or user.');

    // Stop typing indicator immediately on send
    stopTyping();

    // Find recipient's public key — for DMs this is the other member,
    // for group chats we encrypt for each member (simplified: use own key here
    // as a placeholder — full group key distribution is a future concern).
    // For now, find the first member who is not the sender.
    const recipient = members.find((m) => m.id !== user.id) ?? members[0];
    if (!recipient) throw new Error('No recipient found in room.');

    const sharedKey  = await getSharedKey(recipient.id, recipient.publicKey);
    const ciphertext = await encryptMessage(plaintext, sharedKey);

    await socketSendMessage({ roomId, content: ciphertext, fileId });
  }, [roomId, user, members, getSharedKey]);

  // ── Typing indicators ─────────────────────────────────────────────────────

  const startTyping = useCallback(() => {
    if (!roomId) return;

    if (!isTyping.current) {
      isTyping.current = true;
      emitTypingStart(roomId);
    }

    // Debounce: auto-stop after TYPING_DEBOUNCE_MS of silence
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      stopTyping();
    }, TYPING_DEBOUNCE_MS);
  }, [roomId]);

  const stopTyping = useCallback(() => {
    clearTimeout(typingTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      if (roomId) emitTypingStop(roomId);
    }
  }, [roomId]);

  // ── Socket event listeners ────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return;

    const socket = getSocket();

    // ── message:new ─────────────────────────────────────────────────────────
    const onMessage = async (msg) => {
      if (msg.roomId !== roomId) return;
      const decrypted = await decryptIncomingMessage(msg);
      setMessages((prev) => {
        // Deduplicate in case server echoes back our own optimistic message
        if (prev.some((m) => m.id === decrypted.id)) return prev;
        return [...prev, decrypted];
      });
      markRoomRead(roomId);
    };

    // ── typing:update ────────────────────────────────────────────────────────
    const onTyping = ({ userId, username, roomId: rid, isTyping: active }) => {
      if (rid !== roomId || userId === user?.id) return;
      setTyping((prev) => {
        if (active) return { ...prev, [userId]: username };
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };

    // ── presence:update ──────────────────────────────────────────────────────
    const onPresence = ({ userId, presence: p }) => {
      setPresence((prev) => ({ ...prev, [userId]: p }));
      // Mirror into members list
      setMembers((prev) =>
        prev.map((m) => m.id === userId ? { ...m, presence: p } : m)
      );
    };

    // ── read:update ──────────────────────────────────────────────────────────
    const onRead = ({ userId, roomId: rid }) => {
      if (rid !== roomId) return;
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          readBy: m.readBy?.some((r) => r.id === userId)
            ? m.readBy
            : [...(m.readBy ?? []), { id: userId }],
        }))
      );
    };

    socket.on('message:new',    onMessage);
    socket.on('typing:update',  onTyping);
    socket.on('presence:update', onPresence);
    socket.on('read:update',    onRead);

    return () => {
      socket.off('message:new',    onMessage);
      socket.off('typing:update',  onTyping);
      socket.off('presence:update', onPresence);
      socket.off('read:update',    onRead);
    };
  }, [roomId, user?.id, decryptIncomingMessage]);

  // ── Room join/leave lifecycle ─────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return;

    // Clear previous room state
    setMessages([]);
    setTyping({});
    setHasMore(true);
    sharedKeyCache.current = {};

    loadRoom();

    return () => {
      stopTyping();
      if (roomId) leaveRoom(roomId);
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File download helper ──────────────────────────────────────────────────

  /**
   * Downloads and decrypts a file attachment, then triggers browser download.
   *
   * @param {{ id, encryptedFileKey, originalName, mimeType, sender }} fileDoc
   */
  const downloadFile = useCallback(async (fileDoc) => {
    try {
      const { url, encryptedFileKey, originalName, mimeType } =
        await getFileDownloadUrl(fileDoc.id);

      const response       = await fetch(url);
      const encryptedBuffer = await response.arrayBuffer();

      const sharedKey    = await getSharedKey(fileDoc.sender.id, fileDoc.sender.publicKey);
      const decryptedBlob = await decryptFile(encryptedBuffer, encryptedFileKey, sharedKey, mimeType);

      // Trigger browser download
      const objectUrl = URL.createObjectURL(decryptedBlob);
      const a         = document.createElement('a');
      a.href          = objectUrl;
      a.download      = originalName;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('[useChat] file download failed:', err);
      throw err;
    }
  }, [getSharedKey]);

  return {
    room,
    messages,
    members,
    typing,       // { [userId]: username } — users currently typing
    presence,     // { [userId]: 'online'|'away'|'offline' }
    loading,
    loadingMore,
    hasMore,
    error,
    sendMessage,
    startTyping,
    stopTyping,
    loadMoreMessages,
    downloadFile,
  };
}