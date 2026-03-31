/**
 * utils/crypto.js
 *
 * End-to-end encryption layer. Runs entirely in the browser.
 * The server never sees plaintext — only ciphertext is transmitted.
 *
 * Protocol:
 *   1. On registration, generate an ECDH P-256 key pair
 *   2. Upload the public key to the server; store private key in IndexedDB
 *   3. To message user B: derive shared key via ECDH(myPrivate, B.publicKey)
 *   4. Encrypt with AES-256-GCM using a fresh 96-bit IV per message
 *   5. Ciphertext format: "<iv_base64>:<ciphertext_base64>"
 *
 * File encryption (two-layer):
 *   - Generate a random AES-256 key per file
 *   - Encrypt file bytes with that key
 *   - Encrypt that key with the ECDH shared key
 *   - Store encrypted blob on S3, encrypted file key in MongoDB
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME    = 'nexchat-keys';
const DB_VERSION = 2;           // bumped from 1 → forces onupgradeneeded to re-run
const KEY_STORE  = 'keypairs';
const MY_KEY_ID  = 'self';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

/**
 * Opens (or creates/upgrades) the key store.
 *
 * Fixes vs original:
 *   - DB_VERSION bumped to 2 so onupgradeneeded fires on existing v1 databases
 *     that are missing the object store (e.g. after storage was partially cleared).
 *   - onupgradeneeded guards with objectStoreNames.contains() before creating,
 *     so it's safe to call on both fresh installs and upgrades.
 *   - onversionchange closes the connection when another tab upgrades the DB,
 *     preventing the "blocked" state that causes the IDBDatabase transaction error.
 *   - onerror and onblocked handlers added for clear diagnostics.
 */
function openKeyStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Guard: only create if missing — safe for both fresh install and upgrade
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE);
      }
    };

    req.onsuccess = (e) => {
      const db = e.target.result;

      // If another tab opens a newer DB version, close this connection
      // so the upgrade isn't blocked and the IDBDatabase error doesn't surface.
      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    req.onerror = () =>
      reject(new Error(`IndexedDB open failed: ${req.error?.message ?? 'unknown error'}`));

    req.onblocked = () =>
      reject(new Error(
        'IndexedDB upgrade blocked by another tab. Close other tabs and reload.'
      ));
  });
}

/**
 * Runs a transaction and returns a promise that resolves/rejects
 * based on the transaction's own complete/error events — not just
 * the individual request. This catches the "object store not found"
 * error at the right level with a clear message.
 */
function runTransaction(db, storeNames, mode, fn) {
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeNames, mode);
    } catch (err) {
      // Catches "One of the specified object stores was not found"
      return reject(new Error(
        `DB transaction failed — the key store may be missing. ` +
        `Try clearing site data and logging in again. (${err.message})`
      ));
    }

    tx.onerror   = () => reject(tx.error);
    tx.onabort   = () => reject(tx.error ?? new Error('Transaction aborted.'));

    try {
      const result = fn(tx);
      tx.oncomplete = () => resolve(result);
    } catch (err) {
      reject(err);
    }
  });
}

async function storePrivateKey(privateKey) {
  const db = await openKeyStore();
  return runTransaction(db, KEY_STORE, 'readwrite', (tx) => {
    tx.objectStore(KEY_STORE).put(privateKey, MY_KEY_ID);
    // result resolved in oncomplete — the put request's onsuccess
    // fires before the transaction commits, so we rely on oncomplete.
  });
}

async function loadPrivateKey() {
  const db = await openKeyStore();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(KEY_STORE, 'readonly');
    } catch (err) {
      return reject(new Error(
        `DB transaction failed — the key store may be missing. ` +
        `Try clearing site data and logging in again. (${err.message})`
      ));
    }

    const req = tx.objectStore(KEY_STORE).get(MY_KEY_ID);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = () => reject(new Error(
      `Failed to load private key: ${req.error?.message ?? 'unknown error'}`
    ));
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Base64 helpers ───────────────────────────────────────────────────────────

export function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

