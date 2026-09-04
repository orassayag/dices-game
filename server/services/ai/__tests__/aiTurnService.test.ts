// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { getTestPrisma, truncateAll } from '../../../__tests__/helpers/testDb.js';
import { AppError } from '../../../lib/errors.js';
import { createGame } from '../../gameService.js';
import { aiTurnGame } from '../aiTurnService.js';
import { AI_DEADLINE_MS } from '../resolveAiDecision.js';
import type { AiDecision, AiDecisionProvider } from '../aiTypes.js';

const TARGET_SCORE: number = 100;
const AI_MOVE_COUNT_CAP: number = 50;

async function createTestUser(usernameKey: string): Promise<string> {
  const user = await getTestPrisma().user.create({
    data: { username: usernameKey, usernameKey, passwordHash: 'not-a-real-hash' },
  });
  return user.id;
}

function hangingProvider(onDecideCalled?: () => void): {
  provider: AiDecisionProvider;
  resolve: (decision: AiDecision) => void;
  callCount: () => number;
} {
  let callCount: number = 0;
  let resolveFn!: (decision: AiDecision) => void;
  const provider: AiDecisionProvider = {
    decide: () => {
      callCount += 1;
      onDecideCalled?.();
      return new Promise<AiDecision>((resolve) => {
        resolveFn = resolve;
      });
    },
  };
  return { provider, resolve: (decision) => resolveFn(decision), callCount: () => callCount };
}

