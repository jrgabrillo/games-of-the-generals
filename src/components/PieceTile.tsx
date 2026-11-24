import React from 'react';
import type { PlayerSide, RankId } from '../engine/types';

interface PieceTileProps {
  rank?: RankId;
  side: PlayerSide;
  hidden?: boolean;
}

const LABELS: Record<RankId, string> = {
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
};

function renderStar(x: number, y: number, s: number, fg: string, key: string) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? s : s * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  return <polygon key={key} points={pts.join(' ')} fill={fg} />;
}

function renderSun(x: number, y: number, r: number, fg: string, bg: string, key: string) {
  const rays: React.ReactNode[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    rays.push(
      <line
        key={`${key}-r${i}`}
        x1={(x + (r + 0.5) * Math.cos(a)).toFixed(1)}
        y1={(y + (r + 0.5) * Math.sin(a)).toFixed(1)}
        x2={(x + (r + 2.4) * Math.cos(a)).toFixed(1)}
        y2={(y + (r + 2.4) * Math.sin(a)).toFixed(1)}
        stroke={fg}
        strokeWidth="1.3"
        strokeLinecap="round"
      />,
    );
  }
  return (
    <g key={key}>
      {rays}
      <circle cx={x} cy={y} r={r} fill={fg} />
      <rect x={x - 0.6} y={y - 1.6} width={1.2} height={3.2} fill={bg} />
    </g>
  );
}

function renderTri(x: number, y: number, s: number, fg: string, bg: string, key: string) {
  return (
    <g key={key}>
      <polygon
        points={`${x},${y - s} ${x - s * 0.9},${y + s * 0.75} ${x + s * 0.9},${y + s * 0.75}`}
        fill={fg}
      />
      <rect x={x - 0.55} y={y - 1.2} width={1.1} height={2.8} fill={bg} />
    </g>
  );
}

