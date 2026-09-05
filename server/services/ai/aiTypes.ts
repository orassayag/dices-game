// A single `AiDecisionProvider.decide(...)` call is the only thing a model ever sees —
// exactly the fields on AiDecisionContext below, never the auth token, username, raw DB
// rows, or any other request data.

import { z } from 'zod';
import type { Seat } from '../../domain/gameEngine.js';

export type Die = 1 | 2 | 3 | 4 | 5 | 6;

export const LEGAL_AI_ACTIONS = ['roll', 'hold'] as const;

export interface AiDecisionContext {
  targetScore: number;
  currentSeat: Seat;
  seatTotal: number;
  roundScore: number;
  lastDice: [] | [Die, Die];
  legalActions: typeof LEGAL_AI_ACTIONS;
}

export const AiDecisionSchema = z.object({ action: z.enum(['roll', 'hold']) }).strict();

export type AiDecision = z.infer<typeof AiDecisionSchema>;

// Implementations must never await network I/O while a DB transaction or row lock is
// open — the caller is responsible for that ordering, not this interface.
export interface AiDecisionProvider {
  decide(context: AiDecisionContext, signal: AbortSignal): Promise<AiDecision>;
}
