import {
  BOARD_COLS,
  BOARD_ROWS,
  RANK_BY_ID,
  ROSTER_SPEC,
  TOTAL_PIECES,
  getBackRankRow,
  getSetupRows,
} from './roster';
import type {
  BoardMap,
  ChallengeOutcome,
  CoordKey,
  GameState,
  PlayerSide,
  RankId,
} from './types';

export function parseCoord(coord: CoordKey): [number, number] {
  const [r, c] = coord.split(',').map(Number);
  return [r, c];
}

export function formatCoord(row: number, col: number): CoordKey {
  return `${row},${col}`;
}

export function isValidCoord(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

export function validateSetup(
  side: PlayerSide,
  placements: Record<CoordKey, { id: string; rank: RankId }>,
): { valid: boolean; error?: string } {
  const entries = Object.entries(placements);
  if (entries.length !== TOTAL_PIECES) {
    return { valid: false, error: `Expected ${TOTAL_PIECES} pieces, got ${entries.length}` };
  }

  const allowedRows = new Set(getSetupRows(side));
  const counts: Partial<Record<RankId, number>> = {};

  for (const [coord, piece] of entries) {
    const [r, c] = parseCoord(coord);
    if (!isValidCoord(r, c) || !allowedRows.has(r)) {
      return { valid: false, error: `Piece at ${coord} is outside ${side} setup rows` };
    }
    counts[piece.rank] = (counts[piece.rank] ?? 0) + 1;
  }

  for (const spec of ROSTER_SPEC) {
    if ((counts[spec.id] ?? 0) !== spec.count) {
      return {
        valid: false,
        error: `Expected ${spec.count}x ${spec.name}, got ${counts[spec.id] ?? 0}`,
      };
    }
  }

  return { valid: true };
}

export function getLegalMoves(board: BoardMap, from: CoordKey, side: PlayerSide): CoordKey[] {
  const piece = board[from];
  if (!piece || piece.side !== side) return [];

  const [r, c] = parseCoord(from);
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const moves: CoordKey[] = [];

  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!isValidCoord(nr, nc)) continue;
    const target = formatCoord(nr, nc);
    const occupant = board[target];
    if (!occupant || occupant.side !== side) {
      moves.push(target);
    }
  }

  return moves;
}

export function resolveChallenge(
  attacker: RankId,
  defender: RankId,
): { winner: 'attacker' | 'defender' | 'both'; flagCaptured: boolean } {
  // Flag rules:
  // - Flag moving into opponent's Flag wins the game (attacker wins)
  // - Any piece moving onto Flag captures it (attacker wins)
  // - Flag moving onto non-Flag is eliminated by defender (defender wins)
  if (defender === 'flag') {
    return { winner: 'attacker', flagCaptured: true };
  }
  if (attacker === 'flag') {
    return { winner: 'defender', flagCaptured: true };
  }

  // Equal ranks: both eliminated
  if (attacker === defender) {
    return { winner: 'both', flagCaptured: false };
  }

  // Spy vs Private: Private eliminates Spy
  if (attacker === 'spy' && defender === 'private') {
    return { winner: 'defender', flagCaptured: false };
  }
  if (attacker === 'private' && defender === 'spy') {
    return { winner: 'attacker', flagCaptured: false };
  }

  // Spy vs any Officer (5-star down to Sergeant): Spy eliminates Officer
  if (attacker === 'spy') {
    return { winner: 'attacker', flagCaptured: false };
  }
  if (defender === 'spy') {
    return { winner: 'defender', flagCaptured: false };
  }

  // Standard rank comparison
  const attackerPower = RANK_BY_ID[attacker].power;
  const defenderPower = RANK_BY_ID[defender].power;
  return {
    winner: attackerPower > defenderPower ? 'attacker' : 'defender',
    flagCaptured: false,
  };
}

export function hasOrthogonallyAdjacentEnemy(
  board: BoardMap,
  coord: CoordKey,
  mySide: PlayerSide,
): boolean {
  const [r, c] = parseCoord(coord);
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (!isValidCoord(nr, nc)) continue;
    const neighbor = board[formatCoord(nr, nc)];
    if (neighbor && neighbor.side !== mySide) {
      return true;
    }
  }
  return false;
}

