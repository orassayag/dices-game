import type { AiDecision, AiDecisionContext, AiDecisionProvider } from './aiTypes.js';

export type RandomSource = () => number;

// Sampled per decision rather than a fixed threshold, so the AI sometimes banks early and
// sometimes pushes its luck instead of always hitting the same optimal stopping point.
// random()=0.5 reproduces the old fixed value of 20, which some tests rely on.
const HOLD_THRESHOLD_MIN: number = 15;
const HOLD_THRESHOLD_MAX: number = 25;

export function decideHeuristically(
  context: AiDecisionContext,
  random: RandomSource = Math.random,
): AiDecision {
  const wouldWinByHolding = context.seatTotal + context.roundScore >= context.targetScore;
  if (wouldWinByHolding) {
    return { action: 'hold' };
  }
  const holdThreshold = HOLD_THRESHOLD_MIN + random() * (HOLD_THRESHOLD_MAX - HOLD_THRESHOLD_MIN);
  return context.roundScore >= holdThreshold ? { action: 'hold' } : { action: 'roll' };
}

// `random` is constructor-injected, not a `decide()` param, so the class still satisfies
// `AiDecisionProvider`'s fixed method signature.
export class HeuristicProvider implements AiDecisionProvider {
  public constructor(private readonly random: RandomSource = Math.random) {}

  public async decide(context: AiDecisionContext): Promise<AiDecision> {
    return await Promise.resolve(decideHeuristically(context, this.random));
  }
}
