import {
  get,
  onDisconnect,
  onValue,
  ref,
  set,
  update,
} from 'firebase/database';
import { applyMove, validateSetup } from '../engine/rules';
import type {
  BoardMap,
  CoordKey,
  GameState,
  PlayerSide,
  RankId,
  RoomMeta,
  WinReason,
} from '../engine/types';
import { db, isFirebaseConfigured } from '../lib/firebase';

export type RosterMap = Record<string, RankId>; // pieceId -> RankId
export type RoomRosters = {
  white?: RosterMap;
  black?: RosterMap;
  whiteCoords?: Record<CoordKey, string>;
  blackCoords?: Record<CoordKey, string>;
};

const LOCAL_PREFIX = 'gotg_local_store_';
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gotg-sync') : null;

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// --- Local Fallback Store (for zero-config 2-tab testing) ---
function localRead<T>(key: string): T | null {
  const raw = localStorage.getItem(LOCAL_PREFIX + key);
  return raw ? (JSON.parse(raw) as T) : null;
}

function localWrite(key: string, val: unknown): void {
  if (val === null || val === undefined) {
    localStorage.removeItem(LOCAL_PREFIX + key);
  } else {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(val));
  }
  channel?.postMessage({ key });
}

function localSubscribe<T>(key: string, cb: (val: T | null) => void): () => void {
  cb(localRead<T>(key));
  const onMsg = (e: MessageEvent<{ key: string }>) => {
    if (e.data?.key === key) cb(localRead<T>(key));
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_PREFIX + key) cb(localRead<T>(key));
  };
  channel?.addEventListener('message', onMsg);
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
  };
}

function getAllLocalRooms(): Record<string, RoomMeta> {
  const rooms: Record<string, RoomMeta> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LOCAL_PREFIX + 'rooms/')) {
      const id = k.replace(LOCAL_PREFIX + 'rooms/', '');
      const val = localRead<RoomMeta>(`rooms/${id}`);
      if (val) rooms[id] = val;
    }
  }
  return rooms;
}

// --- Public API ---

export function subscribePublicRooms(cb: (rooms: RoomMeta[]) => void): () => void {
  const filterOpen = (all: Record<string, RoomMeta> | null): RoomMeta[] => {
    if (!all) return [];
    return Object.values(all)
      .filter((r) => r.isPublic && r.status === 'waiting' && r.playerCount < 2)
      .sort((a, b) => b.createdAt - a.createdAt);
  };

  if (isFirebaseConfigured && db) {
    const roomsRef = ref(db, 'rooms');
    return onValue(roomsRef, (snap) => {
      cb(filterOpen(snap.val() as Record<string, RoomMeta> | null));
    });
  }

  const emit = () => cb(filterOpen(getAllLocalRooms()));
  emit();
  const onMsg = () => emit();
  const onStorage = () => emit();
  channel?.addEventListener('message', onMsg);
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.removeEventListener('message', onMsg);
    window.removeEventListener('storage', onStorage);
  };
}

export async function createRoom(params: {
  uid: string;
  name: string;
  isPublic: boolean;
  turnSeconds: 15 | 30 | 60;
}): Promise<{ roomId: string; code: string }> {
  const code = generateCode();
  const roomId = code;
  const now = Date.now();
  const room: RoomMeta = {
    id: roomId,
    code,
    hostUid: params.uid,
    isPublic: params.isPublic,
    turnSeconds: params.turnSeconds,
    status: 'waiting',
    playerCount: 1,
    createdAt: now,
    players: {
      white: {
        uid: params.uid,
        name: params.name,
        side: 'white',
        ready: false,
        connected: true,
        lastSeen: now,
      },
    },
  };

  if (isFirebaseConfigured && db) {
    await set(ref(db, `rooms/${roomId}`), room);
  } else {
    localWrite(`rooms/${roomId}`, room);
  }
  return { roomId, code };
}

