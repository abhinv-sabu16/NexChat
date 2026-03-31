import React, { useState, useEffect, useCallback } from 'react';
import { gql, QUERIES } from '../utils/api.js';
import { getSocket } from '../utils/socket.js';

// ─── Icons ────────────────────────────────────────────────────────────────────
function HashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
      <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}
function ChevronIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// ─── Presence dot ─────────────────────────────────────────────────────────────
function PresenceDot({ status, size = 8 }) {
  const colors = { online: '#57F287', away: '#FEE75C', offline: '#686868' };
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: colors[status] ?? colors.offline,
      flexShrink: 0,
    }} />
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 34, accentColor }) {
  const initials = name ? name.slice(0, 2).toUpperCase() : '??';
  const colors = ['#6852D6', '#5865F2', '#2D7D9A', '#7B5EA7', '#3D9970'];
  const color = accentColor ?? colors[name?.charCodeAt(0) % colors.length] ?? colors[0];
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: color + '33',
      border: `1.5px solid ${color}66`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.36,
      fontWeight: 700,
      color: color,
      flexShrink: 0,
      letterSpacing: '-0.5px',
      fontFamily: 'var(--font)',
    }}>
      {initials}
    </div>
  );
}

// ─── Profile panel (collapsible) ─────────────────────────────────────────────
function ProfilePanel({ user, onLogout }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.profileWrap}>
      {/* Collapsed bar — always visible */}
      <button style={styles.profileBar} onClick={() => setOpen((v) => !v)}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={user.username} size={34} />
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 10, height: 10, borderRadius: '50%',
            background: '#57F287',
            border: '2px solid var(--surface)',
          }} />
        </div>
        <div style={styles.profileInfo}>
          <span style={styles.profileName}>{user.username}</span>
          <span style={styles.profileStatus}>● Online</span>
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Expanded detail card */}
      {open && (
        <div style={styles.profileCard}>
          {/* Banner */}
          <div style={styles.profileBanner}>
            <div style={styles.profileBannerGradient} />
          </div>

          {/* Avatar over banner */}
          <div style={styles.profileAvatarWrap}>
            <Avatar name={user.username} size={56} />
            <span style={styles.profileOnlineBadge}>Online</span>
          </div>

          {/* Details */}
          <div style={styles.profileDetails}>
            <div style={styles.profileDisplayName}>{user.username}</div>
            {user.email && (
              <div style={styles.profileEmail}>{user.email}</div>
            )}

            {/* Stats row */}
            <div style={styles.profileStats}>
              <div style={styles.profileStat}>
                <span style={styles.profileStatValue}>E2EE</span>
                <span style={styles.profileStatLabel}>Encrypted</span>
              </div>
              <div style={styles.profileStatDivider} />
              <div style={styles.profileStat}>
                <span style={styles.profileStatValue}>P-256</span>
                <span style={styles.profileStatLabel}>Key type</span>
              </div>
            </div>

            {/* Key fingerprint */}
            {user.publicKey && (
              <div style={styles.keyRow}>
                <span style={styles.keyLabel}>Public key</span>
                <span style={styles.keyValue} title={user.publicKey}>
                  {user.publicKey.slice(0, 24)}…
                </span>
              </div>
            )}

            {/* Actions */}
            <div style={styles.profileActions}>
              <button style={styles.profileActionBtn} title="Edit profile">
                <EditIcon /> Edit profile
              </button>
              <button style={{ ...styles.profileActionBtn, ...styles.profileActionDanger }} onClick={onLogout} title="Sign out">
                <LogoutIcon /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main RoomList ────────────────────────────────────────────────────────────
export default function RoomList({ activeRoomId, onSelectRoom, user, onLogout }) {
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await gql(QUERIES.ROOMS);
      setRooms(data.rooms);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  useEffect(() => {
    const socket = getSocket();
    const onPresence = ({ userId, presence }) => {
      setRooms((prev) =>
        prev.map((room) => ({
          ...room,
          members: room.members.map((m) =>
            m.id === userId ? { ...m, presence } : m
          ),
        }))
      );
    };
    socket.on('presence:update', onPresence);
    return () => socket.off('presence:update', onPresence);
  }, []);

  return (
    <aside style={styles.sidebar}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}>N</div>
          <span style={styles.logoText}>NexChat</span>
        </div>
        <div style={styles.e2eeBadge}>
          <span style={styles.e2eeDot} />
          E2EE
        </div>
      </div>

      {/* Section label */}
      <div style={styles.sectionLabel}>Channels</div>

      {/* Room list */}
      <div style={styles.roomList}>
        {loading && (
          <div style={styles.stateMsg}>Loading channels…</div>
        )}
        {error && (
          <>
            <div style={{ ...styles.stateMsg, color: 'var(--danger)' }}>
              Failed to load
            </div>
            <button style={styles.retryBtn} onClick={fetchRooms}>Retry</button>
          </>
        )}
        {!loading && !error && rooms.length === 0 && (
          <div style={styles.stateMsg}>No channels yet</div>
        )}

        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const onlineCount = room.members.filter((m) => m.presence === 'online').length;

          return (
            <button
              key={room.id}
              style={{
                ...styles.roomBtn,
                ...(isActive ? styles.roomBtnActive : {}),
              }}
              onClick={() => onSelectRoom(room.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator bar */}
              {isActive && <span style={styles.activeBar} />}

              <span style={{
                ...styles.roomIcon,
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              }}>
                {room.type === 'private' ? <LockIcon /> : <HashIcon />}
              </span>

              <span style={styles.roomBody}>
                <span style={{
                  ...styles.roomName,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 500,
                }}>
                  {room.name}
                </span>
                <span style={styles.roomMeta}>
                  <PresenceDot status={onlineCount > 0 ? 'online' : 'offline'} size={6} />
                  &nbsp;{onlineCount} online
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Profile section at bottom */}
      {user && <ProfilePanel user={user} onLogout={onLogout} />}
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  sidebar: {
    width: 260,
    flexShrink: 0,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },

  // Header
  header: {
    padding: '18px 16px 14px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  logoMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    background: 'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  logoText: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  e2eeBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--success)',
    background: 'var(--success-dim)',
    padding: '3px 8px',
    borderRadius: 'var(--r-full)',
    letterSpacing: '0.04em',
    border: '1px solid rgba(87,242,135,0.2)',
  },
  e2eeDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: 'var(--success)',
    display: 'inline-block',
  },

  // Section label
  sectionLabel: {
    padding: '14px 16px 6px',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    flexShrink: 0,
  },

  // Room list
  roomList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 8px',
  },
  stateMsg: {
    padding: '10px 8px',
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  retryBtn: {
    margin: '4px 8px',
    padding: '6px 12px',
    background: 'var(--surface-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },

  // Room button
  roomBtn: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '9px 10px',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--r-md)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font)',
    transition: 'background var(--t-fast)',
    marginBottom: 1,
  },
  roomBtnActive: {
    background: 'var(--accent-dim)',
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '20%',
    height: '60%',
    width: 3,
    borderRadius: '0 3px 3px 0',
    background: 'var(--accent)',
  },
  roomIcon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color var(--t-fast)',
  },
  roomBody: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  roomName: {
    fontSize: 14,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'color var(--t-fast)',
  },
  roomMeta: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 11,
    color: 'var(--text-muted)',
    gap: 2,
  },

  // Profile
  profileWrap: {
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  profileBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 14px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background var(--t-fast)',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  profileName: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  profileStatus: {
    fontSize: 11,
    color: 'var(--success)',
    fontWeight: 500,
  },

  // Profile expanded card
  profileCard: {
    background: 'var(--surface-2)',
    borderTop: '1px solid var(--border)',
    animation: 'fadeIn 0.15s ease',
  },
  profileBanner: {
    height: 52,
    position: 'relative',
    overflow: 'hidden',
  },
  profileBannerGradient: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, #6852D6 0%, #3D9970 100%)',
    opacity: 0.6,
  },
  profileAvatarWrap: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '0 14px',
    marginTop: -28,
    marginBottom: 10,
  },
  profileOnlineBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--success)',
    background: 'var(--success-dim)',
    padding: '2px 7px',
    borderRadius: 'var(--r-full)',
    border: '1px solid rgba(87,242,135,0.2)',
    marginBottom: 4,
    letterSpacing: '0.04em',
  },
  profileDetails: {
    padding: '0 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  profileDisplayName: {
    fontSize: 16,
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '-0.2px',
  },
  profileEmail: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginTop: -6,
  },
  profileStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    background: 'var(--bg)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
  },
  profileStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    flex: 1,
    alignItems: 'center',
  },
  profileStatValue: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--accent)',
    fontFamily: 'monospace',
  },
  profileStatLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 600,
  },
  profileStatDivider: {
    width: 1,
    height: 28,
    background: 'var(--border)',
  },
  keyRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '6px 8px',
    background: 'var(--bg)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
  },
  keyLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  keyValue: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
  },
  profileActions: {
    display: 'flex',
    gap: 6,
  },
  profileActionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    padding: '7px 10px',
    background: 'var(--surface-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background var(--t-fast)',
  },
  profileActionDanger: {
    color: 'var(--danger)',
    background: 'rgba(237,66,69,0.08)',
    border: '1px solid rgba(237,66,69,0.15)',
  },
};