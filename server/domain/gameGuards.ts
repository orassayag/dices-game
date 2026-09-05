import type { Game } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';

export function assertReadGuard(game: Game | null, userId: string): asserts game is Game {
  if (!game) {
    throw new NotFoundError('Game not found.', { errorCode: 'GAME_NOT_FOUND' });
  }
  if (game.ownerUserId !== userId) {
    throw new ForbiddenError('You do not own this game.');
  }
}

// actorSeat always comes from the locked row's currentSeat, never the request body, so
// this is the only seat check roll/hold ever need.
export function assertActionGuard(game: Game | null, userId: string): asserts game is Game {
  assertReadGuard(game, userId);
  if (game.mode === 'ai' && game.currentSeat === game.aiSeat) {
    throw new ConflictError('The AI seat can only be played via ai-turn.', {
      errorCode: 'AI_TURN_REQUIRED',
    });
  }
}

// Deliberately its own explicit check rather than derived from assertActionGuard by
// negation — mixing the two would silently invert on a maintenance edit.
export function assertAiTurnGuard(game: Game | null, userId: string): asserts game is Game {
  assertReadGuard(game, userId);
  if (game.mode !== 'ai' || game.currentSeat !== game.aiSeat) {
    throw new ConflictError("It is not currently the AI seat's turn.", {
      errorCode: 'AI_TURN_REQUIRED',
    });
  }
}