export async function joinRoom(params: {
  roomIdOrCode: string;
  uid: string;
  name: string;
}): Promise<RoomMeta> {
  const roomId = params.roomIdOrCode.trim().toUpperCase();
  const now = Date.now();

  let room: RoomMeta | null = null;
  if (isFirebaseConfigured && db) {
    const snap = await get(ref(db, `rooms/${roomId}`));
    room = snap.val() as RoomMeta | null;
  } else {
    room = localRead<RoomMeta>(`rooms/${roomId}`);
  }

  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  // Reconnect if user is already in this room
  if (room.players?.white?.uid === params.uid) {
    room.players.white.connected = true;
    room.players.white.lastSeen = now;
    if (isFirebaseConfigured && db) {
      await update(ref(db, `rooms/${roomId}/players/white`), {
        connected: true,
        lastSeen: now,
      });
    } else {
      localWrite(`rooms/${roomId}`, room);
    }
    return room;
  }

  if (room.players?.black?.uid === params.uid) {
    room.players.black.connected = true;
    room.players.black.lastSeen = now;
    if (isFirebaseConfigured && db) {
      await update(ref(db, `rooms/${roomId}/players/black`), {
        connected: true,
        lastSeen: now,
      });
    } else {
      localWrite(`rooms/${roomId}`, room);
    }
    return room;
  }

  if (room.playerCount >= 2 || (room.players?.white && room.players?.black)) {
    throw new Error('Room is full (2/2 players).');
  }

  const side: PlayerSide = room.players?.white ? 'black' : 'white';
  const updatedRoom: RoomMeta = {
    ...room,
    status: 'setup',
    playerCount: 2,
    players: {
      ...room.players,
      [side]: {
        uid: params.uid,
        name: params.name,
        side,
        ready: false,
        connected: true,
        lastSeen: now,
      },
    },
  };

  if (isFirebaseConfigured && db) {
    await set(ref(db, `rooms/${roomId}`), updatedRoom);
  } else {
    localWrite(`rooms/${roomId}`, updatedRoom);
  }

  return updatedRoom;
}

export function subscribeRoom(roomId: string, cb: (room: RoomMeta | null) => void): () => void {
  if (isFirebaseConfigured && db) {
    return onValue(ref(db, `rooms/${roomId}`), (snap) => {
      cb(snap.val() as RoomMeta | null);
    });
  }
  return localSubscribe<RoomMeta>(`rooms/${roomId}`, cb);
}

export function subscribeGame(roomId: string, cb: (game: GameState | null) => void): () => void {
  if (isFirebaseConfigured && db) {
    return onValue(ref(db, `games/${roomId}`), (snap) => {
      cb(snap.val() as GameState | null);
    });
  }
  return localSubscribe<GameState>(`games/${roomId}`, cb);
}

export function subscribeRosters(
  roomId: string,
  cb: (rosters: RoomRosters | null) => void,
): () => void {
  if (isFirebaseConfigured && db) {
    return onValue(ref(db, `rosters/${roomId}`), (snap) => {
      cb(snap.val() as RoomRosters | null);
    });
  }
  return localSubscribe<RoomRosters>(`rosters/${roomId}`, cb);
}

export async function submitSetup(params: {
  roomId: string;
  side: PlayerSide;
  boardCoords: Record<CoordKey, { id: string; rank: RankId }>;
}): Promise<void> {
  const { roomId, side, boardCoords } = params;
  const check = validateSetup(side, boardCoords);
  if (!check.valid) {
    throw new Error(check.error ?? 'Invalid setup');
  }

  const rankMap: RosterMap = {};
  const coordMap: Record<CoordKey, string> = {};
  for (const [coord, piece] of Object.entries(boardCoords)) {
    rankMap[piece.id] = piece.rank;
    coordMap[coord] = piece.id;
  }

  const readRoom = async (): Promise<RoomMeta | null> => {
    if (isFirebaseConfigured && db) {
      const snap = await get(ref(db, `rooms/${roomId}`));
      return snap.val() as RoomMeta | null;
    }
    return localRead<RoomMeta>(`rooms/${roomId}`);
  };

  const readRosters = async (): Promise<RoomRosters> => {
    if (isFirebaseConfigured && db) {
      const snap = await get(ref(db, `rosters/${roomId}`));
      return (snap.val() as RoomRosters | null) ?? {};
    }
    return localRead<RoomRosters>(`rosters/${roomId}`) ?? {};
  };

  const rosters = await readRosters();
  const nextRosters: RoomRosters = {
    ...rosters,
    [side]: rankMap,
    [`${side}Coords`]: coordMap,
  };

  if (isFirebaseConfigured && db) {
    await update(ref(db, `rosters/${roomId}`), {
      [side]: rankMap,
      [`${side}Coords`]: coordMap,
    });
    await update(ref(db, `rooms/${roomId}/players/${side}`), { ready: true });
  } else {
    localWrite(`rosters/${roomId}`, nextRosters);
    const r = await readRoom();
    if (r?.players?.[side]) {
      r.players[side]!.ready = true;
      localWrite(`rooms/${roomId}`, r);
    }
  }

  // Check if both players are ready -> start match!
  const room = await readRoom();
  if (room?.players?.white?.ready && room?.players?.black?.ready) {
    const latestRosters = await readRosters();
    const board: BoardMap = {};
    for (const [coord, id] of Object.entries(latestRosters.whiteCoords ?? {})) {
      board[coord] = { id, side: 'white' };
    }
    for (const [coord, id] of Object.entries(latestRosters.blackCoords ?? {})) {
      board[coord] = { id, side: 'black' };
    }

    const firstTurn: PlayerSide = Math.random() < 0.5 ? 'white' : 'black';
    const initialGame: GameState = {
      turn: firstTurn,
      turnStartedAt: Date.now(),
      moveCount: 0,
      board,
      flagAtBackRank: null,
      drawOfferBy: null,
      winner: null,
      winReason: null,
    };

    if (isFirebaseConfigured && db) {
      await set(ref(db, `games/${roomId}`), initialGame);
      await update(ref(db, `rooms/${roomId}`), { status: 'playing' });
    } else {
      localWrite(`games/${roomId}`, initialGame);
      room.status = 'playing';
      localWrite(`rooms/${roomId}`, room);
    }
  }
}

