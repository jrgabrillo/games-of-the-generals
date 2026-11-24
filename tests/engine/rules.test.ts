import { describe, expect, it } from 'vitest';
import { createRandomSetup, TOTAL_PIECES } from '../../src/engine/roster';
import {
  applyMove,
  getLegalMoves,
  resolveChallenge,
  validateSetup,
} from '../../src/engine/rules';
import type { GameState, RankId } from '../../src/engine/types';

describe('Games of the Generals — Core Engine', () => {
  it('generates and validates a 21-piece setup on the 3x9 zone', () => {
    const white = createRandomSetup('white');
    const black = createRandomSetup('black');

    expect(Object.keys(white.boardCoords)).toHaveLength(TOTAL_PIECES);
    expect(validateSetup('white', white.boardCoords).valid).toBe(true);
    expect(validateSetup('black', black.boardCoords).valid).toBe(true);
    expect(validateSetup('white', black.boardCoords).valid).toBe(false);
  });

  it('allows only orthogonal 1-square moves and blocks friendly squares', () => {
    const board = {
      '4,4': { id: 'w-1', side: 'white' as const },
      '4,5': { id: 'w-2', side: 'white' as const },
      '3,4': { id: 'b-1', side: 'black' as const },
    };
    const moves = getLegalMoves(board, '4,4', 'white');
    expect(moves.sort()).toEqual(['3,4', '4,3', '5,4']);
  });

  it('resolves all official challenge rules accurately', () => {
    // Higher rank wins
    expect(resolveChallenge('5-star', '4-star')).toEqual({
      winner: 'attacker',
      flagCaptured: false,
    });
    expect(resolveChallenge('sergeant', 'colonel')).toEqual({
      winner: 'defender',
      flagCaptured: false,
    });

    // Equal rank eliminates both
    expect(resolveChallenge('major', 'major')).toEqual({
      winner: 'both',
      flagCaptured: false,
    });

    // Spy eliminates any officer (5-star down to sergeant)
    expect(resolveChallenge('spy', '5-star')).toEqual({
      winner: 'attacker',
      flagCaptured: false,
    });
    expect(resolveChallenge('sergeant', 'spy')).toEqual({
      winner: 'defender',
      flagCaptured: false,
    });

    // Private eliminates Spy
    expect(resolveChallenge('private', 'spy')).toEqual({
      winner: 'attacker',
      flagCaptured: false,
    });
    expect(resolveChallenge('spy', 'private')).toEqual({
      winner: 'defender',
      flagCaptured: false,
    });

    // Flag rules (including Flag vs Flag)
    expect(resolveChallenge('private', 'flag')).toEqual({
      winner: 'attacker',
      flagCaptured: true,
    });
    expect(resolveChallenge('flag', 'flag')).toEqual({
      winner: 'attacker',
      flagCaptured: true,
    });
    expect(resolveChallenge('flag', 'private')).toEqual({
      winner: 'defender',
      flagCaptured: true,
    });
  });

  it('wins immediately when Flag reaches back rank with no orthogonally adjacent enemy', () => {
    const state: GameState = {
      turn: 'white',
      turnStartedAt: 1000,
      moveCount: 10,
      board: {
        '6,4': { id: 'w-flag', side: 'white' },
        '7,0': { id: 'b-flag', side: 'black' },
      },
    };
    const ranks: Record<string, RankId> = {
      'w-flag': 'flag',
      'b-flag': 'flag',
    };

    const next = applyMove({
      state,
      from: '6,4',
      to: '7,4',
      side: 'white',
      ranksByPieceId: ranks,
      now: 2000,
    });

    expect(next.winner).toBe('white');
    expect(next.winReason).toBe('flag-back-rank');
  });

  it('gives opponent 1 turn to capture if Flag reaches back rank next to an enemy piece', () => {
    const state: GameState = {
      turn: 'white',
      turnStartedAt: 1000,
      moveCount: 10,
      board: {
        '6,4': { id: 'w-flag', side: 'white' },
        '7,5': { id: 'b-pvt', side: 'black' },
        '0,0': { id: 'b-flag', side: 'black' },
      },
    };
    const ranks: Record<string, RankId> = {
      'w-flag': 'flag',
      'b-pvt': 'private',
      'b-flag': 'flag',
    };

    // White Flag arrives at 7,4 adjacent to black Private at 7,5 -> does NOT win yet
    const afterArrival = applyMove({
      state,
      from: '6,4',
      to: '7,4',
      side: 'white',
      ranksByPieceId: ranks,
      now: 2000,
    });
    expect(afterArrival.winner).toBeNull();
    expect(afterArrival.flagAtBackRank?.mustSurviveTurn).toBe(true);

    // If Black moves away instead of capturing, White wins!
    const afterBlackBlunder = applyMove({
      state: afterArrival,
      from: '7,5',
      to: '6,5',
      side: 'black',
      ranksByPieceId: ranks,
      now: 3000,
    });
    expect(afterBlackBlunder.winner).toBe('white');
    expect(afterBlackBlunder.winReason).toBe('flag-back-rank');
  });
});
