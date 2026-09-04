// Mandatory heuristic fallback (plan_v6.md §9) — keeps the game playable, and CI/grading
// fully offline: no API key or network call is ever required to reach a decision.
// Deterministic *per call* given an injected `random` source (mirrors gameEngine.ts's
// `DiceRoller` injection) — real play uses `Math.random`, tests inject a fixed source.

import type { AiDecision, AiDecisionContext, AiDecisionProvider } from './aiTypes.js';

export type RandomSource = () => number;

// A fixed hold-at-20 threshold played the same, close-to-optimal strategy every turn and
// won disproportionately often against less disciplined human play. The AI now samples a
// threshold in this range on every decision instead, so it sometimes banks early and
// sometimes pushes its luck — "rolls a random number of times" rather than always hitting
// the same optimal stopping point. random()=0.5 reproduces the old fixed value of 20,
// which the existing test suite relies on for its deterministic cases.
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

// Wraps `decideHeuristically` as an `AiDecisionProvider` so it can stand in directly
// wherever a live provider would plug in later — no route/engine changes needed once a
// real model is wired (see the plan's Open Questions; this project runs heuristic-only).
// `random` is constructor-injected (not a `decide()` param) so the class still satisfies
// `AiDecisionProvider`'s fixed method signature.
export class HeuristicProvider implements AiDecisionProvider {
  public constructor(private readonly random: RandomSource = Math.random) {}

  public async decide(context: AiDecisionContext, _signal: AbortSignal): Promise<AiDecision> {
    return await Promise.resolve(decideHeuristically(context, this.random));
  }
}
