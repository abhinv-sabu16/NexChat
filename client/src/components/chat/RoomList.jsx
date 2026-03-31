export default function RoomList({ rooms, activeRoomId, onSelectRoom }) {
  // Use mock rooms if none are passed yet to show UI
  const displayRooms = rooms.length > 0 ? rooms : [
    { _id: 'general', name: 'general', type: 'channel' },
    { _id: 'design', name: 'design-team', type: 'channel', unread: 3 },
    { _id: 'engineering', name: 'engineering', type: 'channel' },
    { _id: 'random', name: 'random', type: 'channel', unread: 7 }
  ];

  return (
    <div className="room-list">
      {displayRooms.map(room => (
        <div 
          key={room._id}
          className={`room-item ${activeRoomId === room._id ? 'active' : ''}`}
          onClick={() => onSelectRoom(room._id)}
        >
          <div 
            className="room-avatar" 
            style={{ 
              background: room.type === 'dm' ? 'rgba(79,124,255,0.2)' : 'rgba(79,124,255,0.15)',
              color: room.type === 'dm' ? '#6b9cff' : '#4f7cff'
            }}
          >
            {room.type === 'dm' ? room.name.charAt(0).toUpperCase() : '#'}
          </div>
          <div className="room-info">
            <div className="room-name">{room.name}</div>
            <div className="room-last">{room.lastMessagePreview || 'No messages yet'}</div>
          </div>
          <div className="room-meta">
            <span className="room-time">2m</span>
            {room.unread > 0 && <span className="unread-badge">{room.unread}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
