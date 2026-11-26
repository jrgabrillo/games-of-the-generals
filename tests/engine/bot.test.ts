import { describe, expect, it } from 'vitest';
import {
  chooseBotMove,
  createBotSetup,
  createInitialBelief,
  updateBeliefAfterMove,
} from '../../src/engine/bot';
import { applyMove, getLegalMoves, validateSetup } from '../../src/engine/rules';
import type { GameState, RankId } from '../../src/engine/types';

describe('Games of the Generals — Bot Engine', () => {
  it('generates valid 21-piece setups for all 3 difficulties', () => {
    for (const diff of ['private', 'general', 'spy'] as const) {
      const blackSetup = createBotSetup('black', diff);
      const whiteSetup = createBotSetup('white', diff);
      expect(validateSetup('black', blackSetup).valid).toBe(true);
      expect(validateSetup('white', whiteSetup).valid).toBe(true);
    }
  });

  it('fairly deduces opponent is a Private when it eliminates the bot Spy', () => {
    const prevState: GameState = {
      turn: 'white',
      turnStartedAt: 1000,
      moveCount: 2,
      board: {
        '4,4': { id: 'w-01', side: 'white' },
        '5,4': { id: 'b-spy', side: 'black' },
      },
    };
    const ranks: Record<string, RankId> = {
      'w-01': 'private',
      'b-spy': 'spy',
    };
    const botRanks: Record<string, RankId> = { 'b-spy': 'spy' };

    const belief = createInitialBelief(prevState.board, 'black');
    const nextState = applyMove({
      state: prevState,
      from: '4,4',
      to: '5,4',
      side: 'white',
      ranksByPieceId: ranks,
      now: 2000,
    });

    const updated = updateBeliefAfterMove({
      belief,
      prevState,
      nextState,
      botSide: 'black',
      botRanks,
    });

    expect(updated.possibleRanks['w-01']).toEqual(['private']);
  });

  it('immediately captures an enemy Flag on the bot back rank', () => {
    const state: GameState = {
      turn: 'black',
      turnStartedAt: 1000,
      moveCount: 20,
      board: {
        '7,4': { id: 'w-flag', side: 'white' },
        '7,5': { id: 'b-pvt', side: 'black' },
        '5,0': { id: 'b-flag', side: 'black' },
      },
      flagAtBackRank: {
        side: 'white',
        coord: '7,4',
        mustSurviveTurn: true,
      },
    };
    const botRanks: Record<string, RankId> = { 'b-pvt': 'private', 'b-flag': 'flag' };
    const belief = createInitialBelief(state.board, 'black');

    const move = chooseBotMove({
      state,
      botSide: 'black',
      botRanks,
      difficulty: 'spy',
      belief,
    });

    expect(move).toEqual({ from: '7,5', to: '7,4' });
  });

  it('always returns a legal move on a full board', () => {
    const wSetup = createBotSetup('white', 'general');
    const bSetup = createBotSetup('black', 'spy');
    const board: GameState['board'] = {};
    const botRanks: Record<string, RankId> = {};

    for (const [c, p] of Object.entries(wSetup)) board[c] = { id: p.id, side: 'white' };
    for (const [c, p] of Object.entries(bSetup)) {
      board[c] = { id: p.id, side: 'black' };
      botRanks[p.id] = p.rank;
    }

    const state: GameState = {
      turn: 'black',
      turnStartedAt: 1000,
      moveCount: 0,
      board,
    };
    const belief = createInitialBelief(board, 'black');

    const move = chooseBotMove({
      state,
      botSide: 'black',
      botRanks,
      difficulty: 'spy',
      belief,
    });

    expect(move).not.toBeNull();
    const legal = getLegalMoves(board, move!.from, 'black');
    expect(legal).toContain(move!.to);
  });
});
