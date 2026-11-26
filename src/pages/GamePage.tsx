import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  attachPresence,
  declineDraw,
  endGameEarly,
  isRoomExpired,
  makeMove,
  offerDraw,
  requestRematch,
  subscribeGame,
  subscribeRoom,
  subscribeRosters,
  submitSetup,
  type RoomRosters,
} from '../api/roomService';
import { PieceTile } from '../components/PieceTile';
import {
  BOARD_COLS,
  BOARD_ROWS,
  ROSTER_SPEC,
  TOTAL_PIECES,
  createRandomSetup,
  getSetupRows,
} from '../engine/roster';
import { formatCoord, getLegalMoves, parseCoord } from '../engine/rules';
import type { CoordKey, GameState, PlayerSide, RankId, RoomMeta } from '../engine/types';
import { playSound } from '../lib/sound';

interface GamePageProps {
  roomId: string;
  uid: string;
  onLeave: () => void;
}

const PRESET_KEY = 'gotg_saved_preset_v1';
const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const PixelBoardFrame: React.FC<{ children: React.ReactNode; overlay?: React.ReactNode }> = ({
  children,
  overlay,
}) => (
  <div className="pixel-board-outer w-full shrink-0">
    <div className="pixel-board-wood p-1.5 sm:p-2">
      {/* Top column labels */}
      <div className="grid grid-cols-9 px-3.5 pb-0.5 text-center text-[10px] font-black text-[#6b3410] select-none">
        {COL_LABELS.map((l) => (
          <span key={`top-${l}`}>{l}</span>
        ))}
      </div>
      <div className="flex items-stretch">
        {/* Left row labels */}
        <div className="flex flex-col justify-around pr-1 text-[10px] font-black text-[#6b3410] select-none">
          {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
            <span key={`l-${n}`}>{n}</span>
          ))}
        </div>
        {/* Strictly Square 9x8 Grid */}
        <div className="relative flex-1 aspect-square border-2 border-[#382e3b] overflow-hidden">
          <div className="grid grid-cols-9 grid-rows-8 w-full h-full">{children}</div>
          {overlay}
        </div>
        {/* Right row labels */}
        <div className="flex flex-col justify-around pl-1 text-[10px] font-black text-[#6b3410] select-none">
          {[8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
            <span key={`r-${n}`}>{n}</span>
          ))}
        </div>
      </div>
      {/* Bottom column labels */}
      <div className="grid grid-cols-9 px-3.5 pt-0.5 text-center text-[10px] font-black text-[#6b3410] select-none">
        {COL_LABELS.map((l) => (
          <span key={`bot-${l}`}>{l}</span>
        ))}
      </div>
    </div>
  </div>
);

