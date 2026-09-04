// @vitest-environment node
import type { Game } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { assertActionGuard, assertReadGuard } from '../gameGuards.js';

const OWNER_ID = 'owner-1';

function buildGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    ownerUserId: OWNER_ID,
    mode: 'human',
    aiSeat: null,
    aiMoveCount: 0,
    targetScore: 100,
    status: 'in_progress',
    currentSeat: 1,
    p1Score: 0,
    p2Score: 0,
    roundScore: 0,
    lastDice: [],
    winnerSeat: null,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Game;
}

describe('assertReadGuard', () => {
  it('should throw NotFoundError (GAME_NOT_FOUND) when the game does not exist', () => {
    expect(() => assertReadGuard(null, OWNER_ID)).toThrow(NotFoundError);
  });

  it('should throw ForbiddenError when the caller does not own the game', () => {
    expect(() => assertReadGuard(buildGame(), 'someone-else')).toThrow(ForbiddenError);
  });

  it('should pass for the owner regardless of status', () => {
    const game = buildGame({ status: 'finished', winnerSeat: 1, p1Score: 100 });
    expect(() => assertReadGuard(game, OWNER_ID)).not.toThrow();
  });
});

describe('assertActionGuard', () => {
  it('should throw a ConflictError with AI_TURN_REQUIRED when the current seat is the AI seat', () => {
    const game = buildGame({ mode: 'ai', aiSeat: 1, currentSeat: 1 });

    try {
      assertActionGuard(game, OWNER_ID);
      expect.unreachable('assertActionGuard should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as AppError).errorCode).toBe('AI_TURN_REQUIRED');
    }
  });

  it('should pass when the current seat is human even in an ai-mode game', () => {
    const game = buildGame({ mode: 'ai', aiSeat: 2, currentSeat: 1 });
    expect(() => assertActionGuard(game, OWNER_ID)).not.toThrow();
  });

  it('should enforce ownership before the seat check', () => {
    const game = buildGame({ mode: 'ai', aiSeat: 1, currentSeat: 1 });
    expect(() => assertActionGuard(game, 'someone-else')).toThrow(ForbiddenError);
  });
});
