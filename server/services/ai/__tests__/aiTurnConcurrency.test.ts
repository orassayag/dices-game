// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiProviderSemaphore, claimAiTurn, releaseAiTurnClaim } from '../aiTurnConcurrency.js';
import { resolveAiDecision } from '../resolveAiDecision.js';
import {
  LEGAL_AI_ACTIONS,
  type AiDecision,
  type AiDecisionContext,
  type AiDecisionProvider,
} from '../aiTypes.js';

const context: AiDecisionContext = {
  targetScore: 100,
  currentSeat: 1,
  seatTotal: 0,
  roundScore: 0,
  lastDice: [],
  legalActions: LEGAL_AI_ACTIONS,
};

describe('claimAiTurn / releaseAiTurnClaim', () => {
  it('should acquire a fresh (gameId, expectedVersion) claim', () => {
    expect(claimAiTurn('claim-game-1', 3)).toBe('acquired');
  });

  it('should report a second claim on the same (gameId, expectedVersion) as already in progress', () => {
    expect(claimAiTurn('claim-game-2', 5)).toBe('acquired');
    expect(claimAiTurn('claim-game-2', 5)).toBe('alreadyInProgress');
  });

  it('should treat a different expectedVersion on the same game as an independent claim', () => {
    expect(claimAiTurn('claim-game-3', 1)).toBe('acquired');
    expect(claimAiTurn('claim-game-3', 2)).toBe('acquired');
  });

  it('should allow reacquiring a claim after it is released', () => {
    expect(claimAiTurn('claim-game-4', 1)).toBe('acquired');
    releaseAiTurnClaim('claim-game-4', 1);
    expect(claimAiTurn('claim-game-4', 1)).toBe('acquired');
  });
});

describe('AiProviderSemaphore', () => {
  it('should let acquires through immediately up to the configured limit', async () => {
    const semaphore = new AiProviderSemaphore(2);
    await semaphore.acquire();
    await semaphore.acquire();
    expect(semaphore.inFlightCount).toBe(2);
  });

  it('should queue an acquire past the limit until a release frees a slot', async () => {
    const semaphore = new AiProviderSemaphore(1);
    await semaphore.acquire();

    let queuedAcquireResolved = false;
    const queuedAcquire = semaphore.acquire().then(() => {
      queuedAcquireResolved = true;
    });

    await Promise.resolve(); // let any already-resolved microtasks settle
    expect(queuedAcquireResolved).toBe(false);

    semaphore.release();
    await queuedAcquire;

    expect(queuedAcquireResolved).toBe(true);
    expect(semaphore.inFlightCount).toBe(1);
  });
});

// Proves a hung call can never let a second request for the same move acquire the claim
// and start a second provider call: the claim is taken before the provider call starts,
// and both the claim and the semaphore slot release only when the provider promise
// truly settles.
describe('single-flight + semaphore composed with resolveAiDecision (I2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should keep the claim held past the deadline heuristic fallback, and only release it on real settlement', async () => {
    const gameId = 'composed-game-1';
    const expectedVersion: number = 4;
    const semaphore = new AiProviderSemaphore(1);

    let resolveProvider!: (decision: AiDecision) => void;
    const provider: AiDecisionProvider = {
      decide: () =>
        new Promise<AiDecision>((resolve) => {
          resolveProvider = resolve;
        }),
    };

    expect(claimAiTurn(gameId, expectedVersion)).toBe('acquired');
    await semaphore.acquire();

    const decisionPromise = resolveAiDecision({
      provider,
      context,
      gameId,
      onProviderSettled: () => {
        releaseAiTurnClaim(gameId, expectedVersion);
        semaphore.release();
      },
    });

    await vi.advanceTimersByTimeAsync(3000);
    const heuristicDecision = await decisionPromise;
    expect(heuristicDecision).toEqual({ action: 'roll' });

    // The deadline already resolved the caller's decision, but the provider call is
    // still unsettled — a second request for the SAME move must still be refused.
    expect(claimAiTurn(gameId, expectedVersion)).toBe('alreadyInProgress');
    expect(semaphore.inFlightCount).toBe(1);

    resolveProvider({ action: 'hold' });
    await vi.advanceTimersByTimeAsync(0);

    expect(claimAiTurn(gameId, expectedVersion)).toBe('acquired');
    expect(semaphore.inFlightCount).toBe(0);
  });
});
