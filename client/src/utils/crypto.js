// client/src/utils/crypto.js
// All cryptographic operations run in the browser via the Web Crypto API.
// The server stores and transmits only ciphertext — it never sees plaintext.

const ALGO       = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH  = 12; // 96-bit IV recommended for GCM

// ── ECDH Key Pair ──────────────────────────────

/** Generate an ECDH P-256 key pair. Stores private key in IndexedDB. */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeyJwk  = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  await storePrivateKey(privateKeyJwk);
  return { publicKeyJwk, privateKeyJwk };
}

/** Derive a shared AES-256-GCM key from our private key + their public key. */
export async function deriveSharedKey(ourPrivateKeyJwk, theirPublicKeyJwk) {
  const ourPrivateKey = await crypto.subtle.importKey(
    'jwk', ourPrivateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']
  );
  const theirPublicKey = await crypto.subtle.importKey(
    'jwk', theirPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    ourPrivateKey,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Message Encryption ─────────────────────────

/** Encrypt plaintext → { encryptedContent, iv } (both Base64) */
export async function encryptMessage(plaintext, sharedKey) {
  const iv      = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher  = await crypto.subtle.encrypt({ name: ALGO, iv }, sharedKey, encoded);
  return {
    encryptedContent: toBase64(cipher),
    iv:               toBase64(iv.buffer),
  };
}

/** Decrypt ciphertext → plaintext string */
export async function decryptMessage(encryptedContent, iv, sharedKey) {
  const plain = await crypto.subtle.decrypt(
    { name: ALGO, iv: new Uint8Array(fromBase64(iv)) },
    sharedKey,
    fromBase64(encryptedContent)
  );
  return new TextDecoder().decode(plain);
}

// ── File Encryption ────────────────────────────

/** Encrypt a file with a fresh random key; wrap that key with the shared key. */
export async function encryptFile(fileBuffer, sharedKey) {
  const fileKey = await crypto.subtle.generateKey(
    { name: ALGO, length: KEY_LENGTH }, true, ['encrypt', 'decrypt']
  );
  const fileIv     = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipherFile = await crypto.subtle.encrypt(
    { name: ALGO, iv: fileIv }, fileKey, fileBuffer
  );
  const rawKey      = await crypto.subtle.exportKey('raw', fileKey);
  const keyIv       = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrappedKey  = await crypto.subtle.encrypt(
    { name: ALGO, iv: keyIv }, sharedKey, rawKey
  );
  return {
    encryptedFile:    cipherFile,
    encryptedFileKey: toBase64(wrappedKey),
    iv:               toBase64(fileIv.buffer),
    fileKeyIv:        toBase64(keyIv.buffer),
  };
}

/** Decrypt a downloaded file. */
export async function decryptFile(encryptedFile, encryptedFileKey, iv, fileKeyIv, sharedKey) {
  const rawKey = await crypto.subtle.decrypt(
    { name: ALGO, iv: new Uint8Array(fromBase64(fileKeyIv)) },
    sharedKey,
    fromBase64(encryptedFileKey)
  );
  const fileKey = await crypto.subtle.importKey(
    'raw', rawKey, { name: ALGO, length: KEY_LENGTH }, false, ['decrypt']
  );
  return crypto.subtle.decrypt(
    { name: ALGO, iv: new Uint8Array(fromBase64(iv)) },
    fileKey,
    encryptedFile
  );
}

// ── IndexedDB Key Storage ──────────────────────

const DB_NAME = 'nexchat-keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('keys');
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function storePrivateKey(keyJwk) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(keyJwk, 'privateKey');
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadPrivateKey() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('keys', 'readonly');
    const req = tx.objectStore('keys').get('privateKey');
    req.onsuccess = () => {
      if (req.result) resolve(req.result);
      else reject(new Error('No private key found'));
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Helpers ────────────────────────────────────

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(b64) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}