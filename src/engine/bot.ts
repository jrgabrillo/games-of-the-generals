import {
  BOARD_COLS,
  BOARD_ROWS,
  RANK_BY_ID,
  ROSTER_SPEC,
  createRandomSetup,
  getBackRankRow,
  getSetupRows,
} from './roster';
import {
  formatCoord,
  getLegalMoves,
  hasOrthogonallyAdjacentEnemy,
  parseCoord,
  resolveChallenge,
} from './rules';
import type { BoardMap, CoordKey, GameState, PlayerSide, RankId } from './types';

export type BotDifficulty = 'private' | 'general' | 'spy';

export interface BotMove {
  from: CoordKey;
  to: CoordKey;
}

export interface BotBeliefState {
  possibleRanks: Record<string, RankId[]>;
  movedCount: Record<string, number>;
  recentBotMoves: string[]; // "pieceId:from->to"
}

const ALL_RANKS: RankId[] = ROSTER_SPEC.map((s) => s.id);

export function createInitialBelief(board: BoardMap, botSide: PlayerSide): BotBeliefState {
  const possibleRanks: Record<string, RankId[]> = {};
  const movedCount: Record<string, number> = {};
  for (const piece of Object.values(board)) {
    if (piece.side !== botSide) {
      possibleRanks[piece.id] = [...ALL_RANKS];
      movedCount[piece.id] = 0;
    }
  }
  return { possibleRanks, movedCount, recentBotMoves: [] };
}

/**
 * Updates the bot's fair belief state strictly from observable move & challenge outcomes.
 * Never peeks at the opponent's hidden ranks.
 */
export function updateBeliefAfterMove(params: {
  belief: BotBeliefState;
  prevState: GameState;
  nextState: GameState;
  botSide: PlayerSide;
  botRanks: Record<string, RankId>;
}): BotBeliefState {
  const { belief, prevState, nextState, botSide, botRanks } = params;
  const last = nextState.lastMove;
  if (!last) return belief;

  const possibleRanks: Record<string, RankId[]> = { ...belief.possibleRanks };
  const movedCount: Record<string, number> = { ...belief.movedCount };
  const recentBotMoves = [...belief.recentBotMoves];

  const mover = prevState.board[last.from];
  const target = prevState.board[last.to];

  if (mover && mover.side === botSide) {
    recentBotMoves.push(`${mover.id}:${last.from}->${last.to}`);
    if (recentBotMoves.length > 8) recentBotMoves.shift();
  } else if (mover && mover.side !== botSide) {
    movedCount[mover.id] = (movedCount[mover.id] ?? 0) + 1;
  }

  // Deduce opponent rank bounds when a challenge occurs against a known bot piece
  if (last.hadChallenge && mover && target) {
    const botPiece = mover.side === botSide ? mover : target;
    const oppPiece = mover.side !== botSide ? mover : target;
    const botRank = botRanks[botPiece.id];
    const oppSurvived = Boolean(nextState.board[last.to]?.id === oppPiece.id);

    if (botRank && oppSurvived) {
      const current = possibleRanks[oppPiece.id] ?? [...ALL_RANKS];
      const oppWasAttacker = mover.side !== botSide;
      const narrowed = current.filter((candidate) => {
        const res = oppWasAttacker
          ? resolveChallenge(candidate, botRank)
          : resolveChallenge(botRank, candidate);
        return oppWasAttacker ? res.winner === 'attacker' : res.winner === 'defender';
      });
      if (narrowed.length > 0) {
        possibleRanks[oppPiece.id] = narrowed;
      }
    }

    // Remove eliminated pieces from belief map
    for (const deadId of last.eliminatedIds ?? []) {
      delete possibleRanks[deadId];
    }
  }

  return { possibleRanks, movedCount, recentBotMoves };
}

// --- Opening Formation Generators ---

type FormationRow = Array<RankId | null>; // length 9, row 0 = back, row 1 = mid, row 2 = front

