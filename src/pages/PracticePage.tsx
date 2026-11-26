import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PieceTile } from '../components/PieceTile';
import {
  chooseBotMove,
  createBotSetup,
  createInitialBelief,
  updateBeliefAfterMove,
  type BotBeliefState,
  type BotDifficulty,
} from '../engine/bot';
import {
  BOARD_COLS,
  BOARD_ROWS,
  ROSTER_SPEC,
  TOTAL_PIECES,
  createRandomSetup,
  getSetupRows,
} from '../engine/roster';
import { applyMove, formatCoord, getLegalMoves, parseCoord } from '../engine/rules';
import type { BoardMap, CoordKey, GameState, PlayerSide, RankId } from '../engine/types';
import { playSound } from '../lib/sound';

interface PracticePageProps {
  playerName: string;
  onBack: () => void;
}

const PRESET_KEY = 'gotg_saved_preset_v1';
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const BOT_META: Record<
  BotDifficulty,
  { label: string; title: string; badge: string; desc: string; color: string }
> = {
  private: {
    label: 'PRIVATE BOT',
    title: 'PRIVATE (EASY)',
    badge: 'EASY',
    desc: 'Rookie recruit. Random setups and casual moves — great for learning.',
    color: 'bg-[#6ee74b] text-[#0f0d13]',
  },
  general: {
    label: 'GENERAL BOT',
    title: 'GENERAL (MODERATE)',
    badge: 'MODERATE',
    desc: 'Field commander. Tactical formations, challenge memory & active defense.',
    color: 'bg-[#d9843b] text-[#0f0d13]',
  },
  spy: {
    label: 'SPY BOT',
    title: 'SPY (HARD)',
    badge: 'HARD',
    desc: 'Master tactician. Deceptive setups, fair rank deduction, scouting & traps.',
    color: 'bg-[#dc2626] text-white',
  },
};