export function base64ToBuffer(b64) {
  const binary = atob(b64);
  const buf    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

// ─── Key generation ───────────────────────────────────────────────────────────

/**
 * Generates a new ECDH P-256 key pair.
 * Stores the private key in IndexedDB (never leaves the browser).
 * Returns the public key as a base64 string for upload to the server.
 *
 * @returns {Promise<string>} base64-encoded public key (SubjectPublicKeyInfo)
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // private key is not extractable
    ['deriveKey']
  );

  // Store private key in IndexedDB — never extractable, never leaves browser
  await storePrivateKey(keyPair.privateKey);

  // Export public key as base64 for server upload
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  return bufferToBase64(publicKeyBuffer);
}

/**
 * Returns true if a key pair already exists in IndexedDB.
 */
export async function hasKeyPair() {
  const key = await loadPrivateKey();
  return key !== null;
}

// ─── Shared key derivation ────────────────────────────────────────────────────

/**
 * Derives a shared AES-256-GCM key from our private key and a peer's public key.
 * ECDH(A.private, B.public) === ECDH(B.private, A.public) — same shared secret.
 *
 * @param {string} peerPublicKeyB64 - base64-encoded peer public key from server
 * @returns {Promise<CryptoKey>} AES-GCM key usable for encrypt/decrypt
 */
export async function deriveSharedKey(peerPublicKeyB64) {
  const privateKey = await loadPrivateKey();
  if (!privateKey) throw new Error('No private key found. Please re-register.');

  const peerPublicKey = await crypto.subtle.importKey(
    'spki',
    base64ToBuffer(peerPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Message encryption ───────────────────────────────────────────────────────

/**
 * Encrypts a plaintext message string with a shared AES-256-GCM key.
 *
 * @param {string}    plaintext
 * @param {CryptoKey} sharedKey - from deriveSharedKey()
 * @returns {Promise<string>} "<iv_base64>:<ciphertext_base64>"
 */
export async function encryptMessage(plaintext, sharedKey) {
  const iv         = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoded    = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    encoded
  );

  return `${bufferToBase64(iv.buffer)}:${bufferToBase64(ciphertext)}`;
}

/**
 * Decrypts a ciphertext string produced by encryptMessage().
 *
 * @param {string}    ciphertext - "<iv_base64>:<ciphertext_base64>"
 * @param {CryptoKey} sharedKey
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptMessage(ciphertext, sharedKey) {
  const [ivB64, ctB64] = ciphertext.split(':');
  if (!ivB64 || !ctB64) throw new Error('Malformed ciphertext — expected "iv:ct" format.');

  const iv        = base64ToBuffer(ivB64);
  const ct        = base64ToBuffer(ctB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    sharedKey,
    ct
  );

  return new TextDecoder().decode(plaintext);
}

// ─── File encryption (two-layer) ─────────────────────────────────────────────

/**
 * Encrypts a File object for upload.
 *
 * @param {File}      file       - Browser File object
 * @param {CryptoKey} sharedKey  - ECDH shared key (encrypts the file key)
 *
 * @returns {Promise<{
 *   encryptedBlob:    Blob,
 *   encryptedFileKey: string,
 *   originalName:     string,
 *   mimeType:         string,
 * }>}
 */
export async function encryptFile(file, sharedKey) {
  // 1. Generate a fresh random AES-256 key for this file
  const fileKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // must be extractable so we can encrypt it
    ['encrypt']
  );

  // 2. Encrypt file bytes with the file key
  const fileIv        = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer    = await file.arrayBuffer();
  const encryptedFile = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: fileIv },
    fileKey,
    fileBuffer
  );

  // Prepend IV to ciphertext so the recipient has it
  const combined = new Uint8Array(fileIv.length + encryptedFile.byteLength);
  combined.set(fileIv, 0);
  combined.set(new Uint8Array(encryptedFile), fileIv.length);

  // 3. Export and encrypt the file key with the ECDH shared key
  const rawFileKey   = await crypto.subtle.exportKey('raw', fileKey);
  const keyIv        = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: keyIv },
    sharedKey,
    rawFileKey
  );

  const encryptedFileKey = `${bufferToBase64(keyIv.buffer)}:${bufferToBase64(encryptedKey)}`;

  return {
    encryptedBlob:    new Blob([combined], { type: 'application/octet-stream' }),
    encryptedFileKey,
    originalName:     file.name,
    mimeType:         file.type || 'application/octet-stream',
  };
}

/**
 * Decrypts a file blob downloaded from S3.
 *
 * @param {ArrayBuffer} encryptedBuffer  - Raw bytes from S3 (iv prepended)
 * @param {string}      encryptedFileKey - "<iv_base64>:<encrypted_key_base64>"
 * @param {CryptoKey}   sharedKey        - ECDH shared key
 * @param {string}      mimeType         - Original MIME type for the returned Blob
 *
 * @returns {Promise<Blob>} Decrypted file as a Blob
 */
export async function decryptFile(encryptedBuffer, encryptedFileKey, sharedKey, mimeType) {
  // 1. Decrypt the file key
  const [keyIvB64, encKeyB64] = encryptedFileKey.split(':');
  const keyIv      = new Uint8Array(base64ToBuffer(keyIvB64));
  const encKey     = base64ToBuffer(encKeyB64);
  const rawFileKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: keyIv },
    sharedKey,
    encKey
  );

  const fileKey = await crypto.subtle.importKey(
    'raw',
    rawFileKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // 2. Split IV and ciphertext from the downloaded buffer
  const fileIv    = new Uint8Array(encryptedBuffer, 0, 12);
  const ct        = encryptedBuffer.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fileIv },
    fileKey,
    ct
  );

  return new Blob([decrypted], { type: mimeType });
}