const GENERAL_TEMPLATES: FormationRow[][] = [
  // 1. Balanced Wing Fortress
  [
    ['flag', 'private', '2nd-lt', null, 'colonel', null, '1st-lt', 'private', 'major'],
    ['sergeant', 'spy', '4-star', 'private', null, 'captain', '5-star', 'spy', 'lt-colonel'],
    ['private', null, '3-star', 'private', '1-star', 'private', null, '2-star', null],
  ],
  // 2. Center Shield
  [
    ['2nd-lt', null, 'private', 'flag', 'private', '1st-lt', null, 'captain', 'major'],
    ['3-star', 'spy', 'lt-colonel', '5-star', null, '4-star', 'spy', null, 'colonel'],
    ['private', 'private', null, 'sergeant', '1-star', null, 'private', '2-star', 'private'],
  ],
  // 3. Right Flank Guard
  [
    ['major', '1st-lt', null, 'colonel', null, '2nd-lt', 'private', 'flag', 'private'],
    ['lt-colonel', 'spy', '5-star', 'captain', '4-star', null, 'spy', 'sergeant', '3-star'],
    [null, 'private', '2-star', null, 'private', 'private', '1-star', null, 'private'],
  ],
  // 4. Twin-Spy Midline
  [
    ['private', 'flag', 'private', null, 'major', 'captain', null, '2nd-lt', '1st-lt'],
    ['colonel', '5-star', null, 'spy', '4-star', 'spy', null, 'lt-colonel', '3-star'],
    ['private', null, 'sergeant', 'private', '2-star', 'private', '1-star', null, 'private'],
  ],
];

const SPY_TEMPLATES: FormationRow[][] = [
  ...GENERAL_TEMPLATES,
  // 5. Private Screen + Hidden Twin Spies
  [
    ['1st-lt', null, '2nd-lt', 'major', 'flag', 'private', null, 'captain', 'sergeant'],
    ['4-star', 'spy', '5-star', null, 'colonel', 'lt-colonel', 'spy', '3-star', null],
    ['private', 'private', '2-star', 'private', null, 'private', '1-star', 'private', null],
  ],
  // 6. Asymmetric Decoy Blitz
  [
    ['private', 'colonel', null, 'major', '1st-lt', null, '2nd-lt', 'private', 'flag'],
    ['5-star', 'spy', '3-star', 'captain', null, '4-star', 'spy', 'lt-colonel', 'sergeant'],
    ['private', null, 'private', '2-star', 'private', '1-star', null, 'private', null],
  ],
];

function materializeTemplate(
  side: PlayerSide,
  template: FormationRow[],
  mirror: boolean,
  microSwaps: number,
): Record<CoordKey, { id: string; rank: RankId }> {
  // For 'white', row 0 is back (board row 0), row 2 is front (board row 2).
  // For 'black', row 0 is back (board row 7), row 2 is front (board row 5).
  const boardRowMap = side === 'white' ? [0, 1, 2] : [7, 6, 5];
  const prefix = side === 'white' ? 'w' : 'b';
  const coords: Record<CoordKey, { id: string; rank: RankId }> = {};
  let idx = 1;

  for (let tr = 0; tr < 3; tr++) {
    const row = template[tr];
    for (let tc = 0; tc < BOARD_COLS; tc++) {
      const rank = row[mirror ? BOARD_COLS - 1 - tc : tc];
      if (rank) {
        coords[formatCoord(boardRowMap[tr], tc)] = {
          id: `${prefix}-${String(idx++).padStart(2, '0')}`,
          rank,
        };
      }
    }
  }

  // Apply random micro-swaps among non-flag pieces for unpredictability
  const keys = Object.keys(coords).filter((k) => coords[k].rank !== 'flag');
  for (let s = 0; s < microSwaps; s++) {
    const a = keys[Math.floor(Math.random() * keys.length)];
    const b = keys[Math.floor(Math.random() * keys.length)];
    if (a && b && a !== b) {
      const tmp = coords[a];
      coords[a] = coords[b];
      coords[b] = tmp;
    }
  }

  return coords;
}