const PixelBoardFrame: React.FC<{ children: React.ReactNode; overlay?: React.ReactNode }> = ({
  children,
  overlay,
}) => (
  <div className="pixel-board-outer w-full shrink-0">
    <div className="pixel-board-wood p-1.5 sm:p-2">
      <div className="grid grid-cols-9 px-3.5 pb-0.5 text-center text-[10px] font-black text-[#6b3410] select-none">
        {COL_LABELS.map((l) => (
          <span key={`top-${l}`}>{l}</span>
        ))}
      </div>
      <div className="flex items-stretch">
        <div className="flex flex-col justify-around pr-1 text-[10px] font-black text-[#6b3410] select-none">
          {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
            <span key={`l-${n}`}>{n}</span>
          ))}
        </div>
        <div className="relative flex-1 aspect-square border-2 border-[#382e3b] overflow-hidden">
          <div className="grid grid-cols-9 grid-rows-8 w-full h-full">{children}</div>
          {overlay}
        </div>
        <div className="flex flex-col justify-around pl-1 text-[10px] font-black text-[#6b3410] select-none">
          {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
            <span key={`r-${n}`}>{n}</span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-9 px-3.5 pt-0.5 text-center text-[10px] font-black text-[#6b3410] select-none">
        {COL_LABELS.map((l) => (
          <span key={`bot-${l}`}>{l}</span>
        ))}
      </div>
    </div>
  </div>
);

export const PracticePage: React.FC<PracticePageProps> = ({ playerName, onBack }) => {
  // Player is canonical 'black' (rows 5..7, bottom) & visually rendered as White.
  // Bot is canonical 'white' (rows 0..2, top) & visually rendered as Black.
  const mySide: PlayerSide = 'black';
  const botSide: PlayerSide = 'white';

  const [phase, setPhase] = useState<'select' | 'setup' | 'playing'>('select');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('general');
  const [turnSeconds, setTurnSeconds] = useState<0 | 30>(0); // 0 = No Timer
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Setup state
  const [setupMap, setSetupMap] = useState<Record<CoordKey, { id: string; rank: RankId }>>({});
  const [setupSelected, setSetupSelected] = useState<CoordKey | null>(null);
  const [trayRank, setTrayRank] = useState<RankId | null>(null);

  // Match state
  const [game, setGame] = useState<GameState | null>(null);
  const [allRanks, setAllRanks] = useState<Record<string, RankId>>({});
  const [botRanks, setBotRanks] = useState<Record<string, RankId>>({});
  const [myRanks, setMyRanks] = useState<Record<string, RankId>>({});
  const [belief, setBelief] = useState<BotBeliefState | null>(null);
  const [selectedCoord, setSelectedCoord] = useState<CoordKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [hideEndModal, setHideEndModal] = useState(false);

  const lastTickSecRef = useRef<number | null>(null);
  const swipeRef = useRef<{ coord: CoordKey; x: number; y: number } | null>(null);

  const rows = useMemo(() => Array.from({ length: BOARD_ROWS }, (_, i) => i), []);
  const cols = useMemo(() => Array.from({ length: BOARD_COLS }, (_, i) => i), []);

  // Turn timer tick (when timer enabled)
  useEffect(() => {
    if (phase !== 'playing' || !game || game.winner || turnSeconds === 0) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase, game, turnSeconds]);

  const elapsedSec = game ? Math.floor((nowMs - game.turnStartedAt) / 1000) : 0;
  const remainingSec = turnSeconds > 0 ? Math.max(0, turnSeconds - elapsedSec) : 0;

  // Countdown tick below 6s & timeout loss
  useEffect(() => {
    if (phase !== 'playing' || !game || game.winner || turnSeconds === 0 || game.turn !== mySide) {
      lastTickSecRef.current = null;
      return;
    }
    if (remainingSec > 0 && remainingSec < 6 && lastTickSecRef.current !== remainingSec) {
      lastTickSecRef.current = remainingSec;
      playSound('tick', muted);
    }
    if (remainingSec === 0) {
      const revealedBoard: BoardMap = {};
      for (const [coord, piece] of Object.entries(game.board)) {
        revealedBoard[coord] = { ...piece, revealedRank: allRanks[piece.id] };
      }
      setGame({
        ...game,
        board: revealedBoard,
        winner: botSide,
        winReason: 'timeout',
      });
      playSound('lose', muted);
    }
  }, [phase, game, turnSeconds, remainingSec, muted, allRanks]);

  // Automatic Bot Move Effect
  useEffect(() => {
    if (phase !== 'playing' || !game || game.winner || game.turn !== botSide || !belief) return;

    const delay = 520 + Math.floor(Math.random() * 360);
    const id = window.setTimeout(() => {
      const move = chooseBotMove({
        state: game,
        botSide,
        botRanks,
        difficulty,
        belief,
      });

      if (!move) {
        // No legal moves (rare edge case) -> player wins
        const revealedBoard: BoardMap = {};
        for (const [coord, piece] of Object.entries(game.board)) {
          revealedBoard[coord] = { ...piece, revealedRank: allRanks[piece.id] };
        }
        setGame({ ...game, board: revealedBoard, winner: mySide, winReason: 'resign' });
        playSound('win', muted);
        return;
      }

      const next = applyMove({
        state: game,
        from: move.from,
        to: move.to,
        side: botSide,
        ranksByPieceId: allRanks,
        now: Date.now(),
      });
      const nextBelief = updateBeliefAfterMove({
        belief,
        prevState: game,
        nextState: next,
        botSide,
        botRanks,
      });
      setBelief(nextBelief);
      setGame(next);
      setNowMs(Date.now());
      if (next.winner) {
        playSound(next.winner === mySide ? 'win' : 'lose', muted);
      } else {
        playSound(next.lastMove?.hadChallenge ? 'challenge' : 'move', muted);
      }
    }, delay);

    return () => window.clearTimeout(id);
  }, [phase, game, belief, botRanks, difficulty, allRanks, muted]);

  const legalTargets = useMemo(() => {
    if (!game || !selectedCoord || game.turn !== mySide || game.winner) {
      return new Set<CoordKey>();
    }
    return new Set(getLegalMoves(game.board, selectedCoord, mySide));
  }, [game, selectedCoord]);

  const { myEliminatedRanks, oppEliminatedCount } = useMemo(() => {
    if (!game) return { myEliminatedRanks: [] as RankId[], oppEliminatedCount: 0 };
    const aliveIds = new Set(Object.values(game.board).map((p) => p.id));
    const myDead: RankId[] = [];
    for (const [id, rank] of Object.entries(myRanks)) {
      if (!aliveIds.has(id)) myDead.push(rank);
    }
    const oppAliveCount = Object.values(game.board).filter((p) => p.side === botSide).length;
    return { myEliminatedRanks: myDead, oppEliminatedCount: 21 - oppAliveCount };
  }, [game, myRanks]);

  const startMatchFromSetup = () => {
    const botSetup = createBotSetup(botSide, difficulty);
    const board: BoardMap = {};
    const combinedRanks: Record<string, RankId> = {};
    const pRanks: Record<string, RankId> = {};
    const bRanks: Record<string, RankId> = {};

    for (const [coord, p] of Object.entries(setupMap)) {
      board[coord] = { id: p.id, side: mySide };
      combinedRanks[p.id] = p.rank;
      pRanks[p.id] = p.rank;
    }
    for (const [coord, p] of Object.entries(botSetup)) {
      board[coord] = { id: p.id, side: botSide };
      combinedRanks[p.id] = p.rank;
      bRanks[p.id] = p.rank;
    }

    const firstTurn: PlayerSide = Math.random() < 0.5 ? mySide : botSide;
    const initial: GameState = {
      turn: firstTurn,
      turnStartedAt: Date.now(),
      moveCount: 0,
      board,
      flagAtBackRank: null,
      drawOfferBy: null,
      winner: null,
      winReason: null,
    };

    setAllRanks(combinedRanks);
    setMyRanks(pRanks);
    setBotRanks(bRanks);
    setBelief(createInitialBelief(board, botSide));
    setGame(initial);
    setSelectedCoord(null);
    setHideEndModal(false);
    setNowMs(Date.now());
    setPhase('playing');
  };

  // --- PHASE 1: DIFFICULTY SELECTOR ---
  if (phase === 'select') {
    return (
      <div className="min-h-[100dvh] bg-[#1e1a24] text-[#f5f5f4] flex flex-col items-center p-4">
        <div className="w-full max-w-[440px] space-y-4">
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 pixel-btn bg-[#d9843b] flex items-center justify-center text-[#0f0d13] font-black text-lg">
                🤖
              </div>
              <div>
                <h1 className="text-base font-black uppercase">Practice Mode</h1>
                <p className="text-xs text-[#a8a29e]">OFFLINE VS. AI BOT</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="pixel-btn px-3 py-1.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
            >
              ← LOBBY
            </button>
          </div>

          <div className="pixel-panel p-4 space-y-3">
            <h2 className="text-xs font-black uppercase text-[#c2d6cc]">Choose Bot Difficulty</h2>
            <div className="space-y-2.5">
              {(['private', 'general', 'spy'] as const).map((tier) => {
                const info = BOT_META[tier];
                const active = difficulty === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setDifficulty(tier)}
                    className={`w-full text-left p-3 border-2 cursor-pointer transition ${
                      active
                        ? 'bg-[#3a3244] border-[#6ee74b]'
                        : 'bg-[#16131b] border-[#0f0d13] hover:bg-[#231e2a]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black uppercase">{info.title}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-black border border-[#0f0d13] ${info.color}`}>
                        {info.badge}
                      </span>
                    </div>
                    <p className="text-xs text-[#a8a29e] mt-1">{info.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pixel-panel p-4 space-y-3">
            <h2 className="text-xs font-black uppercase text-[#c2d6cc]">Turn Timer</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTurnSeconds(0)}
                className={`pixel-btn py-2 text-xs font-black uppercase cursor-pointer ${
                  turnSeconds === 0 ? 'bg-[#6ee74b] text-[#0f0d13]' : 'bg-[#3a3244] text-[#f5f5f4]'
                }`}
              >
                NO TIMER
              </button>
              <button
                type="button"
                onClick={() => setTurnSeconds(30)}
                className={`pixel-btn py-2 text-xs font-black uppercase cursor-pointer ${
                  turnSeconds === 30 ? 'bg-[#6ee74b] text-[#0f0d13]' : 'bg-[#3a3244] text-[#f5f5f4]'
                }`}
              >
                30S / TURN
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSetupMap({});
              setSetupSelected(null);
              setTrayRank(null);
              setPhase('setup');
            }}
            className="pixel-btn w-full py-3 bg-[#6ee74b] text-[#0f0d13] font-black text-sm uppercase cursor-pointer"
          >
            START PRACTICE →
          </button>
        </div>
      </div>
    );
  }

  // --- PHASE 2: MANUAL / RANDOMIZE SETUP ---
  if (phase === 'setup') {
    const allowedRows = new Set(getSetupRows(mySide));
    const placedCount = Object.keys(setupMap).length;

    const placedCounts: Partial<Record<RankId, number>> = {};
    for (const p of Object.values(setupMap)) {
      placedCounts[p.rank] = (placedCounts[p.rank] ?? 0) + 1;
    }
    const remainingByRank = ROSTER_SPEC.map((spec) => ({
      ...spec,
      left: spec.count - (placedCounts[spec.id] ?? 0),
    }));

    const getNextPieceId = (map: Record<CoordKey, { id: string; rank: RankId }>) => {
      const used = new Set(Object.values(map).map((p) => p.id));
      for (let i = 1; i <= TOTAL_PIECES; i++) {
        const id = `b-${String(i).padStart(2, '0')}`;
        if (!used.has(id)) return id;
      }
      return `b-${Date.now()}`;
    };

    const handleSetupCellClick = (coord: CoordKey) => {
      const [r] = parseCoord(coord);
      if (!allowedRows.has(r)) return;

      if (trayRank) {
        const left = remainingByRank.find((x) => x.id === trayRank)?.left ?? 0;
        if (left > 0 && !setupMap[coord]) {
          const next = {
            ...setupMap,
            [coord]: { id: getNextPieceId(setupMap), rank: trayRank },
          };
          setSetupMap(next);
          if (left - 1 <= 0) {
            const nextAvail = remainingByRank.find((x) => x.id !== trayRank && x.left > 0);
            setTrayRank(nextAvail ? nextAvail.id : null);
          }
          return;
        }
      }

      if (!setupSelected) {
        if (setupMap[coord]) {
          setSetupSelected(coord);
          setTrayRank(null);
        }
        return;
      }

      if (setupSelected === coord) {
        setSetupSelected(null);
        return;
      }

      const next = { ...setupMap };
      const a = next[setupSelected];
      const b = next[coord];
      if (b) {
        next[setupSelected] = b;
        next[coord] = a;
      } else {
        next[coord] = a;
        delete next[setupSelected];
      }
      setSetupMap(next);
      setSetupSelected(null);
    };

    const handleSavePreset = () => {
      if (placedCount !== TOTAL_PIECES) return;
      const minRow = Math.min(...getSetupRows(mySide));
      const rel: Record<string, RankId> = {};
      for (const [coord, p] of Object.entries(setupMap)) {
        const [r, c] = parseCoord(coord);
        rel[`${r - minRow},${c}`] = p.rank;
      }
      localStorage.setItem(PRESET_KEY, JSON.stringify(rel));
      setToast('PRESET SAVED!');
      setTimeout(() => setToast(null), 1600);
    };

    const handleLoadPreset = () => {
      const raw = localStorage.getItem(PRESET_KEY);
      if (!raw) {
        setToast('NO SAVED PRESET YET.');
        setTimeout(() => setToast(null), 1600);
        return;
      }
      const rel = JSON.parse(raw) as Record<string, RankId>;
      const minRow = Math.min(...getSetupRows(mySide));
      const next: Record<CoordKey, { id: string; rank: RankId }> = {};
      let i = 1;
      for (const [rc, rank] of Object.entries(rel)) {
        const [rr, cc] = parseCoord(rc);
        next[`${rr + minRow},${cc}`] = { id: `b-${String(i++).padStart(2, '0')}`, rank };
      }
      setSetupMap(next);
      setSetupSelected(null);
      setTrayRank(null);
    };

    return (
      <div className="h-[100dvh] bg-[#1e1a24] flex flex-col items-center justify-between p-2 overflow-hidden">
        <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between gap-1.5 min-h-0">
          <div className="pixel-panel px-3 py-1.5 flex items-center justify-between shrink-0">
            <div>
              <p className="text-xs font-black uppercase">VS. {BOT_META[difficulty].label}</p>
              <p className="text-xs text-[#6ee74b] font-bold">BOT FORMATION READY</p>
            </div>
            <button
              onClick={() => setPhase('select')}
              className="pixel-btn px-2.5 py-1 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
            >
              ← BACK
            </button>
          </div>

          {toast && (
            <div className="bg-[#2c2633] border-2 border-[#6ee74b] px-3 py-1 text-center text-xs font-bold text-[#6ee74b] shrink-0">
              {toast}
            </div>
          )}

          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#6ee74b] uppercase">
                PLACED: {placedCount}/{TOTAL_PIECES}
              </span>
              <span className="text-xs text-[#a8a29e]">
                {trayRank ? 'TAP GREEN ZONE TO PLACE' : 'SELECT TRAY OR RAND'}
              </span>
            </div>
            <PixelBoardFrame>
              {rows.map((r) =>
                cols.map((c) => {
                  const coord = formatCoord(r, c);
                  const isLight = (r + c) % 2 === 0;
                  const isMyZone = allowedRows.has(r);
                  const isOppZone = r <= 2;
                  const piece = setupMap[coord];
                  const isSelected = setupSelected === coord;
                  const canPlaceHere = isMyZone && !piece && Boolean(trayRank);

                  return (
                    <button
                      key={coord}
                      type="button"
                      onClick={() => handleSetupCellClick(coord)}
                      className={`relative flex items-center justify-center ${
                        canPlaceHere
                          ? 'pixel-sq-legal'
                          : isLight
                            ? 'pixel-sq-light'
                            : 'pixel-sq-dark'
                      } ${!isMyZone ? 'opacity-55' : 'cursor-pointer'} ${
                        isSelected ? 'ring-2 ring-inset ring-[#6ee74b]' : ''
                      }`}
                    >
                      {isMyZone && piece && (
                        <div className={isSelected ? 'piece-selected-pulse w-full h-full flex items-center justify-center' : 'w-full h-full flex items-center justify-center'}>
                          <PieceTile rank={piece.rank} side="white" />
                        </div>
                      )}
                      {isOppZone && (r * 9 + c) % 4 !== 0 && <PieceTile side="black" hidden />}
                    </button>
                  );
                }),
              )}
            </PixelBoardFrame>
          </div>

          {placedCount < TOTAL_PIECES && (
            <div className="pixel-panel p-1.5 overflow-x-auto shrink-0">
              <div className="flex gap-1.5 w-max">
                {remainingByRank
                  .filter((x) => x.left > 0)
                  .map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => {
                        setTrayRank((prev) => (prev === spec.id ? null : spec.id));
                        setSetupSelected(null);
                      }}
                      className={`relative w-11 h-11 shrink-0 border-2 flex items-center justify-center cursor-pointer ${
                        trayRank === spec.id
                          ? 'border-[#6ee74b] bg-[#3a3244]'
                          : 'border-[#0f0d13] bg-[#16131b]'
                      }`}
                    >
                      <PieceTile rank={spec.id} side="white" />
                      {spec.left > 1 && (
                        <span className="absolute -top-1 -right-1 px-1 bg-[#d9843b] text-[#0f0d13] text-[10px] font-black border border-[#0f0d13]">
                          ×{spec.left}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div className="pixel-panel p-2 space-y-1.5 shrink-0">
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSetupMap(createRandomSetup(mySide).boardCoords);
                  setSetupSelected(null);
                  setTrayRank(null);
                }}
                className="pixel-btn py-1.5 bg-[#d9843b] text-[#0f0d13] text-xs font-black uppercase cursor-pointer"
              >
                🎲 RAND
              </button>
              <button
                type="button"
                onClick={() => {
                  if (setupSelected && setupMap[setupSelected]) {
                    const next = { ...setupMap };
                    const rank = next[setupSelected].rank;
                    delete next[setupSelected];
                    setSetupMap(next);
                    setSetupSelected(null);
                    setTrayRank(rank);
                  } else {
                    setSetupMap({});
                    setSetupSelected(null);
                    setTrayRank(null);
                  }
                }}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
              >
                {setupSelected ? '↩ UNDO' : '✕ CLEAR'}
              </button>
              <button
                type="button"
                disabled={placedCount !== TOTAL_PIECES}
                onClick={handleSavePreset}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
              >
                💾 SAVE
              </button>
              <button
                type="button"
                onClick={handleLoadPreset}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
              >
                📂 LOAD
              </button>
            </div>
            <button
              type="button"
              disabled={placedCount !== TOTAL_PIECES}
              onClick={startMatchFromSetup}
              className="pixel-btn w-full py-2 bg-[#6ee74b] disabled:opacity-40 text-[#0f0d13] font-black text-xs uppercase cursor-pointer"
            >
              {placedCount === TOTAL_PIECES
                ? '✓ START BATTLE'
                : `PLACE ${TOTAL_PIECES - placedCount} MORE PIECES`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- PHASE 3: ACTIVE MATCH VS BOT ---
  const isMyTurn = game?.turn === mySide && !game?.winner;

  const commitPlayerMove = (from: CoordKey, to: CoordKey) => {
    if (!game || !belief || game.winner || game.turn !== mySide) return;
    const next = applyMove({
      state: game,
      from,
      to,
      side: mySide,
      ranksByPieceId: allRanks,
      now: Date.now(),
    });
    const nextBelief = updateBeliefAfterMove({
      belief,
      prevState: game,
      nextState: next,
      botSide,
      botRanks,
    });
    setBelief(nextBelief);
    setGame(next);
    setSelectedCoord(null);
    setNowMs(Date.now());
    if (next.winner) {
      playSound(next.winner === mySide ? 'win' : 'lose', muted);
    } else {
      playSound(next.lastMove?.hadChallenge ? 'challenge' : 'move', muted);
    }
  };

  const handleBoardClick = (coord: CoordKey) => {
    if (!game || game.winner || game.turn !== mySide) return;
    const piece = game.board[coord];
    if (piece && piece.side === mySide) {
      setSelectedCoord((prev) => (prev === coord ? null : coord));
      return;
    }
    if (selectedCoord && legalTargets.has(coord)) {
      commitPlayerMove(selectedCoord, coord);
    }
  };

  const handleSwipeMove = (fromCoord: CoordKey, dx: number, dy: number) => {
    if (!game || game.winner || game.turn !== mySide) return;
    const piece = game.board[fromCoord];
    if (!piece || piece.side !== mySide) return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 22) return;

    let dr = 0;
    let dc = 0;
    if (absX > absY) dc = dx > 0 ? 1 : -1;
    else dr = dy > 0 ? 1 : -1;

    const [r, c] = parseCoord(fromCoord);
    const targetCoord = formatCoord(r + dr, c + dc);
    const legal = getLegalMoves(game.board, fromCoord, mySide);
    if (legal.includes(targetCoord)) {
      commitPlayerMove(fromCoord, targetCoord);
    }
  };

  const getArbiterText = (): string => {
    if (!game) return 'STARTING...';
    if (game.winner) {
      return game.winner === mySide ? '🏆 VICTORY! ALL PIECES REVEALED.' : 'DEFEAT — ALL PIECES REVEALED.';
    }
    if (game.flagAtBackRank?.mustSurviveTurn) {
      return game.flagAtBackRank.side === mySide
        ? '⚑ FLAG AT END! SURVIVE 1 BOT TURN!'
        : '⚠️ BOT FLAG AT BACK RANK! CAPTURE NOW!';
    }
    if (game.lastMove?.hadChallenge) {
      const out = game.lastMove.outcome;
      const attackerWasMe = game.lastMove.by === mySide;
      if (out === 'both') return '⚔️ CHALLENGE! EQUAL RANKS — BOTH OUT.';
      if ((out === 'attacker' && attackerWasMe) || (out === 'defender' && !attackerWasMe)) {
        return '⚔️ CHALLENGE WON! BOT PIECE ELIMINATED.';
      }
      return '⚔️ CHALLENGE LOST! YOUR PIECE OUT.';
    }
    return isMyTurn ? 'YOUR TURN — TAP OR SWIPE A WHITE PIECE' : `🤖 ${BOT_META[difficulty].label} THINKING...`;
  };

  const formatClock = (sec: number) => `0:${String(sec).padStart(2, '0')}`;

  return (
    <div
      className={`h-[100dvh] bg-[#1e1a24] flex flex-col items-center p-2 overflow-hidden transition-shadow ${
        isMyTurn ? 'turn-screen-pulse' : ''
      }`}
    >
      <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between relative">
        {/* Bot Bar */}
        <div
          className={`pixel-panel px-3 py-1.5 flex items-center justify-between ${
            game?.turn === botSide && !game?.winner ? 'border-[#d9843b]' : ''
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 border-2 border-[#0f0d13] bg-[#18181b] text-[#f8fafc] flex items-center justify-center text-xs font-black">
              BOT
            </div>
            <div>
              <span className="text-xs font-black uppercase">{BOT_META[difficulty].title}</span>
              <p className="text-xs text-[#a8a29e]">LOST: {oppEliminatedCount}</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-xs font-black border-2 border-[#0f0d13] ${BOT_META[difficulty].color}`}>
            {BOT_META[difficulty].badge}
          </span>
        </div>

        {/* Arbiter Banner */}
        <div className="px-2.5 py-1 bg-[#16131b] border-2 border-[#0f0d13] text-center text-xs font-bold text-[#c2d6cc]">
          {getArbiterText()}
        </div>

        {/* 9x8 Strictly Square 8-Bit Board + Smooth Sliding Pieces */}
        <PixelBoardFrame
          overlay={
            <>
              {Object.entries(game?.board ?? {}).map(([coord, piece]) => {
                const [r, c] = parseCoord(coord);
                const rank =
                  piece.side === mySide ? myRanks[piece.id] ?? piece.revealedRank : piece.revealedRank;
                return (
                  <div
                    key={piece.id}
                    className={`smooth-game-piece ${selectedCoord === coord ? 'piece-selected-pulse' : ''}`}
                    style={{
                      transform: `translate3d(${c * 100}%, ${r * 100}%, 0)`,
                    }}
                  >
                    <PieceTile
                      side={piece.side === mySide ? 'white' : 'black'}
                      rank={rank}
                      hidden={piece.side !== mySide && !piece.revealedRank}
                    />
                  </div>
                );
              })}
            </>
          }
        >
          {rows.map((r) =>
            cols.map((c) => {
              const coord = formatCoord(r, c);
              const isLight = (r + c) % 2 === 0;
              const piece = game?.board[coord];
              const isSelected = selectedCoord === coord;
              const isTarget = legalTargets.has(coord);
              const isThreat = Boolean(piece && isTarget);
              const isLast = game?.lastMove?.from === coord || game?.lastMove?.to === coord;

              return (
                <button
                  key={coord}
                  type="button"
                  onPointerDown={(e) => {
                    swipeRef.current = { coord, x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={(e) => {
                    const start = swipeRef.current;
                    swipeRef.current = null;
                    if (!start) return;
                    const dx = e.clientX - start.x;
                    const dy = e.clientY - start.y;
                    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 22) {
                      handleSwipeMove(start.coord, dx, dy);
                    }
                  }}
                  onClick={() => handleBoardClick(coord)}
                  aria-label={`Row ${r + 1} Col ${c + 1}`}
                  className={`relative flex items-center justify-center cursor-pointer touch-none ${
                    isThreat
                      ? 'pixel-sq-threat'
                      : isTarget
                        ? 'pixel-sq-legal'
                        : isLight
                          ? 'pixel-sq-light'
                          : 'pixel-sq-dark'
                  } ${isLast ? 'ring-2 ring-inset ring-[#d9843b]' : ''} ${
                    isSelected ? 'ring-2 ring-inset ring-[#6ee74b]' : ''
                  }`}
                />
              );
            }),
          )}
        </PixelBoardFrame>

        {/* Player Bar */}
        <div
          className={`pixel-panel px-3 py-1.5 flex items-center justify-between ${
            isMyTurn ? 'border-[#6ee74b]' : ''
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 border-2 border-[#0f0d13] bg-[#f8fafc] text-[#0f0d13] flex items-center justify-center text-xs font-black">
              WHT
            </div>
            <div>
              <span className="text-xs font-black uppercase">{playerName} (YOU)</span>
              <p className="text-xs text-[#a8a29e]">LOST: {myEliminatedRanks.length}</p>
            </div>
          </div>
          {turnSeconds > 0 ? (
            <div
              className={`px-2.5 py-1 border-2 border-[#0f0d13] text-sm font-black tabular-nums ${
                isMyTurn
                  ? remainingSec <= 5
                    ? 'bg-[#e04f4f] text-white'
                    : 'bg-[#6ee74b] text-[#0f0d13]'
                  : 'bg-[#16131b] text-[#a8a29e]'
              }`}
            >
              {formatClock(isMyTurn ? remainingSec : turnSeconds)}
            </div>
          ) : (
            <span className="px-2 py-1 border-2 border-[#0f0d13] bg-[#16131b] text-xs font-bold text-[#a8a29e]">
              ∞ FREE
            </span>
          )}
        </div>

        {/* Action Strip */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            disabled={Boolean(game?.winner)}
            onClick={() => setShowResignConfirm(true)}
            className="pixel-btn py-2 bg-[#991b1b] text-xs font-black text-white uppercase disabled:opacity-40 cursor-pointer"
          >
            🏳 RESIGN
          </button>
          <button
            type="button"
            onClick={() => setPhase('select')}
            className="pixel-btn py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
          >
            🤖 BOT
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="pixel-btn py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
          >
            {muted ? '🔇 MUTE' : '🔊 SFX'}
          </button>
          <button
            type="button"
            onClick={() => setShowGraveyard((v) => !v)}
            className="pixel-btn py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
          >
            🪦 LOST ({myEliminatedRanks.length})
          </button>
        </div>

        {/* Graveyard Drawer */}
        {showGraveyard && (
          <div className="absolute inset-x-0 bottom-12 pixel-panel p-3 z-20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase">Your Eliminated Pieces</span>
              <button
                onClick={() => setShowGraveyard(false)}
                className="text-xs font-bold text-[#d9843b] cursor-pointer"
              >
                [X] CLOSE
              </button>
            </div>
            {myEliminatedRanks.length === 0 ? (
              <p className="text-xs text-[#a8a29e]">NO SOLDIERS ELIMINATED YET.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {myEliminatedRanks.map((rank, i) => (
                  <div key={`${rank}-${i}`} className="w-10 h-10">
                    <PieceTile rank={rank} side="white" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Resign Modal */}
        {showResignConfirm && game && (
          <div className="absolute inset-0 bg-[#0f0d13]/85 flex items-center justify-center p-4 z-30">
            <div className="w-full max-w-[320px] pixel-panel p-5 text-center space-y-4">
              <h3 className="text-base font-black uppercase">Resign Practice?</h3>
              <p className="text-xs text-[#a8a29e]">ALL BOT PIECES WILL BE REVEALED.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="pixel-btn flex-1 py-2.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    setShowResignConfirm(false);
                    const revealedBoard: BoardMap = {};
                    for (const [coord, piece] of Object.entries(game.board)) {
                      revealedBoard[coord] = { ...piece, revealedRank: allRanks[piece.id] };
                    }
                    setGame({
                      ...game,
                      board: revealedBoard,
                      winner: botSide,
                      winReason: 'resign',
                    });
                    playSound('lose', muted);
                  }}
                  className="pixel-btn flex-1 py-2.5 bg-[#e04f4f] text-white text-xs font-black uppercase cursor-pointer"
                >
                  RESIGN
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Endgame Modal */}
        {game?.winner && !hideEndModal && (
          <div className="absolute inset-0 bg-[#0f0d13]/85 flex items-center justify-center p-4 z-30">
            <div className="w-full max-w-[340px] pixel-panel p-5 text-center space-y-4">
              <div className="text-3xl">{game.winner === mySide ? '🏆' : '🤖'}</div>
              <div>
                <h2
                  className={`text-xl font-black uppercase ${
                    game.winner === mySide ? 'text-[#6ee74b]' : 'text-[#e04f4f]'
                  }`}
                >
                  {game.winner === mySide ? 'VICTORY!' : 'BOT WINS!'}
                </h2>
                <p className="text-xs text-[#d6d3d1] mt-1 uppercase">
                  {game.winReason?.replace(/-/g, ' ')} • {game.moveCount} MOVES
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSetupMap({});
                    setSetupSelected(null);
                    setTrayRank(null);
                    setPhase('setup');
                  }}
                  className="pixel-btn w-full py-2.5 bg-[#6ee74b] text-[#0f0d13] font-black text-sm uppercase cursor-pointer"
                >
                  ↻ REMATCH ({BOT_META[difficulty].badge})
                </button>
                <button
                  onClick={() => setHideEndModal(true)}
                  className="pixel-btn w-full py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
                >
                  INSPECT REVEALED BOARD
                </button>
                <button
                  onClick={() => setPhase('select')}
                  className="pixel-btn w-full py-2 bg-[#d9843b] text-[#0f0d13] text-xs font-black uppercase cursor-pointer"
                >
                  CHANGE BOT DIFFICULTY
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-1.5 text-xs font-bold text-[#a8a29e] uppercase cursor-pointer"
                >
                  BACK TO LOBBY
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
