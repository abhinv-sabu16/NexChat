/**
 * components/MessageBubble.jsx
 *
 * Renders a single chat message.
 *
 * Props:
 *   message     {object}   Message document (with `plaintext` and `decryptError`)
 *   isOwn       {boolean}  True if the current user sent this message
 *   onDownload  {function} Called with the file doc when user clicks download
 */

import React from 'react';

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MessageBubble({ message, isOwn, onDownload }) {
  const { sender, plaintext, decryptError, createdAt, file, readBy } = message;

  const hasFile    = Boolean(file);
  const isDecrypted = plaintext !== null && !decryptError;

  return (
    <div style={{ ...styles.wrapper, justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
      {/* Avatar — only show for others */}
      {!isOwn && (
        <div style={styles.avatar} aria-hidden="true">
          {sender.username[0].toUpperCase()}
        </div>
      )}

      <div style={{ maxWidth: '72%' }}>
        {/* Sender name — only show for others */}
        {!isOwn && (
          <span style={styles.senderName}>{sender.username}</span>
        )}

        <div
          style={{
            ...styles.bubble,
            ...(isOwn ? styles.bubbleOwn : styles.bubbleOther),
            ...(decryptError ? styles.bubbleError : {}),
          }}
        >
          {/* File attachment */}
          {hasFile && (
            <button
              style={styles.fileAttachment}
              onClick={() => onDownload?.({ ...file, sender })}
              title="Click to download and decrypt"
            >
              <span style={styles.fileIcon}>📎</span>
              <span style={styles.fileInfo}>
                <span style={styles.fileName}>{file.originalName}</span>
                <span style={styles.fileMeta}>
                  {file.mimeType} · {formatSize(file.sizeBytes)}
                </span>
              </span>
              <span style={styles.downloadIcon}>⬇</span>
            </button>
          )}

          {/* Message content */}
          {decryptError ? (
            <span style={styles.decryptError} title={decryptError}>
              🔒 Unable to decrypt message
            </span>
          ) : (
            <span style={styles.text}>{plaintext}</span>
          )}
        </div>

        {/* Timestamp + read receipts */}
        <div style={{ ...styles.meta, textAlign: isOwn ? 'right' : 'left' }}>
          <span>{formatTime(createdAt)}</span>
          {isOwn && readBy?.length > 0 && (
            <span style={styles.readTick} title={`Read by ${readBy.length}`}>
              ✓✓
            </span>
          )}
        </div>
      </div>

      {/* Own avatar */}
      {isOwn && (
        <div style={{ ...styles.avatar, ...styles.avatarOwn }} aria-hidden="true">
          {sender.username[0].toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display:    'flex',
    alignItems: 'flex-end',
    gap:        8,
    padding:    '2px 16px',
  },
  avatar: {
    width:           28,
    height:          28,
    borderRadius:    '50%',
    backgroundColor: '#3b3b6b',
    color:           '#c0c0ff',
    fontSize:        12,
    fontWeight:      700,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  avatarOwn: {
    backgroundColor: '#4b3b7b',
  },
  senderName: {
    display:    'block',
    fontSize:   11,
    color:      '#8080b0',
    marginBottom: 2,
    paddingLeft: 4,
  },
  bubble: {
    borderRadius: 14,
    padding:      '8px 12px',
    wordBreak:    'break-word',
    lineHeight:   1.45,
  },
  bubbleOther: {
    backgroundColor: '#2a2a4e',
    color:           '#e0e0ff',
    borderBottomLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: '#5b3fa8',
    color:           '#f0f0ff',
    borderBottomRightRadius: 4,
  },
  bubbleError: {
    backgroundColor: '#3a1e1e',
    border:          '1px solid #7a2e2e',
  },
  text: {
    fontSize: 14,
  },
  decryptError: {
    fontSize: 13,
    color:    '#e07070',
    fontStyle: 'italic',
  },
  meta: {
    fontSize:  11,
    color:     '#6060a0',
    marginTop: 3,
    display:   'flex',
    gap:       4,
  },
  readTick: {
    color:      '#7b5ea8',
    fontWeight: 700,
  },
  fileAttachment: {
    display:         'flex',
    alignItems:      'center',
    gap:             8,
    background:      'rgba(0,0,0,0.2)',
    border:          '1px solid rgba(255,255,255,0.1)',
    borderRadius:    8,
    padding:         '6px 10px',
    marginBottom:    6,
    cursor:          'pointer',
    color:           'inherit',
    width:           '100%',
    textAlign:       'left',
  },
  fileIcon:  { fontSize: 18, flexShrink: 0 },
  fileInfo: {
    display:       'flex',
    flexDirection: 'column',
    flex:          1,
    minWidth:      0,
  },
  fileName: {
    fontSize:     13,
    fontWeight:   500,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: 11,
    opacity:  0.7,
    marginTop: 1,
  },
  downloadIcon: {
    fontSize:   14,
    flexShrink: 0,
    opacity:    0.7,
  },
};