function renderChevron(y: number, fg: string, key: string) {
  return (
    <path
      key={key}
      d={`M13 ${y + 4} L20 ${y - 1.5} L27 ${y + 4}`}
      fill="none"
      stroke={fg}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export const PieceTile: React.FC<PieceTileProps> = ({ rank, side, hidden = false }) => {
  if (hidden || !rank) {
    const backBg = side === 'white' ? '#e7e5e4' : '#18181b';
    const backStroke = side === 'white' ? '#78716c' : '#52525b';
    const backInner = side === 'white' ? '#a8a29e' : '#3f3f46';
    const backInk = side === 'white' ? '#57534e' : '#71717a';
    return (
      <svg viewBox="0 0 40 36" className="w-[90%] h-[84%] drop-shadow">
        <rect x="1" y="1" width="38" height="34" rx="4" fill={backBg} stroke={backStroke} strokeWidth="1.8" />
        <rect
          x="4"
          y="4"
          width="32"
          height="28"
          rx="2"
          fill="none"
          stroke={backInner}
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <path
          d="M16 14a4 4 0 0 1 8 0c0 2.5-3 3-3 5.5m0 3.5v1"
          fill="none"
          stroke={backInk}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const isWhite = side === 'white';
  const bg = isWhite ? '#f8fafc' : '#18181b';
  const fg = isWhite ? '#111827' : '#f8fafc';
  const border = isWhite ? '#334155' : '#52525b';
  const sashBg = isWhite ? '#111827' : '#e4e4e7';

  let emblem: React.ReactNode = null;
  switch (rank) {
    case '5-star':
      emblem = (
        <>
          {renderStar(22, 8.5, 3.3, fg, 's1')}
          {renderStar(15.5, 13.5, 3.3, fg, 's2')}
          {renderStar(28.5, 13.5, 3.3, fg, 's3')}
          {renderStar(17.5, 20.5, 3.3, fg, 's4')}
          {renderStar(26.5, 20.5, 3.3, fg, 's5')}
        </>
      );
      break;
    case '4-star':
      emblem = (
        <>
          {renderStar(16.5, 10.5, 3.4, fg, 's1')}
          {renderStar(27, 10.5, 3.4, fg, 's2')}
          {renderStar(16.5, 19.5, 3.4, fg, 's3')}
          {renderStar(27, 19.5, 3.4, fg, 's4')}
        </>
      );
      break;
    case '3-star':
      emblem = (
        <>
          {renderStar(28, 10, 3.4, fg, 's1')}
          {renderStar(21.5, 15.5, 3.4, fg, 's2')}
          {renderStar(15, 21, 3.4, fg, 's3')}
        </>
      );
      break;
    case '2-star':
      emblem = (
        <>
          {renderStar(16.5, 15.5, 3.8, fg, 's1')}
          {renderStar(27.5, 15.5, 3.8, fg, 's2')}
        </>
      );
      break;
    case '1-star':
      emblem = renderStar(22, 15.5, 4.4, fg, 's1');
      break;
    case 'colonel':
      emblem = (
        <>
          {renderSun(22, 10.5, 2.4, fg, bg, 'u1')}
          {renderSun(16, 20, 2.4, fg, bg, 'u2')}
          {renderSun(28, 20, 2.4, fg, bg, 'u3')}
        </>
      );
      break;
    case 'lt-colonel':
      emblem = (
        <>
          {renderSun(16.5, 16, 2.7, fg, bg, 'u1')}
          {renderSun(27.5, 16, 2.7, fg, bg, 'u2')}
        </>
      );
      break;
    case 'major':
      emblem = renderSun(22, 16, 3.3, fg, bg, 'u1');
      break;
    case 'captain':
      emblem = (
        <>
          {renderTri(22, 11, 3.4, fg, bg, 't1')}
          {renderTri(16, 20.5, 3.4, fg, bg, 't2')}
          {renderTri(28, 20.5, 3.4, fg, bg, 't3')}
        </>
      );
      break;
    case '1st-lt':
      emblem = (
        <>
          {renderTri(16.5, 16, 3.8, fg, bg, 't1')}
          {renderTri(27.5, 16, 3.8, fg, bg, 't2')}
        </>
      );
      break;
    case '2nd-lt':
      emblem = renderTri(22, 16, 4.4, fg, bg, 't1');
      break;
    case 'sergeant':
      emblem = (
        <>
          {renderChevron(11.5, fg, 'c1')}
          {renderChevron(15.5, fg, 'c2')}
          {renderChevron(19.5, fg, 'c3')}
        </>
      );
      break;
    case 'private':
      emblem = renderChevron(16, fg, 'c1');
      break;
    case 'spy':
      emblem = (
        <>
          <path
            d="M9.5 11.5 L19 16.5 L21 16.5 L31.5 11"
            fill="none"
            stroke={fg}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 15.5 Q14.5 19 18.5 17.5 Q14.5 14.5 10.5 15.5 Z"
            fill="none"
            stroke={fg}
            strokeWidth="1.5"
          />
          <circle cx="15" cy="16.8" r="1.3" fill={fg} />
          <path
            d="M22.5 17.5 Q26.5 19 30.5 15.5 Q26.5 14.5 22.5 17.5 Z"
            fill="none"
            stroke={fg}
            strokeWidth="1.5"
          />
          <circle cx="26" cy="16.8" r="1.3" fill={fg} />
          <path
            d="M16.5 22 Q20.5 20.5 24.5 22"
            fill="none"
            stroke={fg}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </>
      );
      break;
    case 'flag':
      emblem = (
        <>
          <line x1="14" y1="7" x2="14" y2="23.5" stroke={fg} strokeWidth="2" strokeLinecap="round" />
          <path d="M14 8 L29 11.5 L14 16 Z" fill={fg} />
        </>
      );
      break;
  }

  return (
    <svg viewBox="0 0 40 36" className="w-[92%] h-[88%] drop-shadow">
      <rect x="1" y="1" width="38" height="34" rx="4" fill={bg} stroke={border} strokeWidth="1.6" />
      <polygon points="1,1 13,1 1,13" fill={sashBg} />
      {emblem}
      <text
        x="20"
        y="32.2"
        textAnchor="middle"
        fontSize="6"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.15"
        fill={fg}
      >
        {LABELS[rank]}
      </text>
    </svg>
  );
};
