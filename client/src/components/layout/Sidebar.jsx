import { useState, useEffect } from 'react';
import { useAuth } from '../../App';
import RoomList from '../chat/RoomList';

export default function Sidebar({ activeRoomId, onSelectRoom }) {
  const { auth } = useAuth();
  const [rooms, setRooms] = useState([]);
  
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/api/rooms`, {
          headers: { Authorization: `Bearer ${auth.token}` }
        });
        const data = await res.json();
        if (res.ok) setRooms(data);
      } catch (err) {
        console.error("Failed to fetch rooms:", err);
      }
    };
    if (auth?.token) fetchRooms();
  }, [auth, SERVER_URL]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon">N</div>
          <span className="logo-text">NexChat</span>
          <div className="lock-badge"><div className="lock-dot"></div>E2E</div>
        </div>
        <div className="search-box">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search channels…" />
        </div>
      </div>

      <div className="sidebar-section">Rooms</div>
      <RoomList 
        rooms={rooms} 
        activeRoomId={activeRoomId} 
        onSelectRoom={onSelectRoom} 
      />
      
      <div className="online-users">
        <div className="sidebar-section" style={{ padding: '10px 12px 6px' }}>You</div>
        <div className="user-row">
          <div className="user-avatar" style={{ background: 'rgba(79,124,255,0.2)', color: '#6b9cff' }}>
            {auth?.user?.username?.substring(0, 2).toUpperCase() || 'YU'}
            <div className="status-dot online"></div>
          </div>
          <span className="user-name">{auth?.user?.username || 'You (dev)'}</span>
          <div className="enc-pulse" style={{ marginLeft: 'auto' }}></div>
        </div>
      </div>
    </aside>
  );
}
