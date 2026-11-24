import React, { useMemo } from 'react';
import type { PlayerSide, RankId } from '../engine/types';

interface PieceTileProps {
  rank?: RankId;
  side: PlayerSide;
  hidden?: boolean;
}

type TileId = RankId | 'hidden';

const SHORT_LABELS: Record<TileId, string> = {
  '5-star': '5★ GEN',
  '4-star': '4★ GEN',
  '3-star': '3★ GEN',
  '2-star': '2★ GEN',
  '1-star': '1★ GEN',
  colonel: 'COLONEL',
  'lt-colonel': 'LT. COL',
  major: 'MAJOR',
  captain: 'CAPTAIN',
  '1st-lt': '1ST LT',
  '2nd-lt': '2ND LT',
  sergeant: 'SERGEANT',
  private: 'PRIVATE',
  spy: 'SPY',
  flag: 'FLAG',
  hidden: 'UNKNOWN',
};

const STAR_5X5 = ['..I..', 'IIIII', '.III.', '.I.I.', 'I...I'];
const SUN_5X5 = ['I.I.I', '.III.', 'II.II', '.III.', 'I.I.I'];
const TRI_5X5 = ['..I..', '.III.', '.I.I.', 'IIIII', 'IIIII'];
const CHEV_9X4 = ['....I....', '...III...', '..II.II..', '.II...II.'];
const SPY_EYES = [
  'II.......II',
  '..II...II..',
  'IIII...IIII',
  'I.II...II.I',
  'IIII...IIII',
  '...........',
  '...IIIII...',
];
const FLAG_ICON = [
  'II......',
  'IIIIIIII',
  'IIIIIII.',
  'IIIIII..',
  'II......',
  'II......',
  'II......',
  'II......',
  'II......',
  'IIII....',
];
const QUESTION_ICON = ['.IIII.', 'II..II', '....II', '...II.', '..II..', '......', '..II..'];

function stamp(grid: string[][], ox: number, oy: number, pattern: string[]) {
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      const ch = pattern[y][x];
      if (ch !== '.' && oy + y >= 0 && oy + y < 24 && ox + x >= 0 && ox + x < 24) {
        grid[oy + y][ox + x] = ch;
      }
    }
  }
}

function buildTileGrid(id: TileId): string[][] {
  const g: string[][] = Array.from({ length: 24 }, () => Array<string>(24).fill('.'));

  for (let y = 1; y < 23; y++) {
    for (let x = 1; x < 23; x++) {
      if (y === 1 || y === 22 || x === 1 || x === 22) {
        g[y][x] = 'O';
      } else if (y === 2 || x === 2) {
        g[y][x] = 'H';
      } else if (y === 21 || x === 21) {
        g[y][x] = 'S';
      } else {
        g[y][x] = 'B';
      }
    }
  }

  if (id !== 'hidden') {
    for (let y = 2; y <= 8; y++) {
      for (let x = 2; x <= 8; x++) {
        if (x + y <= 10) g[y][x] = 'I';
      }
    }
  }

  switch (id) {
    case '5-star':
      stamp(g, 11, 3, STAR_5X5);
      stamp(g, 6, 7, STAR_5X5);
      stamp(g, 16, 7, STAR_5X5);
      stamp(g, 8, 12, STAR_5X5);
      stamp(g, 14, 12, STAR_5X5);
      break;
    case '4-star':
      stamp(g, 7, 4, STAR_5X5);
      stamp(g, 14, 4, STAR_5X5);
      stamp(g, 7, 11, STAR_5X5);
      stamp(g, 14, 11, STAR_5X5);
      break;
    case '3-star':
      stamp(g, 15, 3, STAR_5X5);
      stamp(g, 10, 8, STAR_5X5);
      stamp(g, 5, 13, STAR_5X5);
      break;
    case '2-star':
      stamp(g, 6, 8, STAR_5X5);
      stamp(g, 14, 8, STAR_5X5);
      break;
    case '1-star':
      stamp(g, 10, 8, STAR_5X5);
      break;
    case 'colonel':
      stamp(g, 11, 4, SUN_5X5);
      stamp(g, 6, 11, SUN_5X5);
      stamp(g, 15, 11, SUN_5X5);
      break;
    case 'lt-colonel':
      stamp(g, 6, 8, SUN_5X5);
      stamp(g, 14, 8, SUN_5X5);
      break;
    case 'major':
      stamp(g, 10, 8, SUN_5X5);
      break;
    case 'captain':
      stamp(g, 10, 4, TRI_5X5);
      stamp(g, 6, 11, TRI_5X5);
      stamp(g, 14, 11, TRI_5X5);
      break;
    case '1st-lt':
      stamp(g, 6, 8, TRI_5X5);
      stamp(g, 14, 8, TRI_5X5);
      break;
    case '2nd-lt':
      stamp(g, 10, 8, TRI_5X5);
      break;
    case 'sergeant':
      stamp(g, 8, 4, CHEV_9X4);
      stamp(g, 8, 8, CHEV_9X4);
      stamp(g, 8, 12, CHEV_9X4);
      break;
    case 'private':
      stamp(g, 8, 8, CHEV_9X4);
      break;
    case 'spy':
      stamp(g, 7, 8, SPY_EYES);
      break;
    case 'flag':
      stamp(g, 9, 5, FLAG_ICON);
      break;
    case 'hidden':
      stamp(g, 9, 6, QUESTION_ICON);
      break;
  }

  return g;
}

export const PieceTile: React.FC<PieceTileProps> = ({ rank, side, hidden = false }) => {
  const tileId: TileId = hidden || !rank ? 'hidden' : rank;
  const isWhite = side === 'white';

  const pixels = useMemo(() => {
    const grid = buildTileGrid(tileId);
    const palette: Record<string, string> = isWhite
      ? {
          O: '#0f172a',
          H: '#ffffff',
          B: '#f1f5f9',
          S: '#cbd5e1',
          I: '#111827',
        }
      : {
          O: '#09090b',
          H: '#3f3f46',
          B: '#18181b',
          S: '#09090b',
          I: '#f8fafc',
        };

    const rects: React.ReactNode[] = [];
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 24; x++) {
        const ch = grid[y][x];
        if (ch !== '.') {
          rects.push(
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[ch]} />,
          );
        }
      }
    }
    return rects;
  }, [tileId, isWhite]);

  const labelBg = isWhite ? '#0f172a' : '#f8fafc';
  const labelFg = isWhite ? '#f8fafc' : '#09090b';

  return (
    <svg
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className="w-[92%] h-[92%] drop-shadow block"
      style={{ imageRendering: 'pixelated' }}
    >
      {pixels}
      <rect x="2" y="18" width="20" height="4" fill={labelBg} />
      <text
        x="12"
        y="21"
        textAnchor="middle"
        fontSize="3.1"
        fontWeight="900"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill={labelFg}
      >
        {SHORT_LABELS[tileId]}
      </text>
    </svg>
  );
};
