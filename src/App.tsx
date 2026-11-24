import React, { useEffect, useState } from 'react';
import { joinRoom } from './api/roomService';
import { ensureAnonymousSession } from './lib/firebase';
import { GamePage } from './pages/GamePage';
import { LobbyPage } from './pages/LobbyPage';

const NAME_KEY = 'gotg_callsign';

export const App: React.FC = () => {
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState<string>(() => {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
    const rand = `General-${Math.floor(100 + Math.random() * 900)}`;
    localStorage.setItem(NAME_KEY, rand);
    return rand;
  });
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joiningUrl, setJoiningUrl] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleNameChange = (next: string) => {
    setName(next);
    localStorage.setItem(NAME_KEY, next);
  };

  useEffect(() => {
    let active = true;
    void ensureAnonymousSession().then(async (sessionUid) => {
      if (!active) return;
      setUid(sessionUid);

      const params = new URLSearchParams(window.location.search);
      const code = params.get('room');
      if (code) {
        setJoiningUrl(true);
        try {
          const room = await joinRoom({
            roomIdOrCode: code,
            uid: sessionUid,
            name: localStorage.getItem(NAME_KEY) || 'General',
          });
          if (active) setRoomId(room.id);
        } catch {
          // If room is full or missing, fall back to Lobby
          window.history.replaceState({}, '', window.location.pathname);
        } finally {
          if (active) setJoiningUrl(false);
        }
      }
    }).catch((err: unknown) => {
      if (!active) return;
      const msg = err instanceof Error ? err.message : 'Failed to initialize Firebase session.';
      setAuthError(
        msg.includes('operation-not-allowed') || msg.includes('admin-restricted-operation')
          ? 'Please enable Anonymous Sign-In in Firebase Console → Authentication → Sign-in method.'
          : msg,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  const handleEnterRoom = (id: string) => {
    setRoomId(id);
    window.history.replaceState({}, '', `?room=${id}`);
  };

  const handleLeaveRoom = () => {
    setRoomId(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  if (authError) {
    return (
      <div className="min-h-[100dvh] bg-[#161512] flex items-center justify-center p-6 text-center">
        <div className="max-w-sm bg-[#262421] border border-[#e04f4f] rounded-2xl p-5 space-y-2">
          <p className="text-sm font-bold text-[#e04f4f]">Firebase Auth Setup Needed</p>
          <p className="text-xs text-[#d6d3d1]">{authError}</p>
        </div>
      </div>
    );
  }

  if (!uid || joiningUrl) {
    return (
      <div className="min-h-[100dvh] bg-[#161512] flex items-center justify-center text-sm text-[#a8a29e]">
        {joiningUrl ? 'Joining room...' : 'Initializing session...'}
      </div>
    );
  }

  if (roomId) {
    return <GamePage roomId={roomId} uid={uid} onLeave={handleLeaveRoom} />;
  }

  return (
    <LobbyPage
      uid={uid}
      name={name}
      onNameChange={handleNameChange}
      onEnterRoom={handleEnterRoom}
    />
  );
};
