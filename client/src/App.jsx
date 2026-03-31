/**
 * App.jsx
 *
 * Root application component.
 *
 * Renders:
 *   - Loading spinner while bootstrapping auth session
 *   - Login / Register forms for unauthenticated users
 *   - Main chat layout (RoomList + ChatWindow) once authenticated
 *
 * Auth is managed by AuthContext; no token handling happens here.
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RoomList from './components/RoomList.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import { getSocket } from './utils/socket.js';

// ─── Inner app (consumes AuthContext) ─────────────────────────────────────────

function AppInner() {
  const { user, loading, login, register, logout } = useAuth();
  const [activeRoomId, setActiveRoomId] = useState(null);

  // ── Loading (bootstrapping session) ───────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.centered}>
        <div style={styles.spinner} aria-label="Loading" />
      </div>
    );
  }

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!user) {
    return <AuthForm onLogin={login} onRegister={register} />;
  }

  // ── Initialise socket once authenticated ──────────────────────────────────
  // getSocket() is idempotent — safe to call on every render.
  getSocket();

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <RoomList
        activeRoomId={activeRoomId}
        onSelectRoom={(id) => setActiveRoomId(id)}
      />

      {/* Chat area */}
      <ChatWindow roomId={activeRoomId} />

      {/* User bar at bottom of sidebar — injected via CSS grid overlay */}
      <div style={styles.userBar}>
        <span style={styles.userAvatar}>{user.username[0].toUpperCase()}</span>
        <span style={styles.username}>{user.username}</span>
        <button style={styles.logoutBtn} onClick={logout} title="Log out">
          ⏻
        </button>
      </div>
    </div>
  );
}

// ─── Auth form ────────────────────────────────────────────────────────────────

function AuthForm({ onLogin, onRegister }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [form,     setForm]     = useState({ username: '', email: '', password: '' });
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === 'login') {
        await onLogin({ email: form.email, password: form.password });
      } else {
        await onRegister({ username: form.username, email: form.email, password: form.password });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.authWrap}>
      <div style={styles.authCard}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>💬</span>
          <span style={styles.logoText}>NexChat</span>
        </div>
        <p style={styles.tagline}>End-to-end encrypted messaging</p>

        {/* Tab switcher */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login'    ? styles.tabActive : {}) }}
            onClick={() => { setMode('login');    setError(null); }}
          >
            Log In
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setMode('register'); setError(null); }}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form style={styles.form} onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label style={styles.label}>
              Username
              <input
                style={styles.input}
                type="text"
                value={form.username}
                onChange={update('username')}
                autoComplete="username"
                required
                minLength={2}
                maxLength={32}
                disabled={busy}
              />
            </label>
          )}

          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
              disabled={busy}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              disabled={busy}
            />
          </label>

          {error && <div style={styles.authError}>{error}</div>}

          <button type="submit" style={styles.submitBtn} disabled={busy}>
            {busy
              ? (mode === 'login' ? 'Logging in…' : 'Creating account…')
              : (mode === 'login' ? 'Log In'      : 'Create Account')}
          </button>
        </form>

        {mode === 'register' && (
          <p style={styles.e2eeNote}>
            🔒 A unique encryption key pair will be generated in your browser.
            Your private key never leaves this device.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  // App shell
  app: {
    display:         'grid',
    gridTemplateColumns: '240px 1fr',
    gridTemplateRows:    '1fr 52px',
    height:          '100vh',
    overflow:        'hidden',
    backgroundColor: '#16162a',
    color:           '#e0e0ff',
    fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  userBar: {
    gridColumn:      1,
    gridRow:         2,
    display:         'flex',
    alignItems:      'center',
    gap:             10,
    padding:         '0 12px',
    backgroundColor: '#16162e',
    borderTop:       '1px solid #2a2a4e',
    borderRight:     '1px solid #2a2a3e',
  },
  userAvatar: {
    width:           30,
    height:          30,
    borderRadius:    '50%',
    backgroundColor: '#4b3b7b',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        13,
    fontWeight:      700,
    color:           '#e0d0ff',
    flexShrink:      0,
  },
  username: {
    fontSize:     13,
    fontWeight:   500,
    color:        '#c0c0e0',
    flex:         1,
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
  },
  logoutBtn: {
    background: 'none',
    border:     'none',
    color:      '#6060a0',
    cursor:     'pointer',
    fontSize:   16,
    padding:    4,
    borderRadius: 4,
    lineHeight: 1,
  },
  // Loading
  centered: {
    height:         '100vh',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: '#16162a',
  },
  spinner: {
    width:        32,
    height:       32,
    borderRadius: '50%',
    border:       '3px solid #3a3a6e',
    borderTop:    '3px solid #7b5ea8',
    animation:    'spin 0.8s linear infinite',
  },
  // Auth
  authWrap: {
    minHeight:       '100vh',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#0f0f1e',
    padding:         20,
    fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  authCard: {
    backgroundColor: '#1a1a2e',
    borderRadius:    16,
    padding:         '32px 36px',
    width:           '100%',
    maxWidth:        380,
    border:          '1px solid #2a2a4e',
    boxShadow:       '0 8px 32px rgba(0,0,0,0.4)',
  },
  logo: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            10,
    marginBottom:   6,
  },
  logoIcon: { fontSize: 28 },
  logoText: {
    fontSize:   22,
    fontWeight: 700,
    color:      '#e0e0ff',
    letterSpacing: '-0.02em',
  },
  tagline: {
    textAlign:    'center',
    fontSize:     13,
    color:        '#6060a0',
    margin:       '0 0 24px',
  },
  tabs: {
    display:         'flex',
    borderRadius:    8,
    backgroundColor: '#0f0f1e',
    padding:         3,
    marginBottom:    20,
    gap:             3,
  },
  tab: {
    flex:            1,
    padding:         '7px 0',
    border:          'none',
    borderRadius:    6,
    background:      'none',
    color:           '#7070a0',
    fontSize:        14,
    fontWeight:      500,
    cursor:          'pointer',
    transition:      'background 0.15s, color 0.15s',
  },
  tabActive: {
    backgroundColor: '#2a2a4e',
    color:           '#e0e0ff',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           14,
  },
  label: {
    display:       'flex',
    flexDirection: 'column',
    gap:           5,
    fontSize:      13,
    color:         '#8080b0',
    fontWeight:    500,
  },
  input: {
    padding:         '9px 12px',
    borderRadius:    8,
    border:          '1px solid #3a3a6e',
    backgroundColor: '#0f0f1e',
    color:           '#e0e0ff',
    fontSize:        14,
    outline:         'none',
    fontFamily:      'inherit',
  },
  authError: {
    fontSize:        13,
    color:           '#f87171',
    backgroundColor: '#2a1a1a',
    borderRadius:    8,
    padding:         '8px 12px',
  },
  submitBtn: {
    padding:         '11px',
    backgroundColor: '#5b3fa8',
    border:          'none',
    borderRadius:    8,
    color:           '#fff',
    fontSize:        15,
    fontWeight:      600,
    cursor:          'pointer',
    marginTop:       4,
    transition:      'opacity 0.15s',
  },
  e2eeNote: {
    marginTop:  16,
    fontSize:   12,
    color:      '#5a5a8a',
    lineHeight: 1.6,
    padding:    '10px 12px',
    background: '#0f0f1e',
    borderRadius: 8,
  },
};