export function createBotSetup(
  side: PlayerSide,
  difficulty: BotDifficulty,
): Record<CoordKey, { id: string; rank: RankId }> {
  if (difficulty === 'private') {
    const setup = createRandomSetup(side).boardCoords;
    // Basic sanity: keep Flag off the very front row if possible
    const frontRow = side === 'white' ? 2 : 5;
    const backRow = side === 'white' ? 0 : 7;
    const flagEntry = Object.entries(setup).find(([, p]) => p.rank === 'flag');
    if (flagEntry && parseCoord(flagEntry[0])[0] === frontRow) {
      const swapCandidate = Object.entries(setup).find(([k]) => parseCoord(k)[0] === backRow);
      if (swapCandidate) {
        const tmp = setup[flagEntry[0]];
        setup[flagEntry[0]] = setup[swapCandidate[0]];
        setup[swapCandidate[0]] = tmp;
      }
    }
    return setup;
  }

  const pool = difficulty === 'general' ? GENERAL_TEMPLATES : SPY_TEMPLATES;
  const template = pool[Math.floor(Math.random() * pool.length)];
  const mirror = Math.random() < 0.5;
  const microSwaps = difficulty === 'general' ? 3 : 2;
  return materializeTemplate(side, template, mirror, microSwaps);
}

// --- Move Evaluation & Selection ---

function pieceValue(rank: RankId): number {
  if (rank === 'flag') return 1000;
  if (rank === 'spy') return 13.5;
  if (rank === 'private') return 5.5;
  return RANK_BY_ID[rank].power;
}

function expectedChallengeScore(
  myRank: RankId,
  possibleOppRanks: RankId[],
  difficulty: BotDifficulty,
): number {
  if (myRank === 'flag') {
    // Only ever attack with Flag if opponent is 100% deduced to be Flag
    if (possibleOppRanks.length === 1 && possibleOppRanks[0] === 'flag') return 500;
    return -900;
  }

  const myVal = pieceValue(myRank);
  let total = 0;

  for (const oppRank of possibleOppRanks) {
    const res = resolveChallenge(myRank, oppRank);
    const oppVal = pieceValue(oppRank);
    if (res.flagCaptured && res.winner === 'attacker') {
      total += 120;
    } else if (res.winner === 'attacker') {
      total += oppVal * 1.4 + 4;
    } else if (res.winner === 'both') {
      total += oppVal - myVal;
    } else {
      total -= myVal * 1.6 + 3;
    }
  }

  const avg = total / Math.max(1, possibleOppRanks.length);

  // Spy & General intentionally use Privates as scouts against unknown pieces
  if (myRank === 'private' && possibleOppRanks.length > 4 && difficulty !== 'private') {
    return avg + 7;
  }

  // Spy bot aggressively hunts proven high officers with its Spy
  if (
    myRank === 'spy' &&
    difficulty === 'spy' &&
    !possibleOppRanks.includes('private') &&
    possibleOppRanks.length <= 6
  ) {
    return avg + 22;
  }

  return avg;
}

