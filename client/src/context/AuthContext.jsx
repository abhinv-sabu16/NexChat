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
  login   as apiLogin,
  logout  as apiLogout,
  register as apiRegister,
  refreshAccessToken,
  gql,
  QUERIES,
} from '../utils/api.js';
import { generateKeyPair, hasKeyPair } from '../utils/crypto.js';
import { destroySocket } from '../utils/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true); // true while bootstrapping

  // ── Bootstrap: try silent refresh on mount ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const ok = await refreshAccessToken();
        if (ok) {
          const data = await gql(QUERIES.ME);
          setUser(data.me);
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
    // Generate ECDH key pair; upload public key at registration
    // Private key stays in IndexedDB and never leaves the browser
    const publicKey = await generateKeyPair();
    const newUser   = await apiRegister({ username, email, password, publicKey });
    setUser(newUser);
    return newUser;
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const loggedIn = await apiLogin({ email, password });

    // If user is logging in on a new device, they won't have a key pair.
    // Generate one and they'll need to re-upload their public key.
    // (Full key recovery flow is out of scope for this implementation.)
    if (!(await hasKeyPair())) {
      await generateKeyPair();
    }

    setUser(loggedIn);
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

/**
 * Hook to consume auth context.
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}