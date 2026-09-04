// @vitest-environment node
import type { Game } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildAiDecisionContext } from '../buildAiDecisionContext.js';

function buildGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    ownerUserId: 'owner-1',
    mode: 'ai',
    aiSeat: 1,
    aiMoveCount: 0,
    targetScore: 100,
    status: 'in_progress',
    currentSeat: 1,
    p1Score: 12,
    p2Score: 34,
    roundScore: 7,
    lastDice: [3, 4],
    winnerSeat: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Game;
}

describe('buildAiDecisionContext', () => {
  it('should expose exactly the six documented fields (§9 data boundary)', () => {
    const context = buildAiDecisionContext(buildGame(), 1);

    expect(Object.keys(context).sort()).toEqual(
      ['currentSeat', 'lastDice', 'legalActions', 'roundScore', 'seatTotal', 'targetScore'].sort(),
    );
  });

  it("should read the acting seat's own total, not the opponent's", () => {
    const game = buildGame({ p1Score: 12, p2Score: 34 });

    expect(buildAiDecisionContext(game, 1).seatTotal).toBe(12);
    expect(buildAiDecisionContext(game, 2).seatTotal).toBe(34);
  });

  it('should carry the round score and target score through unchanged', () => {
    const game = buildGame({ roundScore: 7, targetScore: 55 });
    const context = buildAiDecisionContext(game, 1);

    expect(context.roundScore).toBe(7);
    expect(context.targetScore).toBe(55);
  });

  it('should map an empty lastDice array to an empty tuple', () => {
    const context = buildAiDecisionContext(buildGame({ lastDice: [] }), 1);
    expect(context.lastDice).toEqual([]);
  });

  it('should map a two-element lastDice array to a validated die pair', () => {
    const context = buildAiDecisionContext(buildGame({ lastDice: [5, 6] }), 1);
    expect(context.lastDice).toEqual([5, 6]);
  });

  it('should throw when a stored die value is out of the 1-6 range', () => {
    const game = buildGame({ lastDice: [0, 6] });
    expect(() => buildAiDecisionContext(game, 1)).toThrow(/die face/);
  });

  it('should always expose both actions as legal (holding at roundScore 0 is a legal no-op)', () => {
    const context = buildAiDecisionContext(buildGame(), 1);
    expect(context.legalActions).toEqual(['roll', 'hold']);
  });
});
