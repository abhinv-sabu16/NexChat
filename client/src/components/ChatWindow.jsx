/**
 * components/ChatWindow.jsx
 *
 * The main chat area. Composes:
 *   - Message history (scrollable, paginated)
 *   - Typing indicator bar
 *   - Message input with send button
 *   - File upload panel toggle
 *
 * Props:
 *   roomId  {string|null}  Active room ID — null renders an empty state
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../hooks/useChat.js';
import MessageBubble from './MessageBubble.jsx';
import FileUpload from './FileUpload.jsx';

export default function ChatWindow({ roomId }) {
  const { user }  = useAuth();
  const {
    room, messages, members, typing,
    loading, loadingMore, hasMore, error,
    sendMessage, startTyping, stopTyping,
    loadMoreMessages, downloadFile,
  } = useChat(roomId);

  const [draft,       setDraft]       = useState('');
  const [showUpload,  setShowUpload]   = useState(false);
  const [pendingFile, setPendingFile]  = useState(null); // file doc before send
  const [sending,     setSending]      = useState(false);
  const [sendError,   setSendError]    = useState(null);

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const listRef      = useRef(null);
  const prevScrollHeight = useRef(0);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // ── Preserve scroll position when loading older messages ─────────────────

  useEffect(() => {
    if (loadingMore) {
      prevScrollHeight.current = listRef.current?.scrollHeight ?? 0;
    } else if (prevScrollHeight.current) {
      const el   = listRef.current;
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [loadingMore]);

  // ── Scroll → load more ────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    if (listRef.current.scrollTop < 60 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  // ── Typing detection ──────────────────────────────────────────────────────

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    if (e.target.value) startTyping(); else stopTyping();
  };

  // ── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !pendingFile) || sending) return;

    setSending(true);
    setSendError(null);

    try {
      await sendMessage(text || '📎 File attachment', pendingFile?.id ?? null);
      setDraft('');
      setPendingFile(null);
      setShowUpload(false);
      stopTyping();
      inputRef.current?.focus();
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Typing indicator string ───────────────────────────────────────────────

  const typingNames = Object.values(typing);
  let typingLabel   = '';
  if (typingNames.length === 1) typingLabel = `${typingNames[0]} is typing…`;
  else if (typingNames.length === 2) typingLabel = `${typingNames.join(' and ')} are typing…`;
  else if (typingNames.length > 2)   typingLabel = 'Several people are typing…';

  // ── Recipient for file upload ─────────────────────────────────────────────
  // In a DM this is the other member; for group we use the first other member.

  const recipient = members.find((m) => m.id !== user?.id) ?? members[0];

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!roomId) {
    return (
      <main style={styles.empty}>
        <span style={styles.emptyIcon}>💬</span>
        <p style={styles.emptyText}>Select a room to start chatting</p>
      </main>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main style={styles.window}>
        <div style={styles.header}><span style={styles.roomName}>Loading…</span></div>
        <div style={styles.loadingCenter}>Loading messages…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.window}>
        <div style={styles.header}><span style={styles.roomName}>Error</span></div>
        <div style={{ ...styles.loadingCenter, color: '#f87171' }}>{error}</div>
      </main>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <main style={styles.window}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.roomIcon}>{room?.type === 'private' ? '🔒' : '#'}</span>
        <span style={styles.roomName}>{room?.name}</span>
        {room?.description && (
          <span style={styles.roomDescription}>{room.description}</span>
        )}
        <span style={styles.memberCount}>{members.length} members</span>
      </div>

      {/* Message list */}
      <div style={styles.messageList} ref={listRef} onScroll={handleScroll}>
        {/* Load-more spinner */}
        {loadingMore && (
          <div style={styles.loadMore}>Loading earlier messages…</div>
        )}

        {/* Top-of-history indicator */}
        {!hasMore && messages.length > 0 && (
          <div style={styles.topOfHistory}>Beginning of conversation</div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.sender.id === user?.id}
            onDownload={downloadFile}
          />
        ))}

        {/* Typing indicator */}
        {typingLabel && (
          <div style={styles.typingBar}>
            <span style={styles.typingDots}>
              <span /><span /><span />
            </span>
            <span style={styles.typingText}>{typingLabel}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* File upload panel */}
      {showUpload && (
        <div style={styles.uploadPanel}>
          <FileUpload
            roomId={roomId}
            recipient={recipient}
            onUploaded={(fileDoc) => {
              setPendingFile(fileDoc);
              setShowUpload(false);
            }}
            onCancel={() => setShowUpload(false)}
          />
          {pendingFile && (
            <div style={styles.pendingFile}>
              📎 <strong>{pendingFile.originalName}</strong> ready to send
              <button
                style={styles.removePending}
                onClick={() => setPendingFile(null)}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Send error */}
      {sendError && (
        <div style={styles.sendError}>{sendError}</div>
      )}

      {/* Input bar */}
      <div style={styles.inputBar}>
        <button
          style={{
            ...styles.iconBtn,
            ...(showUpload ? styles.iconBtnActive : {}),
          }}
          onClick={() => setShowUpload((v) => !v)}
          title="Attach encrypted file"
          aria-label="Attach file"
        >
          📎
        </button>

        <textarea
          ref={inputRef}
          style={styles.textarea}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${room?.name ?? ''}…`}
          rows={1}
          disabled={sending}
        />

        <button
          style={{
            ...styles.sendBtn,
            opacity: (!draft.trim() && !pendingFile) || sending ? 0.4 : 1,
          }}
          onClick={handleSend}
          disabled={(!draft.trim() && !pendingFile) || sending}
          title="Send (Enter)"
          aria-label="Send message"
        >
          {sending ? '…' : '➤'}
        </button>
      </div>
    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  window: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    overflow:      'hidden',
    backgroundColor: '#16162a',
  },
  empty: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: '#16162a',
    color:          '#5050a0',
    gap:            12,
  },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, margin: 0 },
  loadingCenter: {
    flex:           1,
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    color:          '#6060a0',
    fontSize:       14,
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    padding:         '10px 16px',
    borderBottom:    '1px solid #2a2a4e',
    backgroundColor: '#1a1a2e',
    flexShrink:      0,
  },
  roomIcon:        { fontSize: 14 },
  roomName:        { fontWeight: 600, color: '#e0e0ff', fontSize: 15 },
  roomDescription: { fontSize: 12, color: '#6060a0', flex: 1 },
  memberCount:     { fontSize: 12, color: '#5050a0', marginLeft: 'auto' },
  messageList: {
    flex:      1,
    overflowY: 'auto',
    padding:   '12px 0',
    display:   'flex',
    flexDirection: 'column',
  },
  loadMore: {
    textAlign:  'center',
    fontSize:   12,
    color:      '#5050a0',
    padding:    '8px 0',
  },
  topOfHistory: {
    textAlign:   'center',
    fontSize:    12,
    color:       '#4a4a7a',
    padding:     '8px 0 4px',
    borderTop:   '1px solid #2a2a4a',
    margin:      '0 16px 8px',
  },
  typingBar: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    padding:    '4px 20px',
    minHeight:  24,
  },
  typingDots: {
    display: 'flex',
    gap:     3,
  },
  typingText: {
    fontSize: 12,
    color:    '#7070b0',
    fontStyle: 'italic',
  },
  uploadPanel: {
    padding:      '0 12px',
    borderTop:    '1px solid #2a2a4e',
    flexShrink:   0,
  },
  pendingFile: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    fontSize:   13,
    color:      '#a0a0d0',
    padding:    '4px 0 8px',
  },
  removePending: {
    background: 'none',
    border:     'none',
    color:      '#7070a0',
    cursor:     'pointer',
    fontSize:   14,
    padding:    '0 4px',
  },
  sendError: {
    fontSize:        13,
    color:           '#f87171',
    backgroundColor: '#2a1a1a',
    padding:         '6px 16px',
    flexShrink:      0,
  },
  inputBar: {
    display:         'flex',
    alignItems:      'flex-end',
    gap:             8,
    padding:         '10px 12px',
    borderTop:       '1px solid #2a2a4e',
    backgroundColor: '#1a1a2e',
    flexShrink:      0,
  },
  iconBtn: {
    background:   'none',
    border:       '1px solid transparent',
    borderRadius: 6,
    cursor:       'pointer',
    fontSize:     18,
    padding:      '4px 6px',
    color:        '#7070b0',
    flexShrink:   0,
    alignSelf:    'flex-end',
    marginBottom: 2,
    transition:   'border-color 0.1s',
  },
  iconBtnActive: {
    borderColor: '#5b3fa8',
    color:       '#9b7fe8',
  },
  textarea: {
    flex:            1,
    resize:          'none',
    backgroundColor: '#2a2a4e',
    border:          '1px solid #3a3a6e',
    borderRadius:    8,
    padding:         '9px 12px',
    color:           '#e0e0ff',
    fontSize:        14,
    fontFamily:      'inherit',
    lineHeight:      1.45,
    outline:         'none',
    maxHeight:       120,
    overflowY:       'auto',
  },
  sendBtn: {
    width:           36,
    height:          36,
    borderRadius:    '50%',
    backgroundColor: '#5b3fa8',
    border:          'none',
    color:           '#fff',
    fontSize:        16,
    cursor:          'pointer',
    flexShrink:      0,
    alignSelf:       'flex-end',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    transition:      'opacity 0.15s',
  },
};