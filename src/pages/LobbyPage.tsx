import React, { useEffect, useState } from 'react';
import { createRoom, joinRoom, subscribePublicRooms } from '../api/roomService';
import type { RoomMeta } from '../engine/types';
import { isFirebaseConfigured } from '../lib/firebase';

interface LobbyPageProps {
  uid: string;
  name: string;
  onNameChange: (name: string) => void;
  onEnterRoom: (roomId: string) => void;
}

export const LobbyPage: React.FC<LobbyPageProps> = ({
  uid,
  name,
  onNameChange,
  onEnterRoom,
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
    onNameChange(`General-${num}`);
  };

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const displayName = name.trim() || 'General';
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
      const displayName = name.trim() || 'General';
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
    <div className="min-h-[100dvh] bg-[#161512] text-[#f5f5f4] flex flex-col items-center p-4">
      <div className="w-full max-w-[440px] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#81b64c] flex items-center justify-center text-[#161512] font-black text-lg shadow">
              ⚑
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Games of the Generals</h1>
              <p className="text-xs text-[#a8a29e]">Free-to-play • No login required</p>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              isFirebaseConfigured
                ? 'bg-[#262421] border-[#3a3835] text-[#81b64c]'
                : 'bg-[#262421] border-[#f59e0b]/40 text-[#f59e0b]'
            }`}
            title={
              isFirebaseConfigured
                ? 'Connected to Firebase Realtime Database'
                : 'No Firebase .env found — running Local 2-Tab Broadcast Mode'
            }
          >
            {isFirebaseConfigured ? '● RTDB Live' : '● Local 2-Tab'}
          </span>
        </div>

        {error && (
          <div className="bg-[#e04f4f]/15 border border-[#e04f4f] text-[#fecaca] rounded-xl px-3.5 py-2.5 text-xs">
            {error}
          </div>
        )}

        {/* Callsign */}
        <div className="bg-[#262421] rounded-xl p-3.5 border border-[#3a3835] space-y-2">
          <label htmlFor="callsign" className="block text-xs font-medium text-[#a8a29e]">
            Your Callsign
          </label>
          <div className="flex gap-2">
            <input
              id="callsign"
              type="text"
              maxLength={20}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="flex-1 bg-[#161512] border border-[#3a3835] rounded-lg px-3 py-2 text-sm text-[#f5f5f4] focus:outline-none focus:border-[#81b64c]"
              placeholder="Enter callsign..."
            />
            <button
              type="button"
              onClick={handleRandomName}
              className="px-3 py-2 bg-[#302e2b] rounded-lg text-xs font-medium text-[#d6d3d1] hover:bg-[#3c3935] cursor-pointer"
              aria-label="Randomize callsign"
            >
              🎲
            </button>
          </div>
        </div>

        {/* Create & Broadcast Room */}
        <div className="bg-[#262421] rounded-xl p-4 border border-[#3a3835] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Create Match Room</span>
            <span className="text-xs text-[#a8a29e]">Max 2 Players</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([15, 30, 60] as const).map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setTurnSeconds(sec)}
                className={`py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                  turnSeconds === sec
                    ? 'bg-[#81b64c]/20 border-[#81b64c] text-[#81b64c]'
                    : 'bg-[#302e2b] border-[#3a3835] text-[#d6d3d1]'
                }`}
              >
                {sec}s / turn
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-[#d6d3d1] py-1 cursor-pointer"
          >
            <span>Broadcast in Public Lobby</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                isPublic ? 'bg-[#81b64c] text-[#161512]' : 'bg-[#302e2b] text-[#a8a29e]'
              }`}
            >
              {isPublic ? 'ON' : 'PRIVATE'}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="w-full py-3 rounded-xl bg-[#81b64c] hover:bg-[#92c65d] disabled:opacity-50 text-[#161512] font-bold text-sm shadow transition cursor-pointer"
          >
            {busy ? 'Creating...' : '+ Create & Broadcast Room'}
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
            placeholder="Enter Room Code (e.g. GOTG42)"
            className="flex-1 bg-[#262421] border border-[#3a3835] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f4] placeholder-[#78716c] focus:outline-none focus:border-[#81b64c]"
          />
          <button
            type="submit"
            disabled={busy || !joinCode.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#302e2b] border border-[#3a3835] text-sm font-semibold hover:bg-[#3c3935] disabled:opacity-50 cursor-pointer"
          >
            Join
          </button>
        </form>

        {/* Open Rooms List */}
        <div className="space-y-2 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#a8a29e]">
              Open Rooms (Broadcasted)
            </h2>
            <span className="text-xs text-[#81b64c]">Live</span>
          </div>

          {rooms.length === 0 ? (
            <div className="bg-[#262421] rounded-xl p-4 border border-[#3a3835] text-center text-xs text-[#a8a29e]">
              No open public rooms right now. Create one above or open a second tab to test!
            </div>
          ) : (
            rooms.map((r) => (
              <div
                key={r.id}
                className="bg-[#262421] rounded-xl p-3 border border-[#3a3835] flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {r.players.white?.name ?? 'Host'}{' '}
                    <span className="text-xs text-[#a8a29e]">#{r.code}</span>
                  </p>
                  <p className="text-xs text-[#a8a29e]">
                    {r.turnSeconds}s/turn • {r.playerCount}/2 players
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleJoin(r.id)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#81b64c] text-[#161512] text-xs font-bold cursor-pointer hover:bg-[#92c65d]"
                >
                  Challenge
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
