# Data & API Contracts
Owner: tech-lead. Backend (`database.rules.json`, `src/api/`) implements, frontend consumes. The contract wins.

Conventions:
- Storage: Firebase Realtime Database (RTDB)
- Auth: Firebase Anonymous Auth (`auth != null`, invisible to user, persisted in browser)
- Timestamps: RTDB `serverTimestamp()` (`{".sv": "timestamp"}`) as epoch `number`
- Board coordinates: `row` `0..7` (0 = top/white home, 7 = bottom/black home), `col` `0..8` (9 columns). Keyed as `"r,c"` (e.g. `"5,4"`).

---

## 1. RTDB Paths & TypeScript Types

### `/rooms/{roomId}` (Public Lobby & Room Metadata)
Readable by any authenticated user (`auth != null`). Listed in Lobby when `status === "waiting"` and `isPublic === true`.
```ts
export type RoomStatus = 'waiting' | 'setup' | 'playing' | 'finished';
export type PlayerSide = 'white' | 'black'; // white = rows 0..2, black = rows 5..7

export interface RoomPlayer {
  uid: string;
  name: string;
  side: PlayerSide;
  ready: boolean;
  connected: boolean;
  lastSeen: number;
}

export interface RoomMeta {
  id: string;
  code: string;              // 6-char uppercase code e.g. "GOTG42"
  hostUid: string;
  isPublic: boolean;
  turnSeconds: 15 | 30 | 60; // default 30
  status: RoomStatus;
  playerCount: number;       // max 2
  createdAt: number;
  players: {
    white?: RoomPlayer;
    black?: RoomPlayer;
  };
}
```

### `/games/{roomId}` (Active Match State)
Readable/writable only by the 2 players in `/rooms/{roomId}/players`.
```ts
export type RankId =
  | '5-star' | '4-star' | '3-star' | '2-star' | '1-star'
  | 'colonel' | 'lt-colonel' | 'major' | 'captain'
  | '1st-lt' | '2nd-lt' | 'sergeant' | 'private' | 'spy' | 'flag';

export interface PublicBoardPiece {
  id: string;           // e.g. "w-01".."w-21" or "b-01".."b-21"
  side: PlayerSide;
  // Rank is NOT stored here during 'playing'; revealed only on 'finished'
  revealedRank?: RankId;
}

export interface LastMove {
  by: PlayerSide;
  from: string;         // "r,c"
  to: string;           // "r,c"
  hadChallenge: boolean;
  outcome?: 'attacker' | 'defender' | 'both' | 'flag-captured';
  eliminatedIds?: string[];
  timestamp: number;
}

export interface GameState {
  turn: PlayerSide;
  turnStartedAt: number;
  board: Record<string, PublicBoardPiece>; // key = "r,c"
  lastMove?: LastMove;
  flagAtBackRank?: {
    side: PlayerSide;
    coord: string;
    mustSurviveTurn: boolean; // true if enemy was orthogonally adjacent on arrival
  };
  drawOfferBy?: PlayerSide | null;
  winner?: PlayerSide | 'draw' | null;
  winReason?: 'flag-captured' | 'flag-back-rank' | 'resign' | 'draw' | 'timeout' | 'disconnect';
}
```

### `/private/{roomId}/{uid}` (Player's Secret Piece Ranks)
Readable/writable only by `auth.uid === uid` during `setup` and `playing` (honor-system note: challenge resolution reads/compares at move time via shared game-room secret or `/private` rules; when `status === 'finished'`, both players' pieces are copied to `board[coord].revealedRank` for the post-game reveal).

*(Note: For honor-system client resolution, `/private/{roomId}/{side}` may be readable by both room participants during `playing` ONLY if client-side challenge resolution is used, OR each player writes their own piece rank map to `/rosters/{roomId}/{side}` with UI never displaying the opponent's ranks until `status === 'finished'`. Backend/Tech Lead will enforce UI-only hiding + RTDB room-member-only access.)*