export const GamePage: React.FC<GamePageProps> = ({ roomId, uid, onLeave }) => {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [rosters, setRosters] = useState<RoomRosters | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [setupMap, setSetupMap] = useState<Record<CoordKey, { id: string; rank: RankId }>>({});
  const [setupSelected, setSetupSelected] = useState<CoordKey | null>(null);
  const [trayRank, setTrayRank] = useState<RankId | null>(null);
  const [submittingSetup, setSubmittingSetup] = useState(false);

  const [selectedCoord, setSelectedCoord] = useState<CoordKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [hideEndModal, setHideEndModal] = useState(false);

  const prevMoveCountRef = useRef<number>(-1);
  const prevWinnerRef = useRef<string | null>(null);
  const lastTickSecRef = useRef<number | null>(null);
  const swipeRef = useRef<{ coord: CoordKey; x: number; y: number } | null>(null);

  useEffect(() => {
    const unsubRoom = subscribeRoom(roomId, setRoom);
    const unsubGame = subscribeGame(roomId, setGame);
    const unsubRosters = subscribeRosters(roomId, setRosters);
    return () => {
      unsubRoom();
      unsubGame();
      unsubRosters();
    };
  }, [roomId]);

  const mySide: PlayerSide | null = useMemo(() => {
    if (!room) return null;
    if (room.players?.white?.uid === uid) return 'white';
    if (room.players?.black?.uid === uid) return 'black';
    return null;
  }, [room, uid]);

  const oppSide: PlayerSide | null = mySide === 'white' ? 'black' : mySide === 'black' ? 'white' : null;

  useEffect(() => {
    if (!mySide) return;
    return attachPresence(roomId, mySide);
  }, [roomId, mySide]);

  useEffect(() => {
    if (room?.status === 'setup') {
      setHideEndModal(false);
    }
    if (room?.status === 'playing') {
      setSetupMap({});
      setSetupSelected(null);
      setTrayRank(null);
    }
  }, [room?.status]);

  useEffect(() => {
    if (!game) return;
    if (prevMoveCountRef.current !== -1 && game.moveCount > prevMoveCountRef.current) {
      playSound(game.lastMove?.hadChallenge ? 'challenge' : 'move', muted);
    }
    prevMoveCountRef.current = game.moveCount;

    if (game.winner && !prevWinnerRef.current) {
      setHideEndModal(false);
      playSound(game.winner === mySide ? 'win' : 'lose', muted);
    }
    prevWinnerRef.current = game.winner ?? null;
  }, [game, muted, mySide]);

  useEffect(() => {
    if (room?.status !== 'playing' || !game || game.winner) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [room?.status, game]);

  const turnSeconds = room?.turnSeconds ?? 30;
  const elapsedSec = game ? Math.floor((nowMs - game.turnStartedAt) / 1000) : 0;
  const remainingSec = Math.max(0, turnSeconds - elapsedSec);

  // Tick sound per second when player's timer is below 6 seconds
  useEffect(() => {
    if (room?.status !== 'playing' || !game || game.winner || game.turn !== mySide) {
      lastTickSecRef.current = null;
      return;
    }
    if (remainingSec > 0 && remainingSec < 6 && lastTickSecRef.current !== remainingSec) {
      lastTickSecRef.current = remainingSec;
      playSound('tick', muted);
    }
  }, [room?.status, game, mySide, remainingSec, muted]);

  useEffect(() => {
    if (
      room?.status === 'playing' &&
      game &&
      !game.winner &&
      mySide &&
      game.turn === mySide &&
      remainingSec === 0 &&
      rosters
    ) {
      const winnerSide: PlayerSide = mySide === 'white' ? 'black' : 'white';
      void endGameEarly({
        roomId,
        game,
        rosters,
        winner: winnerSide,
        winReason: 'timeout',
      });
    }
  }, [room?.status, game, mySide, remainingSec, rosters, roomId]);

  const displayRows = useMemo(() => {
    const rows = Array.from({ length: BOARD_ROWS }, (_, i) => i);
    return mySide === 'white' ? [...rows].reverse() : rows;
  }, [mySide]);

  const displayCols = useMemo(() => {
    const cols = Array.from({ length: BOARD_COLS }, (_, i) => i);
    return mySide === 'white' ? [...cols].reverse() : cols;
  }, [mySide]);

  const legalTargets = useMemo(() => {
    if (!game || !selectedCoord || !mySide || game.turn !== mySide || game.winner) {
      return new Set<CoordKey>();
    }
    return new Set(getLegalMoves(game.board ?? {}, selectedCoord, mySide));
  }, [game, selectedCoord, mySide]);

  const myRoster = mySide && rosters ? rosters[mySide] ?? {} : {};

  const { myEliminatedRanks, oppEliminatedCount } = useMemo(() => {
    if (!game || !mySide) return { myEliminatedRanks: [] as RankId[], oppEliminatedCount: 0 };
    const aliveIds = new Set(Object.values(game.board ?? {}).map((p) => p.id));
    const myDead: RankId[] = [];
    for (const [id, rank] of Object.entries(myRoster)) {
      if (!aliveIds.has(id)) myDead.push(rank);
    }
    const oppAliveCount = Object.values(game.board ?? {}).filter((p) => p.side !== mySide).length;
    return {
      myEliminatedRanks: myDead,
      oppEliminatedCount: 21 - oppAliveCount,
    };
  }, [game, mySide, myRoster]);

  const handleCopyShare = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Share code: ${roomId}`);
    }
  };

  if (!room) {
    return (
      <div className="min-h-[100dvh] bg-[#1e1a24] flex items-center justify-center p-4 text-sm text-[#a8a29e] uppercase">
        LOADING ROOM #{roomId}...
      </div>
    );
  }

  if (!mySide) {
    return (
      <div className="min-h-[100dvh] bg-[#1e1a24] flex flex-col items-center justify-center p-4 gap-4 text-center">
        <div className="pixel-panel p-6 space-y-3 max-w-xs">
          <p className="text-base font-black text-[#e04f4f] uppercase">Room Full</p>
          <p className="text-xs text-[#a8a29e]">ONLY 2 PLAYERS CAN JOIN A MATCH.</p>
          <button
            onClick={onLeave}
            className="pixel-btn w-full py-2.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const me = room.players[mySide]!;
  const opp = oppSide ? room.players[oppSide] : undefined;

  // --- WAITING FOR OPPONENT ---
  if (room.status === 'waiting') {
    if (isRoomExpired(room)) {
      return (
        <div className="min-h-[100dvh] bg-[#1e1a24] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[400px] pixel-panel p-6 text-center space-y-4">
            <h2 className="text-base font-black text-[#e04f4f] uppercase">Room Expired</h2>
            <p className="text-xs text-[#a8a29e]">
              THIS ROOM WAS INACTIVE FOR OVER 1 HOUR AND HAS EXPIRED.
            </p>
            <button
              onClick={onLeave}
              className="pixel-btn w-full py-2.5 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
            >
              BACK TO LOBBY
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] bg-[#1e1a24] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[400px] pixel-panel p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto pixel-btn bg-[#d9843b] flex items-center justify-center text-2xl text-[#0f0d13]">
            ⚑
          </div>
          <div>
            <h2 className="text-base font-black uppercase">Waiting for Challenger...</h2>
            <p className="text-xs text-[#a8a29e] mt-1">
              ROOM <span className="font-bold text-[#6ee74b]">#{room.code}</span> •{' '}
              {room.turnSeconds}S/TURN • 1/2
            </p>
          </div>
          <button
            onClick={() => void handleCopyShare()}
            className="pixel-btn w-full py-3 bg-[#6ee74b] text-[#0f0d13] font-black text-xs uppercase cursor-pointer"
          >
            {copied ? '✓ INVITE LINK COPIED!' : '🔗 COPY INVITE LINK'}
          </button>
          <button
            onClick={onLeave}
            className="pixel-btn w-full py-2.5 bg-[#3a3244] text-xs font-bold text-[#d6d3d1] uppercase cursor-pointer"
          >
            LEAVE ROOM
          </button>
        </div>
      </div>
    );
  }

  // --- SETUP PHASE (3x9 Manual + Randomize) ---
  if (room.status === 'setup') {
    const allowedRows = new Set(getSetupRows(mySide));
    const placedCount = Object.keys(setupMap).length;
    const prefix = mySide === 'white' ? 'w' : 'b';

    // Remaining counts per rank in tray
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
        const id = `${prefix}-${String(i).padStart(2, '0')}`;
        if (!used.has(id)) return id;
      }
      return `${prefix}-${Date.now()}`;
    };

    const handleSetupCellClick = (coord: CoordKey) => {
      if (me.ready) return;
      const [r] = parseCoord(coord);
      if (!allowedRows.has(r)) return;

      // Placing a selected tray piece onto an empty square (or replacing)
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

    const handleReturnSelectedToTray = () => {
      if (!setupSelected || !setupMap[setupSelected] || me.ready) return;
      const next = { ...setupMap };
      const rank = next[setupSelected].rank;
      delete next[setupSelected];
      setSetupMap(next);
      setSetupSelected(null);
      setTrayRank(rank);
    };

    const handleSavePreset = () => {
      if (placedCount !== TOTAL_PIECES) {
        setError(`PLACE ALL ${TOTAL_PIECES} PIECES FIRST.`);
        return;
      }
      const minRow = Math.min(...getSetupRows(mySide));
      const rel: Record<string, RankId> = {};
      for (const [coord, p] of Object.entries(setupMap)) {
        const [r, c] = parseCoord(coord);
        rel[`${r - minRow},${c}`] = p.rank;
      }
      localStorage.setItem(PRESET_KEY, JSON.stringify(rel));
      setError('PRESET SAVED!');
      setTimeout(() => setError(null), 1800);
    };

    const handleLoadPreset = () => {
      const raw = localStorage.getItem(PRESET_KEY);
      if (!raw) {
        setError('NO SAVED PRESET YET.');
        return;
      }
      const rel = JSON.parse(raw) as Record<string, RankId>;
      const minRow = Math.min(...getSetupRows(mySide));
      const next: Record<CoordKey, { id: string; rank: RankId }> = {};
      let i = 1;
      for (const [rc, rank] of Object.entries(rel)) {
        const [rr, cc] = parseCoord(rc);
        next[`${rr + minRow},${cc}`] = {
          id: `${prefix}-${String(i++).padStart(2, '0')}`,
          rank,
        };
      }
      setSetupMap(next);
      setSetupSelected(null);
      setTrayRank(null);
    };

    const handleReady = async () => {
      if (placedCount !== TOTAL_PIECES) {
        setError(`PLACE ALL ${TOTAL_PIECES} PIECES FIRST.`);
        return;
      }
      setSubmittingSetup(true);
      setError(null);
      try {
        await submitSetup({ roomId, side: mySide, boardCoords: setupMap });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit setup');
      } finally {
        setSubmittingSetup(false);
      }
    };

    return (
      <div className="h-[100dvh] bg-[#1e1a24] flex flex-col items-center justify-between p-2 overflow-hidden">
        <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between gap-1.5 min-h-0">
          {/* Top info */}
          <div className="pixel-panel px-3 py-1.5 flex items-center justify-between shrink-0">
            <div>
              <p className="text-xs font-black uppercase">ROOM #{room.code}</p>
              <p className="text-xs text-[#a8a29e]">
                {opp?.name ?? 'OPPONENT'}:{' '}
                <span className={opp?.ready ? 'text-[#6ee74b] font-bold' : 'text-[#f59e0b] font-bold'}>
                  {opp?.ready ? 'READY!' : 'SETTING UP...'}
                </span>
              </p>
            </div>
            <button
              onClick={() => void handleCopyShare()}
              className="pixel-btn px-2.5 py-1 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] cursor-pointer"
            >
              {copied ? 'COPIED!' : '🔗 SHARE'}
            </button>
          </div>

          {error && (
            <div className="bg-[#2c2633] border-2 border-[#6ee74b] px-3 py-1 text-center text-xs font-bold text-[#6ee74b] shrink-0">
              {error}
            </div>
          )}

          {/* Setup Board */}
          <div className="space-y-1 shrink-0">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[#6ee74b] uppercase">
                PLACED: {placedCount}/{TOTAL_PIECES}
              </span>
              <span className="text-xs text-[#a8a29e]">
                {trayRank ? 'TAP GREEN ZONE TO PLACE' : setupSelected ? 'TAP SQUARE TO MOVE' : 'SELECT TRAY OR PIECE'}
              </span>
            </div>
            <PixelBoardFrame>
              {displayRows.map((r) =>
                displayCols.map((c) => {
                  const coord = formatCoord(r, c);
                  const isLight = (r + c) % 2 === 0;
                  const isMyZone = allowedRows.has(r);
                  const isOppZone = !isMyZone && (r <= 2 || r >= 5);
                  const piece = setupMap[coord];
                  const isSelected = setupSelected === coord;
                  const canPlaceHere = isMyZone && !piece && Boolean(trayRank);

                  return (
                    <button
                      key={coord}
                      type="button"
                      onClick={() => handleSetupCellClick(coord)}
                      aria-label={`Row ${r + 1} Col ${c + 1}`}
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
                      {isOppZone && oppSide && (r * 9 + c) % 4 !== 0 && (
                        <PieceTile side="black" hidden />
                      )}
                    </button>
                  );
                }),
              )}
            </PixelBoardFrame>
          </div>

          {/* Manual Piece Tray */}
          {placedCount < TOTAL_PIECES && (
            <div className="pixel-panel p-1.5 overflow-x-auto shrink-0">
              <div className="flex gap-1.5 w-max">
                {remainingByRank
                  .filter((x) => x.left > 0)
                  .map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      disabled={me.ready}
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

          {/* Setup Controls */}
          <div className="pixel-panel p-2 space-y-1.5 shrink-0">
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={me.ready}
                onClick={() => {
                  setSetupMap(createRandomSetup(mySide).boardCoords);
                  setSetupSelected(null);
                  setTrayRank(null);
                }}
                className="pixel-btn py-1.5 bg-[#d9843b] text-[#0f0d13] text-xs font-black uppercase disabled:opacity-40 cursor-pointer"
              >
                🎲 RAND
              </button>
              <button
                type="button"
                disabled={me.ready}
                onClick={() => {
                  if (setupSelected) {
                    handleReturnSelectedToTray();
                  } else {
                    setSetupMap({});
                    setSetupSelected(null);
                    setTrayRank(null);
                  }
                }}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
              >
                {setupSelected ? '↩ UNDO' : '✕ CLEAR'}
              </button>
              <button
                type="button"
                disabled={me.ready || placedCount !== TOTAL_PIECES}
                onClick={handleSavePreset}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
              >
                💾 SAVE
              </button>
              <button
                type="button"
                disabled={me.ready}
                onClick={handleLoadPreset}
                className="pixel-btn py-1.5 bg-[#3a3244] text-xs font-bold uppercase disabled:opacity-40 cursor-pointer"
              >
                📂 LOAD
              </button>
            </div>
            <button
              type="button"
              disabled={me.ready || submittingSetup || placedCount !== TOTAL_PIECES}
              onClick={() => void handleReady()}
              className="pixel-btn w-full py-2 bg-[#6ee74b] disabled:opacity-40 text-[#0f0d13] font-black text-xs uppercase cursor-pointer"
            >
              {me.ready
                ? '⏳ WAITING FOR OPPONENT...'
                : placedCount === TOTAL_PIECES
                  ? '✓ READY FOR BATTLE'
                  : `PLACE ${TOTAL_PIECES - placedCount} MORE PIECES`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- ACTIVE GAME & FINISHED ---
  const isMyTurn = game?.turn === mySide && !game?.winner;
  const oppTime = game?.turn === oppSide && !game?.winner ? remainingSec : turnSeconds;
  const myTime = game?.turn === mySide && !game?.winner ? remainingSec : turnSeconds;

  const formatClock = (sec: number) => `0:${String(sec).padStart(2, '0')}`;

  const handleBoardClick = async (coord: CoordKey) => {
    if (!game || !rosters || game.winner || game.turn !== mySide) return;
    const piece = game.board?.[coord];

    if (piece && piece.side === mySide) {
      setSelectedCoord((prev) => (prev === coord ? null : coord));
      return;
    }

    if (selectedCoord && legalTargets.has(coord)) {
      const from = selectedCoord;
      setSelectedCoord(null);
      try {
        await makeMove({ roomId, side: mySide, from, to: coord, game, rosters });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Move failed');
      }
    }
  };

  const getArbiterText = (): string => {
    if (!game) return 'STARTING MATCH...';
    if (game.winner) {
      if (game.winner === 'draw') return 'GAME DRAWN BY AGREEMENT.';
      return game.winner === mySide ? '🏆 VICTORY! ALL PIECES REVEALED.' : 'DEFEAT — ALL PIECES REVEALED.';
    }
    if (game.flagAtBackRank?.mustSurviveTurn) {
      return game.flagAtBackRank.side === mySide
        ? '⚑ FLAG AT END! SURVIVE 1 TURN TO WIN!'
        : '⚠️ ENEMY FLAG AT BACK RANK! CAPTURE NOW!';
    }
    if (game.lastMove?.hadChallenge) {
      const out = game.lastMove.outcome;
      const attackerWasMe = game.lastMove.by === mySide;
      if (out === 'both') return '⚔️ CHALLENGE! EQUAL RANKS — BOTH OUT.';
      if ((out === 'attacker' && attackerWasMe) || (out === 'defender' && !attackerWasMe)) {
        return '⚔️ CHALLENGE WON! ENEMY ELIMINATED.';
      }
      return '⚔️ CHALLENGE LOST! YOUR PIECE OUT.';
    }
    return isMyTurn ? 'YOUR TURN — SELECT A WHITE PIECE' : `${opp?.name ?? 'OPPONENT'}'S TURN...`;
  };

  const handleSwipeMove = (fromCoord: CoordKey, dx: number, dy: number) => {
    if (!game || !rosters || game.winner || game.turn !== mySide) return;
    const piece = game.board?.[fromCoord];
    if (!piece || piece.side !== mySide) return;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < 22) return;

    // Display delta -> canonical delta (white is rotated 180 deg)
    let dispDr = 0;
    let dispDc = 0;
    if (absX > absY) {
      dispDc = dx > 0 ? 1 : -1;
    } else {
      dispDr = dy > 0 ? 1 : -1;
    }
    const dr = mySide === 'white' ? -dispDr : dispDr;
    const dc = mySide === 'white' ? -dispDc : dispDc;

    const [r, c] = parseCoord(fromCoord);
    const targetCoord = formatCoord(r + dr, c + dc);
    const legal = getLegalMoves(game.board ?? {}, fromCoord, mySide);
    if (legal.includes(targetCoord)) {
      setSelectedCoord(null);
      void makeMove({ roomId, side: mySide, from: fromCoord, to: targetCoord, game, rosters });
    }
  };

  return (
    <div
      className={`h-[100dvh] bg-[#1e1a24] flex flex-col items-center p-2 overflow-hidden transition-shadow ${
        isMyTurn ? 'turn-screen-pulse' : ''
      }`}
    >
      <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between relative">
        {/* Opponent Bar */}
        <div
          className={`pixel-panel px-3 py-1.5 flex items-center justify-between ${
            game?.turn === oppSide && !game?.winner ? 'border-[#6ee74b]' : ''
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 border-2 border-[#0f0d13] bg-[#18181b] text-[#f8fafc] flex items-center justify-center text-xs font-black">
              BLK
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black uppercase">{opp?.name ?? 'OPPONENT'}</span>
                <span
                  className={`w-2 h-2 border border-[#0f0d13] ${
                    opp?.connected ? 'bg-[#6ee74b]' : 'bg-[#f59e0b]'
                  }`}
                />
              </div>
              <p className="text-xs text-[#a8a29e]">LOST: {oppEliminatedCount}</p>
            </div>
          </div>
          <div
            className={`px-2.5 py-1 border-2 border-[#0f0d13] text-sm font-black tabular-nums ${
              game?.turn === oppSide && !game?.winner
                ? 'bg-[#6ee74b] text-[#0f0d13]'
                : 'bg-[#16131b] text-[#a8a29e]'
            }`}
          >
            {formatClock(oppTime)}
          </div>
        </div>

        {/* Draw Offer or Arbiter Banner */}
        {game?.drawOfferBy && game.drawOfferBy === oppSide && !game.winner ? (
          <div className="px-3 py-1.5 bg-[#d9843b] border-2 border-[#0f0d13] text-[#0f0d13] flex items-center justify-between text-xs font-black">
            <span>DRAW OFFERED!</span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  rosters &&
                  void endGameEarly({
                    roomId,
                    game,
                    rosters,
                    winner: 'draw',
                    winReason: 'draw',
                  })
                }
                className="pixel-btn px-2 py-0.5 bg-[#6ee74b] text-[#0f0d13] cursor-pointer"
              >
                ACCEPT
              </button>
              <button
                onClick={() => void declineDraw(roomId)}
                className="pixel-btn px-2 py-0.5 bg-[#2c2633] text-[#f5f5f4] cursor-pointer"
              >
                NO
              </button>
            </div>
          </div>
        ) : (
          <div className="px-2.5 py-1 bg-[#16131b] border-2 border-[#0f0d13] text-center text-xs font-bold text-[#c2d6cc]">
            {error ?? getArbiterText()}
          </div>
        )}

        {/* 9x8 8-Bit Retro Board (Strictly Square + Smooth Sliding Pieces) */}
        <PixelBoardFrame
          overlay={
            <>
              {Object.entries(game?.board ?? {}).map(([coord, piece]) => {
                const [r, c] = parseCoord(coord);
                const dispR = mySide === 'white' ? BOARD_ROWS - 1 - r : r;
                const dispC = mySide === 'white' ? BOARD_COLS - 1 - c : c;
                const rank =
                  piece.side === mySide
                    ? myRoster[piece.id] ?? piece.revealedRank
                    : piece.revealedRank;
                return (
                  <div
                    key={piece.id}
                    className={`smooth-game-piece ${selectedCoord === coord ? 'piece-selected-pulse' : ''}`}
                    style={{
                      transform: `translate3d(${dispC * 100}%, ${dispR * 100}%, 0)`,
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
          {displayRows.map((r) =>
            displayCols.map((c) => {
              const coord = formatCoord(r, c);
              const isLight = (r + c) % 2 === 0;
              const piece = game?.board?.[coord];
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
                  onClick={() => void handleBoardClick(coord)}
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
              <span className="text-xs font-black uppercase">{me.name} (YOU)</span>
              <p className="text-xs text-[#a8a29e]">LOST: {myEliminatedRanks.length}</p>
            </div>
          </div>
          <div
            className={`px-2.5 py-1 border-2 border-[#0f0d13] text-sm font-black tabular-nums ${
              isMyTurn
                ? myTime <= 10
                  ? 'bg-[#e04f4f] text-white'
                  : 'bg-[#6ee74b] text-[#0f0d13]'
                : 'bg-[#16131b] text-[#a8a29e]'
            }`}
          >
            {formatClock(myTime)}
          </div>
        </div>

        {/* 8-Bit Action Strip */}
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
            disabled={Boolean(game?.winner) || game?.drawOfferBy === mySide}
            onClick={() => void offerDraw(roomId, mySide)}
            className="pixel-btn py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase disabled:opacity-40 cursor-pointer"
          >
            {game?.drawOfferBy === mySide ? 'SENT' : '½ DRAW'}
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

        {/* Resign Confirm Modal */}
        {showResignConfirm && game && rosters && (
          <div className="absolute inset-0 bg-[#0f0d13]/85 flex items-center justify-center p-4 z-30">
            <div className="w-full max-w-[320px] pixel-panel p-5 text-center space-y-4">
              <h3 className="text-base font-black uppercase">Resign Match?</h3>
              <p className="text-xs text-[#a8a29e]">
                OPPONENT WINS AND ALL PIECES ARE REVEALED.
              </p>
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
                    if (oppSide) {
                      void endGameEarly({
                        roomId,
                        game,
                        rosters,
                        winner: oppSide,
                        winReason: 'resign',
                      });
                    }
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
              <div className="text-3xl">
                {game.winner === 'draw' ? '🤝' : game.winner === mySide ? '🏆' : '🏳️'}
              </div>
              <div>
                <h2
                  className={`text-xl font-black uppercase ${
                    game.winner === mySide
                      ? 'text-[#6ee74b]'
                      : game.winner === 'draw'
                        ? 'text-[#f59e0b]'
                        : 'text-[#e04f4f]'
                  }`}
                >
                  {game.winner === 'draw'
                    ? 'DRAW'
                    : game.winner === mySide
                      ? 'VICTORY!'
                      : 'DEFEAT'}
                </h2>
                <p className="text-xs text-[#d6d3d1] mt-1 uppercase">
                  {game.winReason?.replace(/-/g, ' ')} • {game.moveCount} MOVES
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => void requestRematch(roomId)}
                  className="pixel-btn w-full py-2.5 bg-[#6ee74b] text-[#0f0d13] font-black text-sm uppercase cursor-pointer"
                >
                  ↻ REMATCH
                </button>
                <button
                  onClick={() => setHideEndModal(true)}
                  className="pixel-btn w-full py-2 bg-[#3a3244] text-xs font-bold text-[#f5f5f4] uppercase cursor-pointer"
                >
                  INSPECT BOARD
                </button>
                <button
                  onClick={onLeave}
                  className="w-full py-2 text-xs font-bold text-[#a8a29e] uppercase cursor-pointer"
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
