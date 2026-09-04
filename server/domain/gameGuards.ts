// Authorization guards (plan_v6.md §3). Pure assertion functions over an already-fetched
// row — the caller does the DB read; these only decide whether the caller may act on it.

import type { Game } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';

// Caller's JWT sub === game.ownerUserId, otherwise FORBIDDEN, or NOT_FOUND when the game
// doesn't exist. Applies regardless of `status` — an abandoned/finished game the caller
// owns still passes; only a nonexistent or non-owned id fails.
export function assertReadGuard(game: Game | null, userId: string): asserts game is Game {
  if (!game) {
    throw new NotFoundError('Game not found.', { errorCode: 'GAME_NOT_FOUND' });
  }
  if (game.ownerUserId !== userId) {
    throw new ForbiddenError('You do not own this game.');
  }
}

// Read guard AND the current seat must be human. `ai-turn` is the only path to the AI
// seat (§3) — actorSeat always comes from the locked row's currentSeat, never the
// request body, so this is the only seat check roll/hold ever need.
export function assertActionGuard(game: Game | null, userId: string): asserts game is Game {
  assertReadGuard(game, userId);
  if (game.mode === 'ai' && game.currentSeat === game.aiSeat) {
    throw new ConflictError('The AI seat can only be played via ai-turn.', {
      errorCode: 'AI_TURN_REQUIRED',
    });
  }
}
