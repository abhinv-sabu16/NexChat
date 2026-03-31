import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../App';
import { useChat } from '../../hooks/useChat';
import MessageBubble from './MessageBubble';

export default function ChatWindow({ roomId }) {
  const { auth } = useAuth();
  const [text, setText] = useState('');
  
  const { 
    connected, messages, typingUsers, 
    sendMessage, startTyping, stopTyping 
  } = useChat({
    token: auth.token,
    userId: auth.user._id,
    roomId
  });

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage(text, roomId); 
    setText('');
    stopTyping();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    startTyping();
  };

  return (
    <main className="main">
      <header className="chat-header">
        <div>
          <div className="channel-name">
            <span className="channel-hash">#</span>
            <span>{roomId}</span>
          </div>
          <div className="channel-meta">12 members · end-to-end encrypted</div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" title="Search messages">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          <button className="icon-btn" title="Pin messages">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
          </button>
          <button className="icon-btn" title="Files">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
        </div>
      </header>

      <div className="messages-container" ref={scrollRef}>
        <div className="date-divider"><span>Today</span></div>
        <div style={{ textAlign: 'center', padding: '8px 0', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text3)', background: 'var(--bg3)', padding: '4px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}>
            🔒 Messages are end-to-end encrypted using AES-256-GCM
          </span>
        </div>

        {messages.map((msg, idx) => (
          <MessageBubble 
            key={msg._id || idx} 
            message={msg} 
            isOwn={msg.sender?._id === auth.user._id} 
          />
        ))}

        {typingUsers.length > 0 && (
          <div className="typing-indicator" id="typing">
            <div className="msg-avatar" style={{ width: 28, height: 28, background: 'rgba(20,184,166,0.2)', color: '#2dd4bf', fontSize: 10, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {typingUsers[0].charAt(0).toUpperCase()}
            </div>
            <div className="typing-dots">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
            <span>{typingUsers.join(', ')} is typing…</span>
          </div>
        )}
      </div>

      <div className="input-area">
        <div className="input-wrapper">
          <form onSubmit={handleSend} className="input-row">
            <button type="button" className="icon-btn" title="Attach file">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <textarea 
              className="msg-input" 
              placeholder={`Message #${roomId} · encrypted`}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              rows="1"
            />
            <div className="input-actions">
              <button 
                type="submit" 
                className="send-btn" 
                disabled={!text.trim() || !connected}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </form>
          <div className="input-footer">
            <div className="enc-status"></div>
            <span>AES-256-GCM · ECDH key exchange · end-to-end encrypted</span>
            <span style={{ marginLeft: 'auto' }}>Enter to send</span>
          </div>
        </div>
      </div>
    </main>
  );
}
