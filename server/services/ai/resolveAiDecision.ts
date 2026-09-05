// `Promise.race` below only bounds how long this function WAITS — it never cancels the
// underlying provider call. Concurrency cleanup (single-flight claim, provider semaphore)
// must therefore hook the raw provider promise via `onProviderSettled`, not this
// function's return.

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
  // null runs the heuristic directly with no network attempt.
  provider: AiDecisionProvider | null;
  context: AiDecisionContext;
  gameId: string;
  logger?: Logger;
  // Fires once the underlying provider call SETTLES, not when the deadline race ends.
  // Never called when `provider` is null.
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
