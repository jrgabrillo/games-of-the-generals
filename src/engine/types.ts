export type PlayerSide = 'white' | 'black';

export type RankId =
  | '5-star'
  | '4-star'
  | '3-star'
  | '2-star'
  | '1-star'
  | 'colonel'
  | 'lt-colonel'
  | 'major'
  | 'captain'
  | '1st-lt'
  | '2nd-lt'
  | 'sergeant'
  | 'private'
  | 'spy'
  | 'flag';

export type CoordKey = string; // "row,col" where row 0..7, col 0..8

export interface PublicBoardPiece {
  id: string;
  side: PlayerSide;
  revealedRank?: RankId;
}

export type BoardMap = Record<CoordKey, PublicBoardPiece>;

export type ChallengeOutcome = 'attacker' | 'defender' | 'both' | 'flag-captured';

export type WinReason =
  | 'flag-captured'
  | 'flag-back-rank'
  | 'resign'
  | 'draw'
  | 'timeout'
  | 'disconnect';

export interface LastMove {
  by: PlayerSide;
  from: CoordKey;
  to: CoordKey;
  hadChallenge: boolean;
  outcome?: ChallengeOutcome;
  eliminatedIds?: string[];
  timestamp: number;
}

export interface FlagBackRankState {
  side: PlayerSide;
  coord: CoordKey;
  mustSurviveTurn: boolean;
}

export interface GameState {
  turn: PlayerSide;
  turnStartedAt: number;
  moveCount: number;
  board: BoardMap;
  lastMove?: LastMove;
  flagAtBackRank?: FlagBackRankState | null;
  drawOfferBy?: PlayerSide | null;
  winner?: PlayerSide | 'draw' | null;
  winReason?: WinReason | null;
}

export type RoomStatus = 'waiting' | 'setup' | 'playing' | 'finished';

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
  code: string;
  hostUid: string;
  isPublic: boolean;
  turnSeconds: 15 | 30 | 60;
  status: RoomStatus;
  playerCount: number;
  createdAt: number;
  players: {
    white?: RoomPlayer;
    black?: RoomPlayer;
  };
}
