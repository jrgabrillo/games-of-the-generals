import React, { useEffect, useState } from 'react';
import { createRoom, joinRoom, subscribePublicRooms } from '../api/roomService';
import type { RoomMeta } from '../engine/types';
import { isFirebaseConfigured } from '../lib/firebase';

interface LobbyPageProps {
  uid: string;
  name: string;
  onNameChange: (name: string) => void;
  onEnterRoom: (roomId: string) => void;
  onOpenGuide: () => void;
}

export const LobbyPage: React.FC<LobbyPageProps> = ({
  uid,
  name,
  onNameChange,
  onEnterRoom,
  onOpenGuide,
}) => {
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [turnSeconds, setTurnSeconds] = useState<15 | 30 | 60>(30);
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return subscribePublicRooms(setRooms);
  }, []);

  const handleRandomName = () => {
    const num = Math.floor(100 + Math.random() * 900);
    onNameChange(`GEN-${num}`);
  };

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const displayName = name.trim() || 'GENERAL';
      const { roomId } = await createRoom({
        uid,
        name: displayName,
        isPublic,
        turnSeconds,
      });
      onEnterRoom(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (code: string) => {
    if (!code.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const displayName = name.trim() || 'GENERAL';
      const room = await joinRoom({
        roomIdOrCode: code,
        uid,
        name: displayName,
      });
      onEnterRoom(room.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join room');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#1e1a24] text-[#f5f5f4] flex flex-col items-center p-4">
      <div className="w-full max-w-[440px] space-y-4">
        {/* 8-Bit Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 pixel-btn bg-[#d9843b] flex items-center justify-center text-[#0f0d13] font-black text-xl">
              ⚑
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-wide leading-tight">
                Games of the Generals
              </h1>
              <p className="text-xs text-[#a8a29e]">8-BIT SALPAKAN • NO LOGIN</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenGuide}
              className="pixel-btn px-2.5 py-1 bg-[#d9843b] text-[#0f0d13] text-xs font-black uppercase cursor-pointer"
            >
              ? GUIDE
            </button>
            <span
              className={`px-2 py-1 text-xs font-bold border-2 border-[#0f0d13] ${
                isFirebaseConfigured
                  ? 'bg-[#2c2633] text-[#6ee74b]'
                  : 'bg-[#2c2633] text-[#f59e0b]'
              }`}
            >
              {isFirebaseConfigured ? '● LIVE' : '● LOCAL'}
            </span>
          </div>
        </div>

        {error && (
          <div className="bg-[#991b1b] border-2 border-[#0f0d13] text-[#fecaca] px-3 py-2 text-xs font-bold">
            ! {error}
          </div>
        )}

        {/* Callsign */}
        <div className="pixel-panel p-3.5 space-y-2">
          <label htmlFor="callsign" className="block text-xs font-bold uppercase text-[#c2d6cc]">
            Player Callsign
          </label>
          <div className="flex gap-2">
            <input
              id="callsign"
              type="text"
              maxLength={20}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="flex-1 pixel-input px-3 py-2 text-sm focus:outline-none focus:border-[#6ee74b]"
              placeholder="ENTER CALLSIGN..."
            />
            <button
              type="button"
              onClick={handleRandomName}
              className="pixel-btn px-3 py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] cursor-pointer"
              aria-label="Randomize callsign"
            >
              🎲
            </button>
          </div>
        </div>

        {/* Create & Broadcast Room */}
        <div className="pixel-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black uppercase">Create Match</span>
            <span className="text-xs text-[#a8a29e]">2 PLAYERS MAX</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([15, 30, 60] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setTurnSeconds(sec)}
                className={`pixel-btn py-2 text-xs font-bold cursor-pointer ${
                  turnSeconds === sec
                    ? 'bg-[#6ee74b] text-[#0f0d13]'
                    : 'bg-[#3a3244] text-[#d6d3d1]'
                }`}
              >
                {sec}S TURN
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-[#d6d3d1] py-1 cursor-pointer"
          >
            <span>BROADCAST PUBLIC ROOM</span>
            <span
              className={`px-2 py-0.5 border-2 border-[#0f0d13] font-black ${
                isPublic ? 'bg-[#6ee74b] text-[#0f0d13]' : 'bg-[#16131b] text-[#a8a29e]'
              }`}
            >
              {isPublic ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="pixel-btn w-full py-3 bg-[#6ee74b] hover:bg-[#84f262] disabled:opacity-50 text-[#0f0d13] font-black text-sm uppercase cursor-pointer"
          >
            {busy ? 'CREATING...' : '+ CREATE ROOM'}
          </button>
        </div>

        {/* Join by Code */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleJoin(joinCode);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE (E.G. GOTG42)"
            className="flex-1 pixel-input px-3 py-2.5 text-sm placeholder-[#78716c] focus:outline-none focus:border-[#6ee74b]"
          />
          <button
            type="submit"
            disabled={busy || !joinCode.trim()}
            className="pixel-btn px-4 py-2.5 bg-[#d9843b] text-[#0f0d13] text-sm font-black uppercase disabled:opacity-50 cursor-pointer"
          >
            JOIN
          </button>
        </form>

        {/* Open Rooms List */}
        <div className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#c2d6cc]">
              Open Rooms (Broadcasted)
            </h2>
            <span className="text-xs font-bold text-[#6ee74b]">LIVE</span>
          </div>

          {rooms.length === 0 ? (
            <div className="pixel-panel p-4 text-center text-xs text-[#a8a29e]">
              NO OPEN ROOMS YET. CREATE ONE ABOVE!
            </div>
          ) : (
            rooms.map((r) => (
              <div
                key={r.id}
                className="pixel-panel p-3 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-bold uppercase">
                    {r.players.white?.name ?? 'HOST'}{' '}
                    <span className="text-xs text-[#d9843b]">#{r.code}</span>
                  </p>
                  <p className="text-xs text-[#a8a29e]">
                    {r.turnSeconds}S/TURN • {r.playerCount}/2 PLAYERS
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleJoin(r.id)}
                  className="pixel-btn px-3.5 py-1.5 bg-[#6ee74b] text-[#0f0d13] text-xs font-black uppercase cursor-pointer"
                >
                  FIGHT
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