export function applyMove(params: {
  state: GameState;
  from: CoordKey;
  to: CoordKey;
  side: PlayerSide;
  ranksByPieceId: Record<string, RankId>;
  now: number;
}): GameState {
  const { state, from, to, side, ranksByPieceId, now } = params;
  if (state.winner) return state;
  if (state.turn !== side) return state;

  const legal = getLegalMoves(state.board, from, side);
  if (!legal.includes(to)) {
    throw new Error(`Illegal move from ${from} to ${to}`);
  }

  const nextBoard: BoardMap = { ...state.board };
  const attackerPiece = nextBoard[from];
  const defenderPiece = nextBoard[to];
  const attackerRank = ranksByPieceId[attackerPiece.id];

  delete nextBoard[from];

  let hadChallenge = false;
  let outcome: ChallengeOutcome | undefined;
  const eliminatedIds: string[] = [];
  let winner: PlayerSide | 'draw' | null = null;
  let winReason: GameState['winReason'] = null;

  if (defenderPiece) {
    hadChallenge = true;
    const defenderRank = ranksByPieceId[defenderPiece.id];
    const result = resolveChallenge(attackerRank, defenderRank);

    if (result.flagCaptured) {
      outcome = 'flag-captured';
      if (result.winner === 'attacker') {
        nextBoard[to] = attackerPiece;
        eliminatedIds.push(defenderPiece.id);
        winner = side;
      } else {
        eliminatedIds.push(attackerPiece.id);
        winner = side === 'white' ? 'black' : 'white';
      }
      winReason = 'flag-captured';
    } else if (result.winner === 'attacker') {
      outcome = 'attacker';
      nextBoard[to] = attackerPiece;
      eliminatedIds.push(defenderPiece.id);
    } else if (result.winner === 'defender') {
      outcome = 'defender';
      eliminatedIds.push(attackerPiece.id);
    } else {
      outcome = 'both';
      delete nextBoard[to];
      eliminatedIds.push(attackerPiece.id, defenderPiece.id);
    }
  } else {
    nextBoard[to] = attackerPiece;
  }

  // Check if opponent had a Flag waiting on back rank to survive this turn
  let nextFlagAtBackRank = state.flagAtBackRank ?? null;
  if (!winner && nextFlagAtBackRank && nextFlagAtBackRank.side !== side) {
    // Opponent's Flag survived this turn without being captured -> opponent wins!
    const survivingFlag = nextBoard[nextFlagAtBackRank.coord];
    if (survivingFlag && survivingFlag.side === nextFlagAtBackRank.side) {
      winner = nextFlagAtBackRank.side;
      winReason = 'flag-back-rank';
      nextFlagAtBackRank = null;
    } else {
      nextFlagAtBackRank = null;
    }
  }

  // Check if the moving piece is our Flag reaching the opponent's back rank
  if (!winner && attackerRank === 'flag' && nextBoard[to]?.id === attackerPiece.id) {
    const [destRow] = parseCoord(to);
    if (destRow === getBackRankRow(side)) {
      const enemyAdjacent = hasOrthogonallyAdjacentEnemy(nextBoard, to, side);
      if (!enemyAdjacent) {
        winner = side;
        winReason = 'flag-back-rank';
        nextFlagAtBackRank = null;
      } else {
        nextFlagAtBackRank = { side, coord: to, mustSurviveTurn: true };
      }
    }
  }

  // Reveal all pieces on board when game finishes
  if (winner) {
    for (const [coord, piece] of Object.entries(nextBoard)) {
      nextBoard[coord] = {
        ...piece,
        revealedRank: ranksByPieceId[piece.id],
      };
    }
  }

  const nextTurn: PlayerSide = side === 'white' ? 'black' : 'white';

  return {
    ...state,
    turn: nextTurn,
    turnStartedAt: now,
    moveCount: state.moveCount + 1,
    board: nextBoard,
    lastMove: {
      by: side,
      from,
      to,
      hadChallenge,
      ...(outcome !== undefined ? { outcome } : {}),
      ...(eliminatedIds.length > 0 ? { eliminatedIds } : {}),
      timestamp: now,
    },
    flagAtBackRank: nextFlagAtBackRank,
    drawOfferBy: null,
    winner,
    winReason,
  };
}
