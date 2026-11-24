import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  attachPresence,
  declineDraw,
  endGameEarly,
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
import { BOARD_COLS, BOARD_ROWS, createRandomSetup, getSetupRows } from '../engine/roster';
import { formatCoord, getLegalMoves, parseCoord } from '../engine/rules';
import type { CoordKey, GameState, PlayerSide, RankId, RoomMeta } from '../engine/types';
import { playSound } from '../lib/sound';

interface GamePageProps {
  roomId: string;
  uid: string;
  onLeave: () => void;
}

const PRESET_KEY = 'gotg_saved_preset_v1';

export const GamePage: React.FC<GamePageProps> = ({ roomId, uid, onLeave }) => {
  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [rosters, setRosters] = useState<RoomRosters | null>(null);
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setup state
  const [setupMap, setSetupMap] = useState<Record<CoordKey, { id: string; rank: RankId }>>({});
  const [setupSelected, setSetupSelected] = useState<CoordKey | null>(null);
  const [submittingSetup, setSubmittingSetup] = useState(false);

  // Active game UI state
  const [selectedCoord, setSelectedCoord] = useState<CoordKey | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState(false);
  const [hideEndModal, setHideEndModal] = useState(false);

  const prevMoveCountRef = useRef<number>(-1);
  const prevWinnerRef = useRef<string | null>(null);

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

  // Initialize random setup whenever entering setup phase
  useEffect(() => {
    if (room?.status === 'setup' && mySide && Object.keys(setupMap).length === 0) {
      setSetupMap(createRandomSetup(mySide).boardCoords);
      setHideEndModal(false);
    }
    if (room?.status === 'playing') {
      setSetupMap({});
      setSetupSelected(null);
    }
  }, [room?.status, mySide, setupMap]);

  // Sound & modal reset on new moves / game end
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

  // Per-turn clock ticker
  useEffect(() => {
    if (room?.status !== 'playing' || !game || game.winner) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [room?.status, game]);

  const turnSeconds = room?.turnSeconds ?? 30;
  const elapsedSec = game ? Math.floor((nowMs - game.turnStartedAt) / 1000) : 0;
  const remainingSec = Math.max(0, turnSeconds - elapsedSec);

  // Auto-timeout when active player's clock hits 0
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

  // Compute eliminated pieces
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
      <div className="min-h-[100dvh] bg-[#161512] flex items-center justify-center p-4 text-sm text-[#a8a29e]">
        Loading room #{roomId}...
      </div>
    );
  }

  if (!mySide) {
    return (
      <div className="min-h-[100dvh] bg-[#161512] flex flex-col items-center justify-center p-4 gap-4 text-center">
        <p className="text-base font-bold text-[#e04f4f]">Room Full or Access Denied</p>
        <p className="text-xs text-[#a8a29e]">Only 2 players can join a match.</p>
        <button
          onClick={onLeave}
          className="px-4 py-2 rounded-xl bg-[#302e2b] text-sm font-semibold cursor-pointer"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const me = room.players[mySide]!;
  const opp = oppSide ? room.players[oppSide] : undefined;

  // --- WAITING FOR OPPONENT ---
  if (room.status === 'waiting') {
    return (
      <div className="min-h-[100dvh] bg-[#161512] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-[#262421] border border-[#3a3835] rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-[#81b64c]/20 border border-[#81b64c] flex items-center justify-center text-2xl">
            ⚑
          </div>
          <div>
            <h2 className="text-lg font-bold">Waiting for Challenger...</h2>
            <p className="text-xs text-[#a8a29e] mt-1">
              Room <span className="font-mono font-bold text-[#f5f5f4]">#{room.code}</span> •{' '}
              {room.turnSeconds}s/turn • 1/2 Players
            </p>
          </div>
          <button
            onClick={() => void handleCopyShare()}
            className="w-full py-3 rounded-xl bg-[#81b64c] text-[#161512] font-bold text-sm cursor-pointer hover:bg-[#92c65d]"
          >
            {copied ? '✓ Invite Link Copied!' : '🔗 Copy Shareable Invite Link'}
          </button>
          <button
            onClick={onLeave}
            className="w-full py-2.5 rounded-xl bg-[#302e2b] text-xs font-semibold text-[#d6d3d1] border border-[#3a3835] cursor-pointer"
          >
            Leave Room
          </button>
        </div>
      </div>
    );
  }

  // --- SETUP PHASE (3x9) ---
  if (room.status === 'setup') {
    const allowedRows = new Set(getSetupRows(mySide));

    const handleSetupCellClick = (coord: CoordKey) => {
      if (me.ready) return;
      const [r] = parseCoord(coord);
      if (!allowedRows.has(r)) return;

      if (!setupSelected) {
        if (setupMap[coord]) setSetupSelected(coord);
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
      // Save relative to setup row index 0..2 so preset works on either side
      const minRow = Math.min(...getSetupRows(mySide));
      const rel: Record<string, RankId> = {};
      for (const [coord, p] of Object.entries(setupMap)) {
        const [r, c] = parseCoord(coord);
        rel[`${r - minRow},${c}`] = p.rank;
      }
      localStorage.setItem(PRESET_KEY, JSON.stringify(rel));
      setError('Formation preset saved!');
      setTimeout(() => setError(null), 1800);
    };

    const handleLoadPreset = () => {
      const raw = localStorage.getItem(PRESET_KEY);
      if (!raw) {
        setError('No saved preset found yet.');
        return;
      }
      const rel = JSON.parse(raw) as Record<string, RankId>;
      const minRow = Math.min(...getSetupRows(mySide));
      const prefix = mySide === 'white' ? 'w' : 'b';
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
    };

    const handleReady = async () => {
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
      <div className="h-[100dvh] bg-[#161512] flex flex-col items-center justify-between p-3 overflow-hidden">
        <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between">
          {/* Top info */}
          <div className="bg-[#262421] rounded-xl px-3 py-2 flex items-center justify-between border border-[#3a3835]">
            <div>
              <p className="text-xs font-semibold">
                Room #{room.code} • You are <span className="uppercase">{mySide}</span>
              </p>
              <p className="text-xs text-[#a8a29e]">
                {opp?.name ?? 'Opponent'}:{' '}
                <span className={opp?.ready ? 'text-[#81b64c] font-semibold' : 'text-[#f59e0b]'}>
                  {opp?.ready ? 'Ready!' : 'Setting up...'}
                </span>
              </p>
            </div>
            <button
              onClick={() => void handleCopyShare()}
              className="px-2.5 py-1.5 rounded-lg bg-[#302e2b] text-xs text-[#d6d3d1] border border-[#3a3835] cursor-pointer"
            >
              {copied ? 'Copied!' : '🔗 Share'}
            </button>
          </div>

          {error && (
            <div className="bg-[#262421] border border-[#81b64c] rounded-lg px-3 py-1.5 text-center text-xs text-[#f5f5f4]">
              {error}
            </div>
          )}

          {/* Setup Board */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-[#81b64c]">
                Arrange 21 Pieces (6 vacant squares)
              </span>
              <span className="text-xs text-[#a8a29e]">Tap 2 squares to swap</span>
            </div>
            <div className="grid grid-cols-9 aspect-[9/8] w-full rounded-lg overflow-hidden border-2 border-[#3a3835] board-shadow">
              {displayRows.map((r) =>
                displayCols.map((c) => {
                  const coord = formatCoord(r, c);
                  const isLight = (r + c) % 2 === 0;
                  const isMyZone = allowedRows.has(r);
                  const isOppZone = !isMyZone && (r <= 2 || r >= 5);
                  const piece = setupMap[coord];
                  const isSelected = setupSelected === coord;

                  return (
                    <button
                      key={coord}
                      type="button"
                      onClick={() => handleSetupCellClick(coord)}
                      aria-label={`Row ${r + 1} Col ${c + 1}`}
                      className={`relative flex items-center justify-center ${
                        isLight ? 'wood-sq-light' : 'wood-sq-dark'
                      } ${!isMyZone ? 'opacity-50' : 'cursor-pointer'} ${
                        isSelected ? 'ring-2 ring-inset ring-[#fbbf24]' : ''
                      }`}
                    >
                      {isMyZone && piece && <PieceTile rank={piece.rank} side={mySide} />}
                      {isOppZone && oppSide && (r * 9 + c) % 4 !== 0 && (
                        <PieceTile side={oppSide} hidden />
                      )}
                    </button>
                  );
                }),
              )}
            </div>
          </div>

          {/* Setup Controls */}
          <div className="bg-[#262421] rounded-xl p-3 border border-[#3a3835] space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={me.ready}
                onClick={() => {
                  setSetupMap(createRandomSetup(mySide).boardCoords);
                  setSetupSelected(null);
                }}
                className="py-2 rounded-xl bg-[#302e2b] border border-[#3a3835] text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                🎲 Random
              </button>
              <button
                type="button"
                disabled={me.ready}
                onClick={handleSavePreset}
                className="py-2 rounded-xl bg-[#302e2b] border border-[#3a3835] text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                💾 Save
              </button>
              <button
                type="button"
                disabled={me.ready}
                onClick={handleLoadPreset}
                className="py-2 rounded-xl bg-[#302e2b] border border-[#3a3835] text-xs font-semibold disabled:opacity-40 cursor-pointer"
              >
                📂 Load
              </button>
            </div>
            <button
              type="button"
              disabled={me.ready || submittingSetup}
              onClick={() => void handleReady()}
              className="w-full py-3 rounded-xl bg-[#81b64c] hover:bg-[#92c65d] disabled:opacity-50 text-[#161512] font-bold text-sm shadow cursor-pointer"
            >
              {me.ready ? '⏳ Waiting for Opponent...' : '✓ Ready for Battle'}
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
    if (!game) return 'Starting match...';
    if (game.winner) {
      if (game.winner === 'draw') return 'Game Drawn by mutual agreement.';
      return game.winner === mySide ? '🏆 Victory! All pieces revealed.' : 'Defeat — All pieces revealed.';
    }
    if (game.flagAtBackRank?.mustSurviveTurn) {
      return game.flagAtBackRank.side === mySide
        ? '⚑ Your Flag reached the end! Must survive 1 opponent turn!'
        : '⚠️ Enemy Flag reached your back rank! Capture it now or lose!';
    }
    if (game.lastMove?.hadChallenge) {
      const out = game.lastMove.outcome;
      const attackerWasMe = game.lastMove.by === mySide;
      if (out === 'both') return '⚔️ Challenge! Equal ranks — both pieces eliminated.';
      if ((out === 'attacker' && attackerWasMe) || (out === 'defender' && !attackerWasMe)) {
        return '⚔️ Challenge Won! Opponent piece eliminated.';
      }
      return '⚔️ Challenge Lost! Your piece was eliminated.';
    }
    return isMyTurn ? 'Your Turn — Tap a piece to move' : `${opp?.name ?? 'Opponent'}'s Turn...`;
  };

  return (
    <div className="h-[100dvh] bg-[#161512] flex flex-col items-center p-2.5 overflow-hidden">
      <div className="w-full max-w-[460px] flex-1 flex flex-col justify-between relative">
        {/* Opponent Bar */}
        <div
          className={`bg-[#262421] rounded-xl px-3 py-2 flex items-center justify-between border ${
            game?.turn === oppSide && !game?.winner ? 'border-[#81b64c]/60' : 'border-[#3a3835]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold ${
                oppSide === 'white'
                  ? 'bg-[#f8fafc] text-[#111827] border-[#cbd5e1]'
                  : 'bg-[#18181b] text-[#f8fafc] border-[#52525b]'
              }`}
            >
              {oppSide === 'white' ? 'W' : 'B'}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">{opp?.name ?? 'Opponent'}</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    opp?.connected ? 'bg-[#81b64c]' : 'bg-[#f59e0b]'
                  }`}
                />
              </div>
              <p className="text-xs text-[#a8a29e]">Lost: {oppEliminatedCount} pieces</p>
            </div>
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg text-sm font-bold tabular-nums border ${
              game?.turn === oppSide && !game?.winner
                ? 'bg-[#81b64c] text-[#161512] border-[#81b64c]'
                : 'bg-[#161512] text-[#a8a29e] border-[#3a3835]'
            }`}
          >
            {formatClock(oppTime)}
          </div>
        </div>

        {/* Draw Offer or Arbiter Banner */}
        {game?.drawOfferBy && game.drawOfferBy === oppSide && !game.winner ? (
          <div className="mx-1 px-3 py-1.5 rounded-lg bg-[#f59e0b]/20 border border-[#f59e0b] flex items-center justify-between text-xs">
            <span>Opponent offers a Draw</span>
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
                className="px-2 py-0.5 rounded bg-[#81b64c] text-[#161512] font-bold cursor-pointer"
              >
                Accept
              </button>
              <button
                onClick={() => void declineDraw(roomId)}
                className="px-2 py-0.5 rounded bg-[#302e2b] text-[#f5f5f4] cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-1 px-3 py-1.5 rounded-lg bg-[#262421] border border-[#3a3835] text-center text-xs text-[#d6d3d1]">
            {error ?? getArbiterText()}
          </div>
        )}

        {/* 9x8 Red-Wood Board */}
        <div className="grid grid-cols-9 aspect-[9/8] w-full rounded-lg overflow-hidden border-2 border-[#3a3835] board-shadow">
          {displayRows.map((r) =>
            displayCols.map((c) => {
              const coord = formatCoord(r, c);
              const isLight = (r + c) % 2 === 0;
              const piece = game?.board?.[coord];
              const isSelected = selectedCoord === coord;
              const isTarget = legalTargets.has(coord);
              const isLast = game?.lastMove?.from === coord || game?.lastMove?.to === coord;

              const rank =
                piece?.side === mySide
                  ? myRoster[piece.id] ?? piece.revealedRank
                  : piece?.revealedRank;

              return (
                <button
                  key={coord}
                  type="button"
                  onClick={() => void handleBoardClick(coord)}
                  aria-label={`Row ${r + 1} Col ${c + 1}`}
                  className={`relative flex items-center justify-center cursor-pointer ${
                    isLight ? 'wood-sq-light' : 'wood-sq-dark'
                  } ${isLast ? 'ring-1 ring-inset ring-[#81b64c]/70' : ''} ${
                    isSelected ? 'ring-2 ring-inset ring-[#fbbf24]' : ''
                  }`}
                >
                  {piece ? (
                    <div
                      className={`w-full h-full flex items-center justify-center ${
                        isTarget ? 'ring-2 ring-inset ring-[#fbbf24]' : ''
                      }`}
                    >
                      <PieceTile
                        side={piece.side}
                        rank={rank}
                        hidden={piece.side !== mySide && !piece.revealedRank}
                      />
                    </div>
                  ) : isTarget ? (
                    <span className="w-3.5 h-3.5 rounded-full bg-[#fbbf24]/75 ring-2 ring-[#161512]/50" />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>

        {/* Player Bar */}
        <div
          className={`bg-[#262421] rounded-xl px-3 py-2 flex items-center justify-between border ${
            isMyTurn ? 'border-[#81b64c]' : 'border-[#3a3835]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-bold ${
                mySide === 'white'
                  ? 'bg-[#f8fafc] text-[#111827] border-[#cbd5e1]'
                  : 'bg-[#18181b] text-[#f8fafc] border-[#52525b]'
              }`}
            >
              {mySide === 'white' ? 'W' : 'B'}
            </div>
            <div>
              <span className="text-sm font-semibold">{me.name} (You)</span>
              <p className="text-xs text-[#a8a29e]">Lost: {myEliminatedRanks.length} pieces</p>
            </div>
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg text-sm font-extrabold tabular-nums border ${
              isMyTurn
                ? myTime <= 10
                  ? 'bg-[#e04f4f] text-white border-[#e04f4f]'
                  : 'bg-[#81b64c] text-[#161512] border-[#81b64c]'
                : 'bg-[#161512] text-[#a8a29e] border-[#3a3835]'
            }`}
          >
            {formatClock(myTime)}
          </div>
        </div>

        {/* Action Strip */}
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            disabled={Boolean(game?.winner)}
            onClick={() => setShowResignConfirm(true)}
            className="py-2 rounded-xl bg-[#262421] border border-[#3a3835] text-xs font-medium text-[#e04f4f] disabled:opacity-40 cursor-pointer"
          >
            🏳 Resign
          </button>
          <button
            type="button"
            disabled={Boolean(game?.winner) || game?.drawOfferBy === mySide}
            onClick={() => void offerDraw(roomId, mySide)}
            className="py-2 rounded-xl bg-[#262421] border border-[#3a3835] text-xs font-medium text-[#d6d3d1] disabled:opacity-40 cursor-pointer"
          >
            {game?.drawOfferBy === mySide ? 'Offered' : '½ Draw'}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="py-2 rounded-xl bg-[#262421] border border-[#3a3835] text-xs font-medium text-[#d6d3d1] cursor-pointer"
          >
            {muted ? '🔇 Muted' : '🔊 Sound'}
          </button>
          <button
            type="button"
            onClick={() => setShowGraveyard((v) => !v)}
            className="py-2 rounded-xl bg-[#262421] border border-[#3a3835] text-xs font-medium text-[#d6d3d1] cursor-pointer"
          >
            🪦 Lost ({myEliminatedRanks.length})
          </button>
        </div>

        {/* Graveyard Drawer */}
        {showGraveyard && (
          <div className="absolute inset-x-0 bottom-14 bg-[#262421] border border-[#3a3835] rounded-2xl p-3 shadow-2xl z-20 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Your Eliminated Pieces</span>
              <button
                onClick={() => setShowGraveyard(false)}
                className="text-xs text-[#a8a29e] cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            {myEliminatedRanks.length === 0 ? (
              <p className="text-xs text-[#a8a29e]">None of your soldiers have been eliminated yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {myEliminatedRanks.map((rank, i) => (
                  <div key={`${rank}-${i}`} className="w-9 h-8">
                    <PieceTile rank={rank} side={mySide} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Resign Confirm Modal */}
        {showResignConfirm && game && rosters && (
          <div className="absolute inset-0 bg-[#161512]/80 flex items-center justify-center p-4 z-30">
            <div className="w-full max-w-[320px] bg-[#262421] border border-[#3a3835] rounded-2xl p-5 text-center space-y-4">
              <h3 className="text-base font-bold">Resign Match?</h3>
              <p className="text-xs text-[#a8a29e]">
                Your opponent will win the game and all pieces will be revealed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowResignConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#302e2b] text-xs font-semibold cursor-pointer"
                >
                  Cancel
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
                  className="flex-1 py-2.5 rounded-xl bg-[#e04f4f] text-white text-xs font-bold cursor-pointer"
                >
                  Resign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Endgame Modal */}
        {game?.winner && !hideEndModal && (
          <div className="absolute inset-0 bg-[#161512]/85 flex items-center justify-center p-4 z-30">
            <div className="w-full max-w-[340px] bg-[#262421] border border-[#81b64c] rounded-2xl p-5 text-center space-y-4 shadow-2xl">
              <div className="text-3xl">
                {game.winner === 'draw' ? '🤝' : game.winner === mySide ? '🏆' : '🏳️'}
              </div>
              <div>
                <h2
                  className={`text-xl font-extrabold ${
                    game.winner === mySide
                      ? 'text-[#81b64c]'
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
                <p className="text-xs text-[#d6d3d1] mt-1">
                  Reason: {game.winReason?.replace(/-/g, ' ')} • {game.moveCount} moves
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => void requestRematch(roomId)}
                  className="w-full py-2.5 rounded-xl bg-[#81b64c] text-[#161512] font-bold text-sm cursor-pointer"
                >
                  ↻ Rematch
                </button>
                <button
                  onClick={() => setHideEndModal(true)}
                  className="w-full py-2 rounded-xl bg-[#302e2b] text-xs font-semibold text-[#d6d3d1] border border-[#3a3835] cursor-pointer"
                >
                  Inspect Revealed Board
                </button>
                <button
                  onClick={onLeave}
                  className="w-full py-2 rounded-xl bg-transparent text-xs text-[#a8a29e] cursor-pointer"
                >
                  Back to Lobby
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