export function chooseBotMove(params: {
  state: GameState;
  botSide: PlayerSide;
  botRanks: Record<string, RankId>;
  difficulty: BotDifficulty;
  belief: BotBeliefState;
}): BotMove | null {
  const { state, botSide, botRanks, difficulty, belief } = params;
  const board = state.board ?? {};
  const backRankTarget = getBackRankRow(botSide);
  const homeRows = new Set(getSetupRows(botSide));

  // Locate bot's Flag
  let botFlagCoord: CoordKey | null = null;
  for (const [coord, piece] of Object.entries(board)) {
    if (piece.side === botSide && botRanks[piece.id] === 'flag') {
      botFlagCoord = coord;
      break;
    }
  }

  const scored: Array<{ move: BotMove; score: number }> = [];

  for (const [from, piece] of Object.entries(board)) {
    if (piece.side !== botSide) continue;
    const myRank = botRanks[piece.id];
    if (!myRank) continue;

    const legal = getLegalMoves(board, from, botSide);
    const [fr] = parseCoord(from);

    for (const to of legal) {
      const [tr, tc] = parseCoord(to);
      const target = board[to];
      let score = 0;

      // 1. Emergency: Capture enemy Flag sitting on our back rank!
      if (
        state.flagAtBackRank?.mustSurviveTurn &&
        state.flagAtBackRank.side !== botSide &&
        state.flagAtBackRank.coord === to
      ) {
        score += 5000;
      }

      // 2. Instant win: March our Flag onto opponent's back rank safely
      if (myRank === 'flag' && tr === backRankTarget && !target) {
        const tempBoard = { ...board };
        delete tempBoard[from];
        tempBoard[to] = piece;
        const adjEnemy = hasOrthogonallyAdjacentEnemy(tempBoard, to, botSide);
        score += adjEnemy ? 40 : 4000;
      }

      // 3. Challenge evaluation
      if (target) {
        const possible =
          difficulty === 'private'
            ? ALL_RANKS
            : belief.possibleRanks[target.id] ?? ALL_RANKS;

        if (difficulty === 'private') {
          // Rookie bot takes somewhat random challenges
          score += myRank === 'flag' ? -500 : 4 + Math.random() * 14 - pieceValue(myRank) * 0.4;
        } else {
          score += expectedChallengeScore(myRank, possible, difficulty);
          // Bonus for challenging pieces that never moved (higher Flag chance)
          if ((belief.movedCount[target.id] ?? 0) === 0 && homeRows.has(tr) === false) {
            score += difficulty === 'spy' ? 6 : 3;
          }
        }
      } else {
        // 4. Positional advancement (toward opponent's back rank)
        const forwardDelta = Math.abs(fr - backRankTarget) - Math.abs(tr - backRankTarget);
        if (myRank === 'flag') {
          const tempBoard = { ...board };
          delete tempBoard[from];
          tempBoard[to] = piece;
          const nowThreatened = hasOrthogonallyAdjacentEnemy(tempBoard, to, botSide);
          const wasThreatened = hasOrthogonallyAdjacentEnemy(board, from, botSide);

          if (wasThreatened && !nowThreatened) {
            score += difficulty === 'private' ? 18 : 65; // Evade danger!
          } else if (nowThreatened) {
            score -= difficulty === 'private' ? 25 : 140; // Don't walk Flag into enemy
          } else if (difficulty !== 'private' && state.moveCount > 12) {
            // Advance Flag cautiously in mid/late game
            score += forwardDelta * 7;
          } else {
            score -= 6; // Keep Flag tucked early
          }
        } else {
          score += forwardDelta * (myRank === 'private' ? 5.5 : 4.2);
          // Slight center control bonus
          score += (4 - Math.abs(tc - 4)) * 0.6;
        }

        // 5. Spy bot: avoid stepping Spy next to a confirmed Private
        if (difficulty === 'spy' && myRank === 'spy') {
          const dirs = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ];
          for (const [dr, dc] of dirs) {
            const nr = tr + dr;
            const nc = tc + dc;
            if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) continue;
            const adj = board[formatCoord(nr, nc)];
            if (adj && adj.side !== botSide) {
              const poss = belief.possibleRanks[adj.id];
              if (poss && poss.length === 1 && poss[0] === 'private') {
                score -= 28;
              }
            }
          }
        }

        // 6. Intercept enemies getting close to our Flag (General & Spy)
        if (difficulty !== 'private' && botFlagCoord && myRank !== 'flag') {
          const [flagR, flagC] = parseCoord(botFlagCoord);
          const distToFlag = Math.abs(tr - flagR) + Math.abs(tc - flagC);
          if (hasOrthogonallyAdjacentEnemy(board, botFlagCoord, botSide) && distToFlag <= 2) {
            score += 12;
          }
        }
      }

      // 7. Anti-repetition penalty (avoid shuffling back and forth)
      const reverseSig = `${piece.id}:${to}->${from}`;
      if (belief.recentBotMoves.includes(reverseSig)) {
        score -= difficulty === 'spy' ? 14 : 9;
      }

      // 8. Controlled noise for unpredictability (no robotic deterministic play)
      const noise =
        difficulty === 'private'
          ? Math.random() * 16
          : difficulty === 'general'
            ? Math.random() * 6
            : Math.random() * 2.8;

      scored.push({ move: { from, to }, score: score + noise });
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);

  // Sample from top-K candidates based on difficulty (unless there's a forced winning/saving move)
  if (scored[0].score >= 1000) return scored[0].move;

  const topK =
    difficulty === 'private'
      ? Math.min(6, scored.length)
      : difficulty === 'general'
        ? Math.min(3, scored.length)
        : Math.min(2, scored.length);

  // Weighted random pick among topK
  const slice = scored.slice(0, topK);
  const minScore = slice[slice.length - 1].score;
  const weights = slice.map((item) => Math.exp((item.score - minScore) / (difficulty === 'spy' ? 3 : 6)));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < slice.length; i++) {
    r -= weights[i];
    if (r <= 0) return slice[i].move;
  }

  return slice[0].move;
}
