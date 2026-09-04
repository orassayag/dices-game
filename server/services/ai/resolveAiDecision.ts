// Orchestrates one AI decision end-to-end (plan_v6.md §9): bound the wait with an
// application-level deadline, validate whatever the provider returns, and fall back to
// the deterministic heuristic on ANY failure — timeout, rejection, or a malformed reply
// are all treated identically. `Promise.race` only bounds how long this function WAITS;
// it never cancels the underlying provider call, which is exactly why cleanup tied to
// concurrency state (single-flight claim, provider semaphore — see aiTurnConcurrency.ts)
// must hook the raw provider promise via `onProviderSettled`, not this function's return.

import { createLogger, type Logger } from '../../lib/logger.js';
import { decideHeuristically } from './heuristicProvider.js';
import {
  AiDecisionSchema,
  type AiDecision,
  type AiDecisionContext,
  type AiDecisionProvider,
} from './aiTypes.js';

export const AI_DEADLINE_MS: number = 3000;

const defaultLogger: Logger = createLogger('ai-decision');

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`AI provider call exceeded the ${ms}ms deadline.`)), ms);
  });
}

export interface ResolveAiDecisionParams {
  /** `null` means no live provider is configured — this project's current, deliberate
   *  heuristic-only setup (plan_v6.md's Open Questions). The heuristic then runs
   *  directly with no network attempt, so no API key is ever required to play. */
  provider: AiDecisionProvider | null;
  context: AiDecisionContext;
  /** Included only for log correlation — never passed into `context` (the adapter's data
   *  boundary excludes it). */
  gameId: string;
  logger?: Logger;
  /** Invoked exactly once, when the underlying provider call SETTLES — not when the
   *  deadline race ends. The hook point for releasing single-flight/semaphore state tied
   *  to real completion (I2). Never called when `provider` is null (the heuristic runs
   *  synchronously — there is nothing to settle). */
  onProviderSettled?: () => void;
}

export async function resolveAiDecision(params: ResolveAiDecisionParams): Promise<AiDecision> {
  const { provider, context, gameId, onProviderSettled } = params;
  const logger = params.logger ?? defaultLogger;

  if (provider === null) {
    return decideHeuristically(context);
  }

  const providerPromise = provider.decide(context, AbortSignal.timeout(AI_DEADLINE_MS));
  if (onProviderSettled) {
    providerPromise.finally(onProviderSettled).catch(() => {
      // onProviderSettled's own failure has nothing meaningful to do here — the
      // underlying provider rejection is already handled by the race below.
    });
  }

  let raced: unknown;
  try {
    raced = await Promise.race([providerPromise, rejectAfter(AI_DEADLINE_MS)]);
  } catch {
    logger.warn('AI provider call missed the deadline; falling back to the heuristic', {
      gameId,
      reason: 'ai_provider_timeout',
    });
    return decideHeuristically(context);
  }

  const parsed = AiDecisionSchema.safeParse(raced);
  if (!parsed.success) {
    logger.warn('AI provider returned an invalid decision; falling back to the heuristic', {
      gameId,
      reason: 'ai_provider_invalid_output',
    });
    return decideHeuristically(context);
  }
  return parsed.data;
}
