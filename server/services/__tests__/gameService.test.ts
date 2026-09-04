// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestPrisma, truncateAll } from '../../__tests__/helpers/testDb.js';
import { AppError, ForbiddenError } from '../../lib/errors.js';
import { createGame, getGame, holdGame, rollGame } from '../gameService.js';

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
      // The last roll stays visible through a hold (§5) — lastDice is retained.
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
  });
});
