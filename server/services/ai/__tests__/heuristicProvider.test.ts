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

// random()=0.5 lands the sampled hold threshold at exactly 20 (the midpoint of
// [15, 25]) — the old fixed threshold — so these cases stay deterministic.
const MID_RANDOM = () => 0.5;

describe('decideHeuristically', () => {
  it('should roll when the round score is low and holding would not win', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 5, targetScore: 100 }),
      MID_RANDOM,
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should hold once the round score reaches the sampled threshold', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 20, targetScore: 100 }),
      MID_RANDOM,
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should roll one point below the sampled threshold', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 19, targetScore: 100 }),
      MID_RANDOM,
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should hold when holding now would reach the target score', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 5, targetScore: 100 }),
      MID_RANDOM,
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should hold when holding now would exceed the target score', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 12, targetScore: 100 }),
      MID_RANDOM,
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should roll one point below a winning hold, regardless of the random source', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 95, roundScore: 4, targetScore: 100 }),
      () => 0,
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should hold earlier when the random source samples the low end of the range', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 15, targetScore: 100 }),
      () => 0,
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should keep rolling longer when the random source samples the high end of the range', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 24, targetScore: 100 }),
      () => 1,
    );
    expect(decision).toEqual({ action: 'roll' });
  });

  it('should never hold below the minimum threshold no matter the random source', () => {
    const decision = decideHeuristically(
      context({ seatTotal: 10, roundScore: 14, targetScore: 100 }),
      () => 0,
    );
    expect(decision).toEqual({ action: 'roll' });
  });
});

describe('HeuristicProvider', () => {
  it('should resolve via decide() using its injected random source', async () => {
    const provider = new HeuristicProvider(MID_RANDOM);
    const decision = await provider.decide(
      context({ seatTotal: 0, roundScore: 20, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'hold' });
  });

  it('should default to Math.random when no random source is injected', async () => {
    const provider = new HeuristicProvider();
    const decision = await provider.decide(
      context({ seatTotal: 95, roundScore: 5, targetScore: 100 }),
    );
    expect(decision).toEqual({ action: 'hold' });
  });
});
