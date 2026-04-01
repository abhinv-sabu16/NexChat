/**
 * context/AuthContext.jsx
 *
 * Global authentication state.
 *
 * On mount, attempts a silent token refresh using the HTTP-only cookie.
 * If successful, the user is considered logged in without re-entering credentials.
 *
 * Provides: { user, loading, login, register, logout }
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  login            as apiLogin,
  logout           as apiLogout,
  register         as apiRegister,
  refreshAccessToken,
  uploadPublicKey,
  gql,
  QUERIES,
} from '../utils/api.js';
import { generateKeyPair, hasKeyPair } from '../utils/crypto.js';
import { destroySocket } from '../utils/socket.js';

const AuthContext = createContext(null);

// ─── Helper ───────────────────────────────────────────────────────────────────
// Ensures the server always has this user's public key.
// Called after login and after silent refresh.
// If the server record has publicKey: null (registered on another device, or
// key was wiped), generate a new pair locally and upload the public half.

async function ensurePublicKey(serverUser) {
  if (serverUser?.publicKey) return; // server already has it — nothing to do

  // Generate a fresh key pair in this browser
  const publicKey = await generateKeyPair();

  // Upload the public key to the server so other users can encrypt messages to us
  try {
    await uploadPublicKey(publicKey);
  } catch (err) {
    console.warn('[auth] Failed to upload public key:', err.message);
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Bootstrap: try silent refresh on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const ok = await refreshAccessToken();
        if (ok) {
          const data = await gql(QUERIES.ME);
          const me   = data.me;

          // Fix missing public key before setting user —
          // if publicKey is null the app can't encrypt messages
          await ensurePublicKey(me);

          // Re-fetch so the user object reflects the uploaded key
          if (!me?.publicKey) {
            const fresh = await gql(QUERIES.ME);
            setUser(fresh.me);
          } else {
            setUser(me);
          }
        }
      } catch {
        // No valid session — user must log in
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async ({ username, email, password }) => {
    const publicKey = await generateKeyPair();
    const newUser   = await apiRegister({ username, email, password, publicKey });
    setUser(newUser);
    return newUser;
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const loggedIn = await apiLogin({ email, password });

    // Ensure local key pair exists
    if (!(await hasKeyPair())) {
      await generateKeyPair();
    }

    // Ensure server has our public key (handles new devices + null publicKey)
    await ensurePublicKey(loggedIn);

    // Re-fetch user so publicKey is reflected in state
    if (!loggedIn.publicKey) {
      const data = await gql(QUERIES.ME);
      setUser(data.me);
    } else {
      setUser(loggedIn);
    }

    return loggedIn;
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await apiLogout(); } catch { /* best-effort */ }
    destroySocket();
    setUser(null);
  }, []);

  const value = { user, loading, login, register, logout, setUser };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}