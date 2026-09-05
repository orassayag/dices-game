// @vitest-environment node
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestPrisma, truncateAll } from '../../__tests__/helpers/testDb.js';
import { AppError, ForbiddenError } from '../../lib/errors.js';
import {
  createGame,
  getGame,
  getLeaderboard,
  holdGame,
  isUniqueConstraintViolation,
  listInProgressGames,
  rollGame,
} from '../gameService.js';
import { AI_PLAYER_NAME } from '../../../shared/index.js';

const TARGET_SCORE: number = 100;

function fixedRoller(a: number, b: number) {
  return (): [number, number] => [a, b];
}

async function createTestUser(usernameKey: string): Promise<string> {
  const user = await getTestPrisma().user.create({
    data: { username: usernameKey, usernameKey, passwordHash: 'not-a-real-hash' },
  });
  return user.id;
}

async function winsFor(ownerUserId: string, name: string): Promise<number> {
  const player = await getTestPrisma().leaderboardPlayer.findUnique({
    where: { ownerUserId_name: { ownerUserId, name } },
  });
  return player?.wins ?? 0;
}

describe('gameService', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('createGame', () => {
    it('should return a fresh in-progress game with a null lastMove and derived busted:false', async () => {
      const ownerId = await createTestUser('alice');

      const game = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      expect(game.status).toBe('in_progress');
      expect(game.currentSeat).toBe(1);
      expect(game.lastMove).toBeNull();
      expect(game.busted).toBe(false);
      expect(game.lastDice).toEqual([]);
      expect(game.roundScore).toBe(0);
      expect(game.winnerSeat).toBeNull();
      expect(game.version).toBe(0);
    });

    it('should give the first turn to the seat that won the previous finished game', async () => {
      const ownerId = await createTestUser('winner-starts');
      const first = await createGame(ownerId, { targetScore: 10, mode: 'human' });
      const rolled = await rollGame(first.id, ownerId, first.version, fixedRoller(6, 5));
      const finished = await holdGame(first.id, ownerId, rolled.version);
      expect(finished.winnerSeat).toBe(1);

      const next = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      expect(next.currentSeat).toBe(1);
    });

    it('should give the first turn to seat 2 when seat 2 won the previous game', async () => {
      const ownerId = await createTestUser('seat2-starts');
      const first = await createGame(ownerId, { targetScore: 10, mode: 'human' });
      await rollGame(first.id, ownerId, first.version, fixedRoller(6, 6));
      const seat2Rolled = await rollGame(first.id, ownerId, first.version + 1, fixedRoller(6, 5));
      const finished = await holdGame(first.id, ownerId, seat2Rolled.version);
      expect(finished.winnerSeat).toBe(2);

      const next = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      expect(next.currentSeat).toBe(2);
    });
  });

  describe('getGame', () => {
    it('should return the game to its owner', async () => {
      const ownerId = await createTestUser('bob');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const fetched = await getGame(created.id, ownerId);
      expect(fetched.id).toBe(created.id);
    });

    it('should reject a non-owner with ForbiddenError', async () => {
      const ownerId = await createTestUser('carol');
      const otherId = await createTestUser('dave');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      await expect(getGame(created.id, otherId)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('rollGame', () => {
    it('should bust on 6 & 6: reset the round score and pass the seat', async () => {
      const ownerId = await createTestUser('erin');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const result = await rollGame(created.id, ownerId, created.version, fixedRoller(6, 6));

      expect(result.busted).toBe(true);
      expect(result.lastMove).toEqual({ kind: 'roll', dice: [6, 6], busted: true });
      expect(result.roundScore).toBe(0);
      expect(result.currentSeat).toBe(2);
      expect(result.version).toBe(created.version + 1);
    });

    it('should accumulate the round score and keep the seat on a non-bust roll', async () => {
      const ownerId = await createTestUser('frank');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const result = await rollGame(created.id, ownerId, created.version, fixedRoller(3, 4));

      expect(result.roundScore).toBe(7);
      expect(result.currentSeat).toBe(1);
      expect(result.busted).toBe(false);
    });

    it('should reject a stale expectedVersion with VERSION_CONFLICT', async () => {
      const ownerId = await createTestUser('grace');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });
      const staleVersion = created.version + 1;

      try {
        await rollGame(created.id, ownerId, staleVersion, fixedRoller(3, 4));
        expect.unreachable('rollGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('VERSION_CONFLICT');
      }
    });

    it('should reject a manual roll on the AI seat with AI_TURN_REQUIRED', async () => {
      const ownerId = await createTestUser('heidi');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });

      try {
        await rollGame(created.id, ownerId, created.version, fixedRoller(3, 4));
        expect.unreachable('rollGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('AI_TURN_REQUIRED');
      }
    });
  });

  describe('holdGame', () => {
    it('should bank the round score into the seat total, reset roundScore, and pass the seat', async () => {
      const ownerId = await createTestUser('ivan');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });
      const rolled = await rollGame(created.id, ownerId, created.version, fixedRoller(3, 4));

      const held = await holdGame(created.id, ownerId, rolled.version);

      expect(held.p1Score).toBe(7);
      expect(held.roundScore).toBe(0);
      expect(held.currentSeat).toBe(2);
      expect(held.status).toBe('in_progress');
      expect(held.lastDice).toEqual([3, 4]);
    });

    it('should finish the game and set winnerSeat when the banked total reaches the target', async () => {
      const ownerId = await createTestUser('judy');
      const created = await createGame(ownerId, { targetScore: 10, mode: 'human' });
      const rolled = await rollGame(created.id, ownerId, created.version, fixedRoller(6, 5));

      const held = await holdGame(created.id, ownerId, rolled.version);

      expect(held.status).toBe('finished');
      expect(held.winnerSeat).toBe(1);
      expect(held.p1Score).toBe(11);
    });

    it('should credit the winning seat name exactly one win and never re-credit a stale retry', async () => {
      const ownerId = await createTestUser('paul');
      const created = await createGame(ownerId, {
        targetScore: 10,
        mode: 'human',
        p1Name: 'Ryan Mitchell',
        p2Name: 'James Carter',
      });
      const rolled = await rollGame(created.id, ownerId, created.version, fixedRoller(6, 5));

      const held = await holdGame(created.id, ownerId, rolled.version);
      expect(held.status).toBe('finished');
      const winsAfterFirstHold = await winsFor(ownerId, 'Ryan Mitchell');
      expect(winsAfterFirstHold).toBe(1);

      try {
        await holdGame(created.id, ownerId, rolled.version);
        expect.unreachable('a stale-version retry should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('VERSION_CONFLICT');
      }
      const winsAfterStaleRetry = await winsFor(ownerId, 'Ryan Mitchell');
      expect(winsAfterStaleRetry).toBe(1);
    });

    it('should not credit any win on a non-winning hold', async () => {
      const ownerId = await createTestUser('quinn');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'human',
        p1Name: 'Ryan Mitchell',
        p2Name: 'James Carter',
      });
      const rolled = await rollGame(created.id, ownerId, created.version, fixedRoller(3, 4));

      await holdGame(created.id, ownerId, rolled.version);

      expect(await winsFor(ownerId, 'Ryan Mitchell')).toBe(0);
    });
  });

  describe('leaderboard', () => {
    it('should register both seat names at zero wins when a game is created', async () => {
      const ownerId = await createTestUser('rita');
      await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'human',
        p1Name: 'Ryan Mitchell',
        p2Name: 'James Carter',
      });

      const board = await getLeaderboard(ownerId);
      expect(board).toEqual([
        { name: 'James Carter', wins: 0 },
        { name: 'Ryan Mitchell', wins: 0 },
      ]);
    });

    it('should store the AI name for the AI seat and rank winners first', async () => {
      const ownerId = await createTestUser('sam');
      const created = await createGame(ownerId, {
        targetScore: 10,
        mode: 'ai',
        aiSeat: 2,
        p1Name: 'Ryan Mitchell',
        p2Name: 'ignored-client-name',
      });
      const rolled = await rollGame(created.id, ownerId, created.version, fixedRoller(6, 5));
      await holdGame(created.id, ownerId, rolled.version);

      const board = await getLeaderboard(ownerId);
      expect(board).toEqual([
        { name: 'Ryan Mitchell', wins: 1 },
        { name: AI_PLAYER_NAME, wins: 0 },
      ]);
    });
  });

  describe('createGame — abandon + create (§7)', () => {
    it('should abandon the existing in-progress game when creating a new one', async () => {
      const ownerId = await createTestUser('mallory');
      const first = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const second = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      expect(second.id).not.toBe(first.id);
      const firstFetched = await getGame(first.id, ownerId);
      expect(firstFetched.status).toBe('abandoned');
    });
  });

  describe('isUniqueConstraintViolation (§7 — GAME_CONFLICT mapping)', () => {
    it('should recognize a Prisma P2002 unique-constraint error', () => {
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`owner_user_id`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );

      expect(isUniqueConstraintViolation(uniqueViolation)).toBe(true);
    });

    it('should reject a Prisma error with a different code', () => {
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.19.3',
      });

      expect(isUniqueConstraintViolation(notFoundError)).toBe(false);
    });

    it('should reject a plain, non-Prisma error', () => {
      expect(isUniqueConstraintViolation(new Error('boom'))).toBe(false);
    });
  });

  describe('zero-row update — GAME_ABANDONED vs. VERSION_CONFLICT (§6)', () => {
    it('should throw GAME_ABANDONED, not VERSION_CONFLICT, when the game was abandoned before the action landed', async () => {
      const ownerId = await createTestUser('oscar');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      await getTestPrisma().game.update({
        where: { id: created.id },
        data: { status: 'abandoned', version: { increment: 1 } },
      });

      try {
        await rollGame(created.id, ownerId, created.version, fixedRoller(3, 4));
        expect.unreachable('rollGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('GAME_ABANDONED');
      }
    });

    it('should still throw VERSION_CONFLICT for a plain stale version on an in-progress game', async () => {
      const ownerId = await createTestUser('peggy');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      try {
        await rollGame(created.id, ownerId, created.version + 1, fixedRoller(3, 4));
        expect.unreachable('rollGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('VERSION_CONFLICT');
      }
    });
  });

  describe('listInProgressGames (§5, §7)', () => {
    it("should return the owner's in-progress game", async () => {
      const ownerId = await createTestUser('rachel');
      const created = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const games = await listInProgressGames(ownerId, 10);

      expect(games).toHaveLength(1);
      expect(games[0]?.id).toBe(created.id);
    });

    it('should return an empty array when the owner has no in-progress game', async () => {
      const ownerId = await createTestUser('sam');

      const games = await listInProgressGames(ownerId, 10);

      expect(games).toEqual([]);
    });

    it('should not include a game abandoned by a subsequent create', async () => {
      const ownerId = await createTestUser('tina');
      const first = await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });
      await createGame(ownerId, { targetScore: TARGET_SCORE, mode: 'human' });

      const games = await listInProgressGames(ownerId, 10);

      expect(games).toHaveLength(1);
      expect(games[0]?.id).not.toBe(first.id);
    });
  });
});
