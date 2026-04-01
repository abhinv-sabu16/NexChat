import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gql, QUERIES, MUTATIONS } from '../utils/api.js';
import { getSocket } from '../utils/socket.js';

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 15, stroke = 'currentColor', fill = 'none', strokeWidth = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const HashIcon    = () => <Icon size={14} d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />;
const LockIcon    = () => <Icon size={12} d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" />;
const PlusIcon    = () => <Icon size={14} d="M12 5v14M5 12h14" strokeWidth={2.5} />;
const LogoutIcon  = () => <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />;
const EditIcon    = () => <Icon size={13} d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />;
const ChevronIcon = ({ open }) => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.5} strokeLinecap="round"
    style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const XIcon       = () => <Icon size={14} d="M18 6L6 18M6 6l12 12" strokeWidth={2.5} />;
const SearchIcon  = () => <Icon size={13} d="M11 17a6 6 0 100-12 6 6 0 000 12zM21 21l-4.35-4.35" />;
const MembersIcon = () => <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />;

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name = '?', size = 34 }) {
  const palette = ['#6852D6','#5865F2','#2D7D9A','#7B5EA7','#3D9970','#C27C0E'];
  const color   = palette[(name?.charCodeAt(0) ?? 0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color + '28', border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color, letterSpacing: '-0.5px',
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ─── Presence dot ─────────────────────────────────────────────────────────────
function Dot({ status, size = 7 }) {
  const c = { online: '#57F287', away: '#FEE75C', offline: '#555' };
  return <span style={{ width: size, height: size, borderRadius: '50%', background: c[status] ?? c.offline, display: 'inline-block', flexShrink: 0 }} />;
}

// ─── Create Room Modal ────────────────────────────────────────────────────────
function CreateRoomModal({ onClose, onCreated }) {
  const [name,  setName]  = useState('');
  const [desc,  setDesc]  = useState('');
  const [type,  setType]  = useState('public');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError('Room name is required.'); return; }
    setBusy(true); setError(null);
    try {
      const data = await gql(MUTATIONS.CREATE_ROOM, { name: name.trim(), description: desc.trim(), type });
      onCreated(data.createRoom);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.card} onClick={(e) => e.stopPropagation()}>
        <div style={modal.header}>
          <span style={modal.title}>Create channel</span>
          <button style={modal.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        <div style={modal.body}>
          {/* Type toggle */}
          <div style={modal.typeRow}>
            {['public', 'private'].map((t) => (
              <button key={t} style={{ ...modal.typeBtn, ...(type === t ? modal.typeBtnActive : {}) }}
                onClick={() => setType(t)}>
                <span style={{ opacity: 0.7 }}>{t === 'public' ? <HashIcon /> : <LockIcon />}</span>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <label style={modal.label}>
            Channel name
            <input
              style={modal.input}
              placeholder={type === 'public' ? 'e.g. general' : 'e.g. team-leads'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
              maxLength={64}
            />
          </label>

          <label style={modal.label}>
            Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
            <input
              style={modal.input}
              placeholder="What's this channel about?"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              maxLength={256}
            />
          </label>

          {error && <div style={modal.error}>{error}</div>}
        </div>

        <div style={modal.footer}>
          <button style={modal.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...modal.confirmBtn, opacity: busy ? 0.6 : 1 }} onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────
function AddMemberModal({ room, onClose, onAdded }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const timerRef              = useRef(null);

  const existingIds = new Set(room.members.map((m) => m.id));

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      const data = await gql(QUERIES.SEARCH_USERS, { query: q });
      setResults(data.searchUsers.filter((u) => !existingIds.has(u.id)));
    } catch { setResults([]); }
  }, [room.members]);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(q), 300);
  };

  const handleAdd = async (userId) => {
    setBusy(true); setError(null);
    try {
      const data = await gql(MUTATIONS.ADD_MEMBER, { roomId: room.id, userId });
      onAdded(data.addMember);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={{ ...modal.card, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div style={modal.header}>
          <span style={modal.title}>Add member to #{room.name}</span>
          <button style={modal.closeBtn} onClick={onClose}><XIcon /></button>
        </div>

        <div style={modal.body}>
          <div style={modal.searchWrap}>
            <span style={{ color: 'var(--text-muted)', display:'flex', alignItems:'center' }}><SearchIcon /></span>
            <input
              style={modal.searchInput}
              placeholder="Search by username…"
              value={query}
              onChange={handleInput}
              autoFocus
            />
          </div>

          {error && <div style={modal.error}>{error}</div>}

          <div style={modal.resultList}>
            {results.length === 0 && query.trim() && (
              <div style={modal.noResults}>No users found</div>
            )}
            {results.map((u) => (
              <div key={u.id} style={modal.resultRow}>
                <Avatar name={u.username} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={modal.resultName}>{u.username}</div>
                  <div style={modal.resultStatus}><Dot status={u.presence} size={6} /> {u.presence}</div>
                </div>
                <button style={{ ...modal.confirmBtn, padding: '5px 12px', fontSize: 12 }}
                  onClick={() => handleAdd(u.id)} disabled={busy}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Panel ────────────────────────────────────────────────────────────
function ProfilePanel({ user, onLogout }) {
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <div style={styles.profileWrap}>
      {/* Collapsed bar */}
      <button style={styles.profileBar} onClick={() => setOpen((v) => !v)}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={user.username} size={32} />
          <span style={styles.onlineDot} />
        </div>
        <div style={styles.profileMini}>
          <span style={styles.profileMineName}>{user.username}</span>
          <span style={styles.profileMineStatus}>● Online</span>
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Expanded card */}
      {open && (
        <div style={styles.profileCard}>
          {/* Accent banner */}
          <div style={styles.banner} />

          {/* Avatar floated over banner */}
          <div style={styles.cardAvatarRow}>
            <div style={{ marginTop: -28 }}>
              <Avatar name={user.username} size={54} />
            </div>
            <span style={styles.onlinePill}>● Online</span>
          </div>

          <div style={styles.cardBody}>
            <div style={styles.cardName}>{user.username}</div>
            {user.email && <div style={styles.cardEmail}>{user.email}</div>}

            {/* Stats */}
            <div style={styles.statsRow}>
              <div style={styles.stat}>
                <span style={styles.statVal}>E2EE</span>
                <span style={styles.statLbl}>Security</span>
              </div>
              <div style={styles.statDiv} />
              <div style={styles.stat}>
                <span style={styles.statVal}>P-256</span>
                <span style={styles.statLbl}>Key type</span>
              </div>
              <div style={styles.statDiv} />
              <div style={styles.stat}>
                <span style={{ ...styles.statVal, color: user.publicKey ? 'var(--success)' : 'var(--danger)' }}>
                  {user.publicKey ? 'Yes' : 'No'}
                </span>
                <span style={styles.statLbl}>Key set</span>
              </div>
            </div>

            {/* Public key */}
            {user.publicKey && (
              <div style={styles.keyBox}>
                <span style={styles.keyLabel}>Public key</span>
                <span style={styles.keyVal} title={user.publicKey}>
                  {user.publicKey.slice(0, 28)}…
                </span>
              </div>
            )}

            {/* Actions */}
            <div style={styles.cardActions}>
              <button style={styles.cardBtn}>
                <EditIcon /> Edit profile
              </button>
              <button style={{ ...styles.cardBtn, ...styles.cardBtnDanger }} onClick={onLogout}>
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
  const [rooms,         setRooms]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [addMemberRoom, setAddMemberRoom] = useState(null);

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
    const onPresence = ({ userId, presence }) =>
      setRooms((prev) => prev.map((r) => ({
        ...r,
        members: r.members.map((m) => m.id === userId ? { ...m, presence } : m),
      })));
    socket.on('presence:update', onPresence);
    return () => socket.off('presence:update', onPresence);
  }, []);

  const handleRoomCreated = (room) => {
    setRooms((prev) => [room, ...prev]);
    onSelectRoom(room.id);
  };

  const handleMemberAdded = (updatedRoom) => {
    setRooms((prev) => prev.map((r) => r.id === updatedRoom.id ? { ...r, ...updatedRoom } : r));
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <>
      <aside style={styles.sidebar}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <div style={styles.logoMark}>N</div>
            <span style={styles.logoText}>NexChat</span>
          </div>
          <div style={styles.e2eeBadge}>
            <span style={styles.e2eeDot} /> E2EE
          </div>
        </div>

        {/* Channels section */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionLabel}>Channels</span>
          <button style={styles.addBtn} onClick={() => setShowCreate(true)} title="Create channel">
            <PlusIcon />
          </button>
        </div>

        {/* Room list */}
        <div style={styles.roomList}>
          {loading && <div style={styles.hint}>Loading channels…</div>}
          {error   && (
            <>
              <div style={{ ...styles.hint, color: 'var(--danger)' }}>Failed to load</div>
              <button style={styles.retryBtn} onClick={fetchRooms}>Retry</button>
            </>
          )}
          {!loading && !error && rooms.length === 0 && (
            <div style={styles.emptyHint}>
              <div style={styles.emptyIcon}><HashIcon /></div>
              <span>No channels yet.</span>
              <button style={styles.createFirstBtn} onClick={() => setShowCreate(true)}>
                Create one
              </button>
            </div>
          )}

          {rooms.map((room) => {
            const isActive    = room.id === activeRoomId;
            const onlineCount = room.members.filter((m) => m.presence === 'online').length;

            return (
              <button key={room.id}
                style={{ ...styles.roomBtn, ...(isActive ? styles.roomBtnActive : {}) }}
                onClick={() => onSelectRoom(room.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && <span style={styles.activeBar} />}
                <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', display:'flex', alignItems:'center', flexShrink:0 }}>
                  {room.type === 'private' ? <LockIcon /> : <HashIcon />}
                </span>
                <span style={styles.roomBody}>
                  <span style={{ ...styles.roomName, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 500 }}>
                    {room.name}
                  </span>
                  <span style={styles.roomMeta}>
                    <Dot status={onlineCount > 0 ? 'online' : 'offline'} size={5} />
                    &nbsp;{onlineCount}/{room.members.length}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Add member shortcut for active room */}
        {activeRoom && (
          <button style={styles.addMemberBtn} onClick={() => setAddMemberRoom(activeRoom)}>
            <MembersIcon />
            Add member to #{activeRoom.name}
          </button>
        )}

        {/* Profile */}
        <ProfilePanel user={user} onLogout={onLogout} />
      </aside>

      {/* Modals */}
      {showCreate    && <CreateRoomModal onClose={() => setShowCreate(false)}    onCreated={handleRoomCreated} />}
      {addMemberRoom && <AddMemberModal  onClose={() => setAddMemberRoom(null)}  room={addMemberRoom} onAdded={handleMemberAdded} />}
    </>
  );
}

// ─── Modal styles ─────────────────────────────────────────────────────────────
const modal = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20,
    backdropFilter: 'blur(4px)',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    width: '100%', maxWidth: 440,
    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
    animation: 'fadeIn 0.15s ease',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px 0',
  },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' },
  closeBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 6,
  },
  body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  footer: {
    padding: '0 20px 20px',
    display: 'flex', gap: 8, justifyContent: 'flex-end',
  },
  typeRow: { display: 'flex', gap: 8 },
  typeBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  typeBtnActive: {
    background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--text-primary)',
  },
  label: {
    display: 'flex', flexDirection: 'column', gap: 6,
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg)',
    color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font)', outline: 'none',
  },
  error: {
    fontSize: 12, color: 'var(--danger)',
    background: 'rgba(237,66,69,0.1)', border: '1px solid rgba(237,66,69,0.2)',
    borderRadius: 6, padding: '7px 10px',
  },
  cancelBtn: {
    padding: '8px 16px', background: 'var(--surface-3)',
    border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  confirmBtn: {
    padding: '8px 16px', background: 'var(--accent)',
    border: 'none', borderRadius: 8,
    color: '#fff', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  searchWrap: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px',
  },
  searchInput: {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font)',
  },
  resultList: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' },
  noResults: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' },
  resultRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--surface-2)', border: '1px solid var(--border)',
  },
  resultName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  resultStatus: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 },
};

// ─── Component styles ─────────────────────────────────────────────────────────
const styles = {
  sidebar: {
    width: 260, flexShrink: 0,
    background: 'var(--surface)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
  },
  header: {
    padding: '16px 14px 12px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  logoMark: {
    width: 28, height: 28, borderRadius: 8, background: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 15, fontWeight: 900, color: '#fff',
  },
  logoText: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px' },
  e2eeBadge: {
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
    color: 'var(--success)', background: 'var(--success-dim)',
    padding: '3px 7px', borderRadius: 999, border: '1px solid rgba(87,242,135,0.2)',
  },
  e2eeDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px 6px', flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
  },
  addBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center',
    borderRadius: 5, transition: 'color var(--t-fast)',
  },
  roomList: { flex: 1, overflowY: 'auto', padding: '2px 6px' },
  hint: { padding: '10px 8px', fontSize: 12, color: 'var(--text-muted)' },
  retryBtn: {
    margin: '4px 8px', padding: '5px 10px', background: 'var(--surface-3)',
    border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)',
  },
  emptyHint: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '24px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center',
  },
  emptyIcon: {
    width: 40, height: 40, borderRadius: 12, background: 'var(--accent-dim)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
  },
  createFirstBtn: {
    background: 'var(--accent-dim)', border: '1px solid rgba(104,82,214,0.3)',
    borderRadius: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 700,
    padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  roomBtn: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '8px 10px', background: 'none', border: 'none',
    borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
    transition: 'background var(--t-fast)', marginBottom: 1,
  },
  roomBtnActive: { background: 'var(--accent-dim)' },
  activeBar: {
    position: 'absolute', left: 0, top: '20%', height: '60%',
    width: 3, borderRadius: '0 3px 3px 0', background: 'var(--accent)',
  },
  roomBody: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 },
  roomName: { fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  roomMeta: { display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)', gap: 2 },
  addMemberBtn: {
    display: 'flex', alignItems: 'center', gap: 7,
    margin: '4px 8px 8px', padding: '8px 10px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
    transition: 'background var(--t-fast)',
  },

  // Profile
  profileWrap: { borderTop: '1px solid var(--border)', flexShrink: 0 },
  profileBar: {
    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
    padding: '11px 12px', background: 'none', border: 'none',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 9, height: 9, borderRadius: '50%', background: '#57F287',
    border: '2px solid var(--surface)',
  },
  profileMini: { flex: 1, minWidth: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1 },
  profileMineName: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  profileMineStatus: { fontSize: 10, color: '#57F287', fontWeight: 600 },

  profileCard: {
    background: 'var(--surface-2)', borderTop: '1px solid var(--border)',
    animation: 'fadeIn 0.15s ease',
  },
  banner: {
    height: 48,
    background: 'linear-gradient(135deg, #6852D6 0%, #2D7D9A 100%)',
    opacity: 0.55,
  },
  cardAvatarRow: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    padding: '0 12px', marginTop: -20,
  },
  onlinePill: {
    fontSize: 10, fontWeight: 700, color: '#57F287',
    background: 'rgba(87,242,135,0.12)', padding: '3px 8px',
    borderRadius: 999, border: '1px solid rgba(87,242,135,0.2)',
    marginBottom: 4, letterSpacing: '0.03em',
  },
  cardBody: { padding: '8px 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 },
  cardName: { fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.2px' },
  cardEmail: { fontSize: 11, color: 'var(--text-muted)', marginTop: -6 },
  statsRow: {
    display: 'flex', alignItems: 'center', gap: 0,
    background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  stat: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '7px 4px', gap: 2,
  },
  statVal: { fontSize: 11, fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' },
  statLbl: { fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 },
  statDiv: { width: 1, height: 28, background: 'var(--border)', flexShrink: 0 },
  keyBox: {
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2,
  },
  keyLabel: { fontSize: 9, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  keyVal: { fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' },
  cardActions: { display: 'flex', gap: 6 },
  cardBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '7px 8px', background: 'var(--surface-3)', border: '1px solid var(--border)',
    borderRadius: 7, color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  cardBtnDanger: {
    color: 'var(--danger)', background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.18)',
  },
};