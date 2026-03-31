import React, { useRef, useState } from 'react';
import { uploadEncryptedFile } from '../utils/api.js';
import { encryptFile, deriveSharedKey } from '../utils/crypto.js';

const MAX_SIZE_MB    = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

export default function FileUpload({ roomId, recipient, onUploaded, onCancel }) {
  const inputRef                     = useRef(null);
  const [file,     setFile]          = useState(null);
  const [progress, setProgress]      = useState(null);
  const [error,    setError]         = useState(null);
  const [isDragging, setIsDragging]  = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > MAX_SIZE_BYTES) {
      setError(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      return;
    }
    setFile(selected);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (dropped.size > MAX_SIZE_BYTES) {
      setError(`File exceeds ${MAX_SIZE_MB} MB limit.`);
      return;
    }
    setFile(dropped);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !recipient?.publicKey) {
      setError('Missing file or recipient public key.');
      return;
    }
    setError(null);
    try {
      setProgress('encrypting');
      const sharedKey = await deriveSharedKey(recipient.publicKey);
      const { encryptedBlob, encryptedFileKey, originalName, mimeType } =
        await encryptFile(file, sharedKey);

      setProgress('uploading');
      const fileDoc = await uploadEncryptedFile({
        encryptedBlob, encryptedFileKey, originalName, mimeType, roomId,
      });

      setProgress('done');
      onUploaded?.(fileDoc);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  const isWorking = progress === 'encrypting' || progress === 'uploading';

  const progressLabel = {
    encrypting: { icon: '🔒', text: 'Encrypting file…' },
    uploading:  { icon: '☁️', text: 'Uploading to server…' },
    done:       { icon: '✅', text: 'Upload complete' },
  }[progress] ?? null;

  return (
    <div style={styles.wrapper}>
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={isWorking}
      />

      {!file ? (
        <div
          style={{
            ...styles.dropzone,
            borderColor: isDragging ? 'var(--accent)' : 'var(--border)',
            background: isDragging ? 'var(--accent-dim)' : 'transparent',
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span style={{ color: isDragging ? 'var(--accent)' : 'var(--text-muted)' }}>
            <UploadIcon />
          </span>
          <div style={styles.dropText}>
            <span style={styles.dropMain}>Drop file or click to browse</span>
            <span style={styles.dropSub}>Max {MAX_SIZE_MB} MB · Encrypted before upload</span>
          </div>
        </div>
      ) : (
        <div style={styles.preview}>
          {/* File info */}
          <div style={styles.previewRow}>
            <div style={styles.fileIconBox}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div style={styles.fileDetails}>
              <span style={styles.fileName}>{file.name}</span>
              <span style={styles.fileMeta}>
                {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown'}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {progressLabel && (
            <div style={styles.progressRow}>
              <span>{progressLabel.icon}</span>
              <span style={styles.progressText}>{progressLabel.text}</span>
            </div>
          )}

          {/* Error */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Actions */}
          {!isWorking && progress !== 'done' && (
            <div style={styles.actions}>
              <button style={styles.btnPrimary} onClick={handleUpload}>
                Upload encrypted
              </button>
              <button style={styles.btnSecondary} onClick={() => { setFile(null); setError(null); setProgress(null); }}>
                Change
              </button>
              <button style={styles.btnSecondary} onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {!file && error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    padding: '10px 0',
  },
  dropzone: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    border: '1.5px dashed var(--border)',
    borderRadius: 'var(--r-lg)',
    cursor: 'pointer',
    transition: 'border-color var(--t-fast), background var(--t-fast)',
  },
  dropText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  dropMain: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  dropSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--surface-2)',
    borderRadius: 'var(--r-lg)',
    border: '1px solid var(--border)',
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--accent-dim)',
    border: '1px solid rgba(104,82,214,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  fileName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  fileMeta: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
  },
  progressText: {
    color: 'var(--text-secondary)',
  },
  error: {
    fontSize: 12,
    color: 'var(--danger)',
    background: 'rgba(237,66,69,0.1)',
    border: '1px solid rgba(237,66,69,0.2)',
    borderRadius: 'var(--r-sm)',
    padding: '7px 10px',
  },
  actions: {
    display: 'flex',
    gap: 7,
    flexWrap: 'wrap',
  },
  btnPrimary: {
    padding: '7px 14px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--r-sm)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  btnSecondary: {
    padding: '7px 14px',
    background: 'var(--surface-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
};