describe('aiTurnGame', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  describe('heuristic-only happy path (§9)', () => {
    it('should apply a single heuristic-driven roll and bump the version on a fresh game', async () => {
      const ownerId = await createTestUser('alice');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });

      const result = await aiTurnGame(created.id, ownerId, created.version);

      expect(result.version).toBe(created.version + 1);
      expect(result.lastMove?.kind).toBe('roll');
    });

    it('should reject an ai-turn call when the current seat is the human seat with AI_TURN_REQUIRED', async () => {
      const ownerId = await createTestUser('bob');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 2, // currentSeat starts at 1 — the human seat
      });

      try {
        await aiTurnGame(created.id, ownerId, created.version);
        expect.unreachable('aiTurnGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('AI_TURN_REQUIRED');
      }
    });
  });

  describe('move-count cap + forfeit (I1, I4)', () => {
    it('should forfeit to the human seat without incrementing aiMoveCount once the cap is reached', async () => {
      const ownerId = await createTestUser('carol');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });
      await getTestPrisma().game.update({
        where: { id: created.id },
        data: { aiMoveCount: AI_MOVE_COUNT_CAP, roundScore: 15 },
      });

      const result = await aiTurnGame(created.id, ownerId, created.version);

      expect(result.lastMove).toEqual({ kind: 'forfeit' });
      expect(result.currentSeat).toBe(2);
      expect(result.roundScore).toBe(0);
      const row = await getTestPrisma().game.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.aiMoveCount).toBe(AI_MOVE_COUNT_CAP);
    });

    it('should reject a stale expectedVersion forfeit with VERSION_CONFLICT', async () => {
      const ownerId = await createTestUser('dave');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });
      await getTestPrisma().game.update({
        where: { id: created.id },
        data: { aiMoveCount: AI_MOVE_COUNT_CAP },
      });

      try {
        await aiTurnGame(created.id, ownerId, created.version + 1);
        expect.unreachable('aiTurnGame should have thrown');
      } catch (error) {
        expect((error as AppError).errorCode).toBe('VERSION_CONFLICT');
      }
    });

    it('should let a move that hits the cap boundary (the 50th) and wins finish rather than forfeit', async () => {
      const ownerId = await createTestUser('erin');
      const created = await createGame(ownerId, { targetScore: 10, mode: 'ai', aiSeat: 1 });
      await getTestPrisma().game.update({
        where: { id: created.id },
        data: { aiMoveCount: AI_MOVE_COUNT_CAP - 1, roundScore: 15 }, // heuristic: wins by holding
      });

      const result = await aiTurnGame(created.id, ownerId, created.version);

      expect(result.status).toBe('finished');
      expect(result.winnerSeat).toBe(1);
      const row = await getTestPrisma().game.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.aiMoveCount).toBe(AI_MOVE_COUNT_CAP);
    });
  });

  describe('provider validation fallback (§9)', () => {
    it('should fall back to the heuristic when the provider reply fails schema validation', async () => {
      const ownerId = await createTestUser('frank');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });
      const provider: AiDecisionProvider = {
        decide: async () => ({ action: 'jump' }) as unknown as AiDecision,
      };

      const result = await aiTurnGame(created.id, ownerId, created.version, provider);

      // Fresh game (roundScore 0): the heuristic deterministically rolls.
      expect(result.lastMove?.kind).toBe('roll');
    });
  });

  describe('single-flight claim (I2)', () => {
    it('should call the provider at most once for two concurrent calls on the same (gameId, expectedVersion), and the loser refetches', async () => {
      const ownerId = await createTestUser('grace');
      const created = await createGame(ownerId, {
        targetScore: TARGET_SCORE,
        mode: 'ai',
        aiSeat: 1,
      });
      let providerCalled!: () => void;
      const providerCalledPromise = new Promise<void>((resolve) => {
        providerCalled = resolve;
      });
      const { provider, resolve, callCount } = hangingProvider(() => providerCalled());

      const callA = aiTurnGame(created.id, ownerId, created.version, provider);
      await providerCalledPromise; // A has claimed and invoked decide() before B arrives
      const callB = aiTurnGame(created.id, ownerId, created.version, provider);
      // Let B's own (real, DB-backed) read-and-claim sequence actually run before A
      // settles — otherwise resolving A immediately can race ahead of B's claimAiTurn
      // check, which is real I/O and doesn't complete on the same microtask tick.
      await new Promise((r) => setTimeout(r, 50));

      resolve({ action: 'roll' });
      const [resultA, resultB] = await Promise.all([callA, callB]);

      // The loser's refetch (§9) races the winner's commit in real time — it can land
      // just before or just after — so only the invariants that must hold regardless of
      // that ordering are asserted: exactly one provider call, exactly one committed move.
      expect(callCount()).toBe(1);
      expect(resultA.version).toBe(created.version + 1);
      expect(resultB.version).toBeLessThanOrEqual(resultA.version);
      const moveCount = await getTestPrisma().move.count({ where: { gameId: created.id } });
      expect(moveCount).toBe(1);
    });
  });

  describe('hung provider leak protection (I2)', () => {
    // Real timers deliberately, not vi.useFakeTimers() (unlike resolveAiDecision.test.ts,
    // which fakes AI_DEADLINE_MS in isolation with no I/O): this test's deadline wait
    // overlaps real Prisma transactions, and faking time out from under real DB I/O risks
    // a hang rather than a clean fast-forward. A real ~3s wait is slower but reliable.
    it(
      'should keep the claim held past the deadline heuristic fallback, and refuse a second request for the same move until the provider truly settles',
      async () => {
        const ownerId = await createTestUser('heidi');
        const created = await createGame(ownerId, {
          targetScore: TARGET_SCORE,
          mode: 'ai',
          aiSeat: 1,
        });
        const { provider, resolve, callCount } = hangingProvider();

        const resultA = await aiTurnGame(created.id, ownerId, created.version, provider);
        // heuristic fallback commits a move once the real AI_DEADLINE_MS elapses
        expect(resultA.version).toBe(created.version + 1);

        // B arrives for the SAME (gameId, expectedVersion) while A's underlying provider
        // call is still unsettled — must be refused the claim, not call the provider.
        const resultB = await aiTurnGame(created.id, ownerId, created.version, provider);
        expect(callCount()).toBe(1);
        expect(resultB.version).toBe(resultA.version);

        resolve({ action: 'roll' }); // real settlement — releases the claim/semaphore
      },
      AI_DEADLINE_MS + 5000,
    );
  });
});
