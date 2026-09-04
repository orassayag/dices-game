// Mandatory, deterministic fallback (plan_v6.md §9) — keeps the game playable, and CI/
// grading fully offline: no API key or network call is ever required to reach a decision.

import type { AiDecision, AiDecisionContext, AiDecisionProvider } from './aiTypes.js';

const HEURISTIC_HOLD_ROUND_SCORE_THRESHOLD: number = 20;

export function decideHeuristically(context: AiDecisionContext): AiDecision {
  const wouldWinByHolding = context.seatTotal + context.roundScore >= context.targetScore;
  const roundScoreIsHighEnough = context.roundScore >= HEURISTIC_HOLD_ROUND_SCORE_THRESHOLD;
  return wouldWinByHolding || roundScoreIsHighEnough ? { action: 'hold' } : { action: 'roll' };
}

// Wraps `decideHeuristically` as an `AiDecisionProvider` so it can stand in directly
// wherever a live provider would plug in later — no route/engine changes needed once a
// real model is wired (see the plan's Open Questions; this project runs heuristic-only).
export class HeuristicProvider implements AiDecisionProvider {
  public async decide(context: AiDecisionContext, _signal: AbortSignal): Promise<AiDecision> {
    return await Promise.resolve(decideHeuristically(context));
  }
}
