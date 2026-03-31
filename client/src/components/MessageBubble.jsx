import React from 'react';

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export default function MessageBubble({ message, isOwn, onDownload }) {
  const { sender, plaintext, decryptError, createdAt, file, readBy } = message;

  const hasFile    = Boolean(file);
  const isDecrypted = plaintext !== null && !decryptError;

  return (
    <div style={{
      ...styles.wrapper,
      flexDirection: isOwn ? 'row-reverse' : 'row',
      padding: isOwn ? '2px 20px 2px 60px' : '2px 60px 2px 20px',
      animation: 'fadeIn 0.15s ease',
    }}>
      {/* Avatar */}
      {!isOwn && (
        <div style={styles.avatar} aria-hidden="true">
          {sender.username[0].toUpperCase()}
        </div>
      )}

      <div style={{ maxWidth: '100%', minWidth: 0 }}>
        {/* Sender name + time */}
        {!isOwn && (
          <div style={styles.metaRow}>
            <span style={styles.senderName}>{sender.username}</span>
            <span style={styles.timestamp}>{formatTime(createdAt)}</span>
          </div>
        )}

        {/* Bubble */}
        <div style={{
          ...styles.bubble,
          ...(isOwn ? styles.bubbleOwn : styles.bubbleOther),
          ...(decryptError ? styles.bubbleError : {}),
        }}>
          {/* File attachment */}
          {hasFile && (
            <button
              style={styles.fileCard}
              onClick={() => onDownload?.({ ...file, sender })}
              title="Download and decrypt"
            >
              <div style={styles.fileIconWrap}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div style={styles.fileInfo}>
                <span style={styles.fileName}>{file.originalName}</span>
                <span style={styles.fileMeta}>{file.mimeType} · {formatSize(file.sizeBytes)}</span>
              </div>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <DownloadIcon />
              </span>
            </button>
          )}

          {/* Message text */}
          {decryptError ? (
            <span style={styles.decryptError}>
              🔒 Unable to decrypt message
            </span>
          ) : (
            <span style={styles.msgText}>{plaintext}</span>
          )}
        </div>

        {/* Own message: time + read receipt */}
        {isOwn && (
          <div style={styles.ownMeta}>
            <span style={styles.timestamp}>{formatTime(createdAt)}</span>
            {readBy?.length > 0 && (
              <span style={styles.readTick} title={`Read by ${readBy.length}`}>✓✓</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(104,82,214,0.2)',
    border: '1.5px solid rgba(104,82,214,0.3)',
    color: 'var(--accent)',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 20,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 3,
    paddingLeft: 2,
  },
  senderName: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.1px',
  },
  timestamp: {
    fontSize: 11,
    color: 'var(--text-muted)',
    fontWeight: 500,
  },
  ownMeta: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    paddingRight: 2,
  },
  readTick: {
    fontSize: 12,
    color: 'var(--accent)',
    fontWeight: 700,
  },

  // Bubbles
  bubble: {
    borderRadius: 16,
    padding: '9px 13px',
    wordBreak: 'break-word',
    lineHeight: 1.5,
    maxWidth: '100%',
  },
  bubbleOther: {
    background: 'var(--surface)',
    color: 'var(--text-primary)',
    borderBottomLeftRadius: 4,
    border: '1px solid var(--border)',
  },
  bubbleOwn: {
    background: 'var(--accent)',
    color: '#fff',
    borderBottomRightRadius: 4,
  },
  bubbleError: {
    background: 'rgba(237,66,69,0.1)',
    border: '1px solid rgba(237,66,69,0.25)',
  },
  msgText: {
    fontSize: 14,
    lineHeight: 1.5,
  },
  decryptError: {
    fontSize: 13,
    color: 'var(--danger)',
    fontStyle: 'italic',
  },

  // File card
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '8px 10px',
    marginBottom: 6,
    cursor: 'pointer',
    color: 'inherit',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'var(--font)',
  },
  fileIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    background: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  fileName: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: 11,
    opacity: 0.65,
  },
};