export async function makeMove(params: {
  roomId: string;
  side: PlayerSide;
  from: CoordKey;
  to: CoordKey;
  game: GameState;
  rosters: RoomRosters;
}): Promise<void> {
  const { roomId, side, from, to, game, rosters } = params;
  const ranksByPieceId: RosterMap = {
    ...(rosters.white ?? {}),
    ...(rosters.black ?? {}),
  };

  const nextState = applyMove({
    state: game,
    from,
    to,
    side,
    ranksByPieceId,
    now: Date.now(),
  });

  if (isFirebaseConfigured && db) {
    await set(ref(db, `games/${roomId}`), JSON.parse(JSON.stringify(nextState)));
    if (nextState.winner) {
      await update(ref(db, `rooms/${roomId}`), { status: 'finished' });
    }
  } else {
    localWrite(`games/${roomId}`, nextState);
    if (nextState.winner) {
      const r = localRead<RoomMeta>(`rooms/${roomId}`);
      if (r) {
        r.status = 'finished';
        localWrite(`rooms/${roomId}`, r);
      }
    }
  }
}

export async function endGameEarly(params: {
  roomId: string;
  game: GameState;
  rosters: RoomRosters;
  winner: PlayerSide | 'draw';
  winReason: WinReason;
}): Promise<void> {
  const { roomId, game, rosters, winner, winReason } = params;
  const ranksByPieceId: RosterMap = {
    ...(rosters.white ?? {}),
    ...(rosters.black ?? {}),
  };

  const revealedBoard: BoardMap = {};
  for (const [coord, piece] of Object.entries(game.board ?? {})) {
    revealedBoard[coord] = {
      ...piece,
      revealedRank: ranksByPieceId[piece.id],
    };
  }

  const nextState: GameState = {
    ...game,
    board: revealedBoard,
    drawOfferBy: null,
    winner,
    winReason,
  };

  if (isFirebaseConfigured && db) {
    await set(ref(db, `games/${roomId}`), nextState);
    await update(ref(db, `rooms/${roomId}`), { status: 'finished' });
  } else {
    localWrite(`games/${roomId}`, nextState);
    const r = localRead<RoomMeta>(`rooms/${roomId}`);
    if (r) {
      r.status = 'finished';
      localWrite(`rooms/${roomId}`, r);
    }
  }
}

export async function offerDraw(roomId: string, side: PlayerSide): Promise<void> {
  if (isFirebaseConfigured && db) {
    await update(ref(db, `games/${roomId}`), { drawOfferBy: side });
  } else {
    const g = localRead<GameState>(`games/${roomId}`);
    if (g) {
      g.drawOfferBy = side;
      localWrite(`games/${roomId}`, g);
    }
  }
}

export async function declineDraw(roomId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await update(ref(db, `games/${roomId}`), { drawOfferBy: null });
  } else {
    const g = localRead<GameState>(`games/${roomId}`);
    if (g) {
      g.drawOfferBy = null;
      localWrite(`games/${roomId}`, g);
    }
  }
}

export async function requestRematch(roomId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await set(ref(db, `games/${roomId}`), null);
    await set(ref(db, `rosters/${roomId}`), null);
    await update(ref(db, `rooms/${roomId}`), { status: 'setup' });
    await update(ref(db, `rooms/${roomId}/players/white`), { ready: false });
    await update(ref(db, `rooms/${roomId}/players/black`), { ready: false });
  } else {
    localWrite(`games/${roomId}`, null);
    localWrite(`rosters/${roomId}`, null);
    const r = localRead<RoomMeta>(`rooms/${roomId}`);
    if (r) {
      r.status = 'setup';
      if (r.players.white) r.players.white.ready = false;
      if (r.players.black) r.players.black.ready = false;
      localWrite(`rooms/${roomId}`, r);
    }
  }
}

export function attachPresence(roomId: string, side: PlayerSide): () => void {
  if (isFirebaseConfigured && db) {
    const connectedRef = ref(db, '.info/connected');
    const playerRef = ref(db, `rooms/${roomId}/players/${side}`);
    return onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        void onDisconnect(playerRef).update({
          connected: false,
          lastSeen: Date.now(),
        });
        void update(playerRef, { connected: true, lastSeen: Date.now() });
      }
    });
  }
  return () => {};
}
