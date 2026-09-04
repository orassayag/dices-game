// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decideHeuristically, HeuristicProvider } from '../heuristicProvider.js';
import { LEGAL_AI_ACTIONS, type AiDecisionContext } from '../aiTypes.js';

function context(overrides: Partial<AiDecisionContext> = {}): AiDecisionContext {
  return {
    targetScore: 100,
    currentSeat: 1,
    seatTotal: 0,
    roundScore: 0,
    lastDice: [],
    legalActions: LEGAL_AI_ACTIONS,
    ...overrides,
  };
}

describe('decideHeuristically', () => {
  it('should roll when the round score is low and holding would not win', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 5, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should hold once the round score reaches the fixed threshold', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 20, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should roll one point below the round-score threshold', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 19, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should hold when holding now would reach the target score', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 5, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should hold when holding now would exceed the target score', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 12, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should roll one point below a winning hold', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 4, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'roll' });
  });
});

describe('HeuristicProvider', () => {
  it('should resolve via decide() using the same deterministic rule', async () => {
    const provider = new HeuristicProvider();
    const decision = await provider.decide(
      context({ seatTotal: 0, roundScore: 20, targetScore: 100 }),
      AbortSignal.timeout(1000),
    );
    expect(decision).toEqual({ action: 'hold' });
  });
});
