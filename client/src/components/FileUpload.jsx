/**
 * components/FileUpload.jsx
 *
 * Handles client-side file encryption and upload.
 *
 * Flow:
 *   1. User selects a file
 *   2. Derive ECDH shared key with recipient
 *   3. Encrypt file bytes + file key (two-layer scheme)
 *   4. POST encrypted blob to /api/files/upload
 *   5. Call onUploaded(fileDoc) so parent can attach fileId to the message
 *
 * Props:
 *   roomId      {string}    Target room ID
 *   recipient   {object}    Member object with { id, publicKey } for key derivation
 *   onUploaded  {function}  Called with file metadata doc on success
 *   onCancel    {function}  Called when user dismisses the picker
 */

import React, { useRef, useState } from 'react';
import { uploadEncryptedFile } from '../utils/api.js';
import { encryptFile, deriveSharedKey } from '../utils/crypto.js';

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export default function FileUpload({ roomId, recipient, onUploaded, onCancel }) {
  const inputRef             = useRef(null);
  const [file,       setFile]       = useState(null);
  const [progress,   setProgress]   = useState(null); // null | 'encrypting' | 'uploading' | 'done'
  const [error,      setError]      = useState(null);

  // ── File selection ─────────────────────────────────────────────────────────

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

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file || !recipient?.publicKey) {
      setError('Missing file or recipient public key.');
      return;
    }

    setError(null);

    try {
      // 1. Derive shared key with recipient
      setProgress('encrypting');
      const sharedKey = await deriveSharedKey(recipient.publicKey);

      // 2. Encrypt file (two-layer: file bytes + file key)
      const { encryptedBlob, encryptedFileKey, originalName, mimeType } =
        await encryptFile(file, sharedKey);

      // 3. Upload encrypted blob to S3 via our REST endpoint
      setProgress('uploading');
      const fileDoc = await uploadEncryptedFile({
        encryptedBlob,
        encryptedFileKey,
        originalName,
        mimeType,
        roomId,
      });

      setProgress('done');
      onUploaded?.(fileDoc);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  const isWorking = progress === 'encrypting' || progress === 'uploading';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.wrapper}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={isWorking}
      />

      {!file ? (
        /* Step 1: pick a file */
        <div style={styles.dropzone} onClick={() => inputRef.current?.click()}>
          <span style={styles.dropIcon}>📎</span>
          <span style={styles.dropText}>
            Click to select a file
            <br />
            <small style={styles.dropHint}>Max {MAX_SIZE_MB} MB · Encrypted before upload</small>
          </span>
        </div>
      ) : (
        /* Step 2: confirm and upload */
        <div style={styles.preview}>
          <div style={styles.previewInfo}>
            <span style={styles.fileIcon}>📄</span>
            <div>
              <div style={styles.fileName}>{file.name}</div>
              <div style={styles.fileMeta}>
                {(file.size / 1024).toFixed(1)} KB · {file.type || 'unknown type'}
              </div>
            </div>
          </div>

          {/* Progress indicator */}
          {progress && (
            <div style={styles.progress}>
              {progress === 'encrypting' && '🔒 Encrypting…'}
              {progress === 'uploading'  && '☁️  Uploading…'}
              {progress === 'done'       && '✅ Done'}
            </div>
          )}

          {/* Error */}
          {error && <div style={styles.error}>{error}</div>}

          {/* Actions */}
          {!isWorking && progress !== 'done' && (
            <div style={styles.actions}>
              <button style={styles.btnPrimary} onClick={handleUpload}>
                Upload Encrypted
              </button>
              <button
                style={styles.btnSecondary}
                onClick={() => {
                  setFile(null);
                  setError(null);
                  setProgress(null);
                }}
              >
                Change
              </button>
              <button style={styles.btnSecondary} onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Top-level error (e.g. file too large) */}
      {!file && error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    backgroundColor: '#1e1e36',
    border:          '1px solid #3a3a5e',
    borderRadius:    10,
    padding:         12,
    marginBottom:    8,
  },
  dropzone: {
    display:         'flex',
    alignItems:      'center',
    gap:             12,
    padding:         '12px 16px',
    border:          '2px dashed #4a4a7e',
    borderRadius:    8,
    cursor:          'pointer',
    color:           '#9090c0',
    transition:      'border-color 0.15s',
  },
  dropIcon:  { fontSize: 24 },
  dropText:  { fontSize: 13, lineHeight: 1.5 },
  dropHint:  { color: '#6060a0' },
  preview: {
    display:       'flex',
    flexDirection: 'column',
    gap:           8,
  },
  previewInfo: {
    display:    'flex',
    alignItems: 'center',
    gap:        10,
  },
  fileIcon:  { fontSize: 24 },
  fileName:  { fontSize: 14, fontWeight: 500, color: '#e0e0ff' },
  fileMeta:  { fontSize: 12, color: '#7070a0', marginTop: 2 },
  progress: {
    fontSize:   13,
    color:      '#a0a0d0',
    padding:    '4px 0',
  },
  error: {
    fontSize:        13,
    color:           '#f87171',
    backgroundColor: '#2a1e1e',
    borderRadius:    6,
    padding:         '6px 10px',
  },
  actions: {
    display:   'flex',
    gap:       8,
    flexWrap:  'wrap',
  },
  btnPrimary: {
    padding:         '7px 14px',
    backgroundColor: '#5b3fa8',
    border:          'none',
    borderRadius:    6,
    color:           '#fff',
    fontSize:        13,
    cursor:          'pointer',
    fontWeight:      500,
  },
  btnSecondary: {
    padding:         '7px 14px',
    backgroundColor: '#2a2a4e',
    border:          '1px solid #4a4a7e',
    borderRadius:    6,
    color:           '#c0c0e0',
    fontSize:        13,
    cursor:          'pointer',
  },
};