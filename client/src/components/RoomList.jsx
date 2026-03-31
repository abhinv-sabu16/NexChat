/**
 * components/RoomList.jsx
 *
 * Sidebar showing all accessible rooms.
 * Fetches via GraphQL on mount and after each room selection.
 *
 * Props:
 *   activeRoomId  {string|null}  Currently selected room ID
 *   onSelectRoom  {function}     Called with roomId when user clicks a room
 */

import React, { useState, useEffect, useCallback } from 'react';
import { gql, QUERIES } from '../utils/api.js';
import { getSocket } from '../utils/socket.js';

// Presence dot colours
const PRESENCE_COLOR = {
  online:  '#22c55e',
  away:    '#f59e0b',
  offline: '#6b7280',
};

function PresenceDot({ status }) {
  return (
    <span
      style={{
        display:      'inline-block',
        width:         8,
        height:        8,
        borderRadius: '50%',
        backgroundColor: PRESENCE_COLOR[status] ?? PRESENCE_COLOR.offline,
        marginRight:   6,
        flexShrink:    0,
      }}
      aria-label={status}
    />
  );
}

export default function RoomList({ activeRoomId, onSelectRoom }) {
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Fetch rooms ────────────────────────────────────────────────────────────

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

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // ── Listen for presence updates to keep member dots live ──────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <aside style={styles.sidebar}>
        <p style={styles.meta}>Loading rooms…</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside style={styles.sidebar}>
        <p style={{ ...styles.meta, color: '#ef4444' }}>Error: {error}</p>
        <button style={styles.retryBtn} onClick={fetchRooms}>Retry</button>
      </aside>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <h2 style={styles.heading}>Rooms</h2>

      {rooms.length === 0 && (
        <p style={styles.meta}>No rooms yet.</p>
      )}

      <ul style={styles.list}>
        {rooms.map((room) => {
          const isActive  = room.id === activeRoomId;
          const onlineCount = room.members.filter((m) => m.presence === 'online').length;

          return (
            <li key={room.id}>
              <button
                style={{
                  ...styles.roomBtn,
                  ...(isActive ? styles.roomBtnActive : {}),
                }}
                onClick={() => onSelectRoom(room.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* Room icon */}
                <span style={styles.roomIcon}>
                  {room.type === 'private' ? '🔒' : '#'}
                </span>

                {/* Room info */}
                <span style={styles.roomInfo}>
                  <span style={styles.roomName}>{room.name}</span>
                  <span style={styles.roomMeta}>
                    <PresenceDot status={onlineCount > 0 ? 'online' : 'offline'} />
                    {onlineCount}/{room.members.length} online
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  sidebar: {
    width:           240,
    flexShrink:      0,
    backgroundColor: '#1e1e2e',
    borderRight:     '1px solid #2a2a3e',
    display:         'flex',
    flexDirection:   'column',
    overflowY:       'auto',
    padding:         '12px 0',
  },
  heading: {
    color:        '#a0a0c0',
    fontSize:     11,
    fontWeight:   700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding:      '0 16px',
    margin:       '0 0 8px',
  },
  list: {
    listStyle: 'none',
    margin:    0,
    padding:   0,
  },
  roomBtn: {
    display:        'flex',
    alignItems:     'center',
    gap:            10,
    width:          '100%',
    padding:        '8px 16px',
    background:     'none',
    border:         'none',
    cursor:         'pointer',
    textAlign:      'left',
    borderRadius:   0,
    transition:     'background 0.1s',
    color:          '#c0c0d8',
  },
  roomBtnActive: {
    backgroundColor: '#2a2a4e',
    color:           '#e0e0ff',
  },
  roomIcon: {
    fontSize:   14,
    flexShrink: 0,
    width:      18,
    textAlign:  'center',
  },
  roomInfo: {
    display:       'flex',
    flexDirection: 'column',
    minWidth:      0,
  },
  roomName: {
    fontSize:     14,
    fontWeight:   500,
    whiteSpace:   'nowrap',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
  },
  roomMeta: {
    display:    'flex',
    alignItems: 'center',
    fontSize:   11,
    color:      '#7070a0',
    marginTop:  2,
  },
  meta: {
    color:   '#6060a0',
    fontSize: 13,
    padding: '8px 16px',
    margin:  0,
  },
  retryBtn: {
    margin:          '8px 16px',
    padding:         '6px 12px',
    background:      '#3b3b6b',
    border:          'none',
    borderRadius:    6,
    color:           '#e0e0ff',
    cursor:          'pointer',
    fontSize:        13,
  },
};