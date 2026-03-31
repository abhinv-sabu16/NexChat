export default function MessageBubble({ message, isOwn }) {
  const time = new Date(message.createdAt).toLocaleTimeString([], { 
    hour: '2-digit', minute: '2-digit' 
  });

  return (
    <div className={`msg-group ${isOwn ? 'own' : ''}`}>
      <div 
        className="msg-avatar" 
        style={{ 
          background: isOwn ? 'rgba(79,124,255,0.3)' : 'rgba(79,124,255,0.2)',
          color: isOwn ? '#90b4ff' : '#6b9cff'
        }}
      >
        {message.sender?.username?.substring(0, 2).toUpperCase() || 'AJ'}
      </div>
      <div className="msg-content">
        <div className="msg-header">
          <span className="msg-author" style={{ color: isOwn ? '#90b4ff' : '#6b9cff' }}>
            {isOwn ? 'You' : message.sender?.username}
          </span>
          <span className="msg-time">{time}</span>
        </div>
        
        <div className="msg-bubble">
          {message.decrypted === false ? (
            <span style={{ fontStyle: 'italic', opacity: 0.7 }}>🔒 Encrypted message</span>
          ) : (
            <span>{message.content}</span>
          )}
        </div>
        
        <div className="msg-enc-badge" style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--green)' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {isOwn ? 'sent · encrypted' : 'encrypted · verified'}
        </div>
      </div>
    </div>
  );
}
