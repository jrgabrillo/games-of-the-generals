import type { CoordKey, PlayerSide, RankId } from './types';

export interface RankSpec {
  id: RankId;
  name: string;
  shortLabel: string;
  count: number;
  power: number;
}

export const ROSTER_SPEC: readonly RankSpec[] = [
  { id: '5-star', name: '5-Star General', shortLabel: '5★ GEN', count: 1, power: 14 },
  { id: '4-star', name: '4-Star General', shortLabel: '4★ GEN', count: 1, power: 13 },
  { id: '3-star', name: '3-Star General', shortLabel: '3★ GEN', count: 1, power: 12 },
  { id: '2-star', name: '2-Star General', shortLabel: '2★ GEN', count: 1, power: 11 },
  { id: '1-star', name: '1-Star General', shortLabel: '1★ GEN', count: 1, power: 10 },
  { id: 'colonel', name: 'Colonel', shortLabel: 'COLONEL', count: 1, power: 9 },
  { id: 'lt-colonel', name: 'Lt. Colonel', shortLabel: 'LT. COL', count: 1, power: 8 },
  { id: 'major', name: 'Major', shortLabel: 'MAJOR', count: 1, power: 7 },
  { id: 'captain', name: 'Captain', shortLabel: 'CAPTAIN', count: 1, power: 6 },
  { id: '1st-lt', name: '1st Lieutenant', shortLabel: '1ST LT', count: 1, power: 5 },
  { id: '2nd-lt', name: '2nd Lieutenant', shortLabel: '2ND LT', count: 1, power: 4 },
  { id: 'sergeant', name: 'Sergeant', shortLabel: 'SERGEANT', count: 1, power: 3 },
  { id: 'private', name: 'Private', shortLabel: 'PRIVATE', count: 6, power: 2 },
  { id: 'spy', name: 'Spy', shortLabel: 'SPY', count: 2, power: 15 },
  { id: 'flag', name: 'Flag', shortLabel: 'FLAG', count: 1, power: 0 },
] as const;

export const TOTAL_PIECES = 21;
export const BOARD_ROWS = 8;
export const BOARD_COLS = 9;

export const RANK_BY_ID: Record<RankId, RankSpec> = Object.fromEntries(
  ROSTER_SPEC.map((spec) => [spec.id, spec]),
) as Record<RankId, RankSpec>;

export function getSetupRows(side: PlayerSide): readonly number[] {
  return side === 'white' ? [0, 1, 2] : [5, 6, 7];
}

export function getBackRankRow(side: PlayerSide): number {
  return side === 'white' ? 7 : 0;
}

export function expandRoster(): RankId[] {
  const list: RankId[] = [];
  for (const spec of ROSTER_SPEC) {
    for (let i = 0; i < spec.count; i++) {
      list.push(spec.id);
    }
  }
  return list;
}

export function createRandomSetup(side: PlayerSide): {
  boardCoords: Record<CoordKey, { id: string; rank: RankId }>;
} {
  const rows = getSetupRows(side);
  const coords: CoordKey[] = [];
  for (const r of rows) {
    for (let c = 0; c < BOARD_COLS; c++) {
      coords.push(`${r},${c}`);
    }
  }

  // Fisher-Yates shuffle on all 27 setup squares
  for (let i = coords.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [coords[i], coords[j]] = [coords[j], coords[i]];
  }

  const ranks = expandRoster();
  const prefix = side === 'white' ? 'w' : 'b';
  const boardCoords: Record<CoordKey, { id: string; rank: RankId }> = {};

  ranks.forEach((rank, idx) => {
    const pieceId = `${prefix}-${String(idx + 1).padStart(2, '0')}`;
    boardCoords[coords[idx]] = { id: pieceId, rank };
  });

  return { boardCoords };
}
