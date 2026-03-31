import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { generateKeyPair, loadPrivateKey } from './utils/crypto';
import ChatWindow from './components/chat/ChatWindow';
import Sidebar    from './components/layout/Sidebar';
import LoginPage  from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';

// ── Auth context ───────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// ── Root App ───────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('accessToken');
    const user  = JSON.parse(localStorage.getItem('user') || 'null');
    return token && user ? { token, user } : null;
  });

  const [activeRoomId, setActiveRoomId] = useState(null);

  // Ensure the user has an ECDH key pair on first login
  useEffect(() => {
    if (!auth) return;
    loadPrivateKey().catch(async () => {
      // No key found — generate one and upload public key to server
      const { publicKeyJwk } = await generateKeyPair();
      await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'}/api/users/public-key`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ publicKey: publicKeyJwk }),
      });
    });
  }, [auth]);

  function login(token, user) {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    setAuth({ token, user });
  }

  function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    setAuth(null);
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              auth
                ? <MainLayout
                    activeRoomId={activeRoomId}
                    setActiveRoomId={setActiveRoomId}
                  />
                : <Navigate to="/login" replace />
            }
          />
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

// ── Main layout — sidebar + chat area ──────────
function MainLayout({ activeRoomId, setActiveRoomId }) {
  return (
    <>
      <Sidebar activeRoomId={activeRoomId} onSelectRoom={setActiveRoomId} />
      {activeRoomId
        ? <ChatWindow roomId={activeRoomId} />
        : <EmptyState />}
    </>
  );
}

function EmptyState() {
  return (
    <div className="main" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
      Select a room to start chatting
    </div>
  );
}
