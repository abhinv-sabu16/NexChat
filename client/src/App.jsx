import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import RoomList from './components/RoomList.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import { getSocket } from './utils/socket.js';

// ─── Lock icon SVG ────────────────────────────────────────────────────────────
function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

// ─── AppInner ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { user, loading, login, register, logout } = useAuth();
  const [activeRoomId, setActiveRoomId] = useState(null);

  if (loading) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashInner}>
          <div style={styles.splashLogo}>N</div>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  if (!user) return <AuthForm onLogin={login} onRegister={register} />;

  getSocket();

  return (
    <div style={styles.app}>
      <RoomList
        activeRoomId={activeRoomId}
        onSelectRoom={setActiveRoomId}
        user={user}
        onLogout={logout}
      />
      <ChatWindow roomId={activeRoomId} />
    </div>
  );
}

// ─── AuthForm ─────────────────────────────────────────────────────────────────
function AuthForm({ onLogin, onRegister }) {
  const [mode,  setMode]  = useState('login');
  const [form,  setForm]  = useState({ username: '', email: '', password: '' });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const update = (field) => (e) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

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
    <div style={styles.authBg}>
      {/* Subtle ambient orb */}
      <div style={styles.orb} />

      <div style={styles.authCard}>
        {/* Logo */}
        <div style={styles.authLogo}>
          <div style={styles.authLogoMark}>N</div>
          <span style={styles.authLogoText}>NexChat</span>
        </div>

        <p style={styles.authTagline}>
          <LockIcon /> End-to-end encrypted messaging
        </p>

        {/* Tab switcher */}
        <div style={styles.tabs}>
          {['login', 'register'].map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(mode === t ? styles.tabActive : {}) }}
              onClick={() => { setMode(t); setError(null); }}
            >
              {t === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form style={styles.form} onSubmit={handleSubmit}>
          {mode === 'register' && (
            <InputField
              label="Username"
              type="text"
              value={form.username}
              onChange={update('username')}
              autoComplete="username"
              disabled={busy}
              minLength={2}
              maxLength={32}
              required
            />
          )}
          <InputField
            label="Email"
            type="email"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
            disabled={busy}
            required
          />
          <InputField
            label="Password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            disabled={busy}
            minLength={8}
            required
          />

          {error && <div style={styles.authError}>{error}</div>}

          <button type="submit" style={{ ...styles.submitBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        {mode === 'register' && (
          <p style={styles.e2eeNote}>
            A unique encryption key pair will be generated in your browser.
            Your private key never leaves this device.
          </p>
        )}
      </div>
    </div>
  );
}

function InputField({ label, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <label style={styles.inputLabel}>
      <span style={styles.inputLabelText}>{label}</span>
      <input
        {...props}
        style={{
          ...styles.input,
          borderColor: focused ? 'var(--accent)' : 'var(--border)',
          boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </label>
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
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg)',
  },

  // Splash / loading
  splash: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  splashInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  splashLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    background: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 26,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: '-1px',
    fontFamily: 'var(--font)',
  },
  spinner: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: '2.5px solid var(--surface-3)',
    borderTop: '2.5px solid var(--accent)',
    animation: 'spin 0.7s linear infinite',
  },

  // Auth
  authBg: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'var(--font)',
  },
  orb: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(104,82,214,0.12) 0%, transparent 70%)',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  authCard: {
    position: 'relative',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '36px 40px',
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    animation: 'fadeIn 0.25s ease',
  },
  authLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    justifyContent: 'center',
  },
  authLogoMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    background: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 900,
    color: '#fff',
  },
  authLogoText: {
    fontSize: 26,
    fontWeight: 900,
    color: 'var(--text-primary)',
    letterSpacing: '-0.5px',
  },
  authTagline: {
    textAlign: 'center',
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabs: {
    display: 'flex',
    background: 'var(--bg)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 24,
    gap: 3,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 8,
    background: 'none',
    color: 'var(--text-muted)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background var(--t-fast), color var(--t-fast)',
  },
  tabActive: {
    background: 'var(--surface-3)',
    color: 'var(--text-primary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  inputLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  inputLabelText: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 'var(--r-md)',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    fontSize: 14,
    fontFamily: 'var(--font)',
    outline: 'none',
    transition: 'border-color var(--t-fast), box-shadow var(--t-fast)',
  },
  authError: {
    fontSize: 13,
    color: 'var(--danger)',
    background: 'rgba(237, 66, 69, 0.1)',
    border: '1px solid rgba(237, 66, 69, 0.2)',
    borderRadius: 'var(--r-sm)',
    padding: '9px 12px',
  },
  submitBtn: {
    padding: '11px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--r-md)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    marginTop: 4,
    transition: 'background var(--t-fast), opacity var(--t-fast)',
  },
  e2eeNote: {
    marginTop: 16,
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
    padding: '10px 12px',
    background: 'var(--bg)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
  },
};