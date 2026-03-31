import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../hooks/useChat.js';
import MessageBubble from './MessageBubble.jsx';
import FileUpload from './FileUpload.jsx';

// ─── Icons ────────────────────────────────────────────────────────────────────
function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  );
}
function AttachIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}
function MembersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function HashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  );
}

export default function ChatWindow({ roomId }) {
  const { user } = useAuth();
  const {
    room, messages, members, typing,
    loading, loadingMore, hasMore, error,
    sendMessage, startTyping, stopTyping,
    loadMoreMessages, downloadFile,
  } = useChat(roomId);

  const [draft,       setDraft]       = useState('');
  const [showUpload,  setShowUpload]   = useState(false);
  const [pendingFile, setPendingFile]  = useState(null);
  const [sending,     setSending]      = useState(false);
  const [sendError,   setSendError]    = useState(null);

  const bottomRef        = useRef(null);
  const inputRef         = useRef(null);
  const listRef          = useRef(null);
  const prevScrollHeight = useRef(0);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Preserve scroll on pagination
  useEffect(() => {
    if (loadingMore) {
      prevScrollHeight.current = listRef.current?.scrollHeight ?? 0;
    } else if (prevScrollHeight.current) {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [loadingMore]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    if (listRef.current.scrollTop < 60 && hasMore && !loadingMore) {
      loadMoreMessages();
    }
  }, [hasMore, loadingMore, loadMoreMessages]);

  const handleDraftChange = (e) => {
    setDraft(e.target.value);
    if (e.target.value) startTyping(); else stopTyping();
  };

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

  // Typing string
  const typingNames = Object.values(typing);
  let typingLabel = '';
  if (typingNames.length === 1) typingLabel = `${typingNames[0]} is typing…`;
  else if (typingNames.length === 2) typingLabel = `${typingNames.join(' and ')} are typing…`;
  else if (typingNames.length > 2) typingLabel = 'Several people are typing…';

  const recipient = members.find((m) => m.id !== user?.id) ?? members[0];
  const canSend = (draft.trim() || pendingFile) && !sending;

  // ── Empty state
  if (!roomId) {
    return (
      <main style={styles.empty}>
        <div style={styles.emptyInner}>
          <div style={styles.emptyIcon}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p style={styles.emptyTitle}>Pick a channel</p>
          <p style={styles.emptySubtitle}>Select a channel from the sidebar to start chatting</p>
        </div>
      </main>
    );
  }

  // ── Loading
  if (loading) {
    return (
      <main style={styles.window}>
        <div style={styles.loadingCenter}>
          <div style={styles.spinner} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading messages…</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={styles.window}>
        <div style={styles.loadingCenter}>
          <span style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</span>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.window}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>
            {room?.type === 'private' ? <LockIcon /> : <HashIcon />}
          </span>
          <div>
            <div style={styles.headerName}>{room?.name}</div>
            {room?.description && (
              <div style={styles.headerDesc}>{room.description}</div>
            )}
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.memberPill}>
            <MembersIcon />
            <span>{members.length}</span>
          </div>
          <div style={styles.e2eeIndicator}>
            <span style={styles.e2eePulse} />
            Encrypted
          </div>
        </div>
      </div>

      {/* Message list */}
      <div style={styles.messageList} ref={listRef} onScroll={handleScroll}>
        {loadingMore && (
          <div style={styles.paginationSpinner}>
            <div style={styles.spinnerSm} /> Loading earlier messages…
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div style={styles.historyStart}>
            <div style={styles.historyLine} />
            <span>Beginning of #{room?.name}</span>
            <div style={styles.historyLine} />
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const showDate = !prev ||
            new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div style={styles.dateDivider}>
                  <div style={styles.historyLine} />
                  <span style={styles.dateDividerText}>
                    {new Date(msg.createdAt).toLocaleDateString([], {
                      weekday: 'long', month: 'long', day: 'numeric'
                    })}
                  </span>
                  <div style={styles.historyLine} />
                </div>
              )}
              <MessageBubble
                message={msg}
                isOwn={msg.sender.id === user?.id}
                onDownload={downloadFile}
              />
            </React.Fragment>
          );
        })}

        {/* Typing */}
        {typingLabel && (
          <div style={styles.typingRow}>
            <div style={styles.typingDots}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  ...styles.typingDot,
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </div>
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
              <span>📎 <strong>{pendingFile.originalName}</strong> ready to send</span>
              <button style={styles.removePending} onClick={() => setPendingFile(null)}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* Send error */}
      {sendError && <div style={styles.sendError}>{sendError}</div>}

      {/* Input bar */}
      <div style={styles.inputArea}>
        <div style={styles.inputWrap}>
          <button
            style={{
              ...styles.inputIconBtn,
              color: showUpload ? 'var(--accent)' : 'var(--text-muted)',
            }}
            onClick={() => setShowUpload((v) => !v)}
            title="Attach encrypted file"
          >
            <AttachIcon />
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
              background: canSend ? 'var(--accent)' : 'var(--surface-3)',
              color: canSend ? '#fff' : 'var(--text-muted)',
              cursor: canSend ? 'pointer' : 'default',
            }}
            onClick={handleSend}
            disabled={!canSend}
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        </div>

        <div style={styles.inputFooter}>
          <span style={styles.inputFooterDot} />
          End-to-end encrypted · Press Enter to send
        </div>
      </div>
    </main>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  window: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg)',
    minWidth: 0,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  emptyInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    maxWidth: 260,
    textAlign: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    background: 'var(--accent-dim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  emptySubtitle: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  loadingCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  spinner: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '2.5px solid var(--surface-3)',
    borderTop: '2.5px solid var(--accent)',
    animation: 'spin 0.7s linear infinite',
  },
  spinnerSm: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid var(--surface-3)',
    borderTop: '2px solid var(--accent)',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  },

  // Header
  header: {
    padding: '0 20px',
    height: 56,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    background: 'var(--surface)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
  },
  headerName: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.2px',
  },
  headerDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  memberPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-full)',
    padding: '4px 10px',
  },
  e2eeIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--success)',
    background: 'var(--success-dim)',
    padding: '4px 10px',
    borderRadius: 'var(--r-full)',
    border: '1px solid rgba(87,242,135,0.2)',
  },
  e2eePulse: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--success)',
    display: 'inline-block',
  },

  // Messages
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 0 8px',
    display: 'flex',
    flexDirection: 'column',
  },
  paginationSpinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-muted)',
    padding: '8px 0',
  },
  historyStart: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 20px 12px',
    fontSize: 11,
    color: 'var(--text-muted)',
    fontWeight: 600,
  },
  historyLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  dateDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
  },
  dateDividerText: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },

  // Typing
  typingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 20px 8px',
    minHeight: 28,
  },
  typingDots: {
    display: 'flex',
    gap: 3,
    alignItems: 'center',
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--text-muted)',
    display: 'inline-block',
    animation: 'typingBounce 1.2s ease infinite',
  },
  typingText: {
    fontSize: 12,
    color: 'var(--text-muted)',
    fontStyle: 'italic',
  },

  // File upload
  uploadPanel: {
    padding: '0 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  pendingFile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 13,
    color: 'var(--text-secondary)',
    padding: '6px 0 8px',
  },
  removePending: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
    fontFamily: 'var(--font)',
  },
  sendError: {
    fontSize: 12,
    color: 'var(--danger)',
    background: 'rgba(237,66,69,0.1)',
    padding: '6px 20px',
    flexShrink: 0,
  },

  // Input area
  inputArea: {
    padding: '12px 16px 10px',
    borderTop: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '6px 6px 6px 12px',
    transition: 'border-color var(--t-fast)',
  },
  inputIconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: 'var(--r-sm)',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    alignSelf: 'flex-end',
    marginBottom: 2,
    transition: 'color var(--t-fast)',
  },
  textarea: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'var(--font)',
    resize: 'none',
    lineHeight: 1.5,
    padding: '6px 0',
    maxHeight: 120,
    overflowY: 'auto',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 'var(--r-md)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background var(--t-fast), color var(--t-fast)',
  },
  inputFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '5px 4px 0',
    fontWeight: 500,
  },
  inputFooterDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--success)',
    display: 'inline-block',
    flexShrink: 0,
  },
};