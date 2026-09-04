// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_DEADLINE_MS, resolveAiDecision } from '../resolveAiDecision.js';
import {
  LEGAL_AI_ACTIONS,
  type AiDecision,
  type AiDecisionContext,
  type AiDecisionProvider,
} from '../aiTypes.js';
import type { Logger } from '../../../lib/logger.js';

const context: AiDecisionContext = {
  targetScore: 100,
  currentSeat: 1,
  seatTotal: 0,
  roundScore: 0, // below both heuristic thresholds — heuristic result is deterministically 'roll'
  lastDice: [],
  legalActions: LEGAL_AI_ACTIONS,
};

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function hangingProvider(): AiDecisionProvider {
  return { decide: () => new Promise<AiDecision>(() => {}) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveAiDecision', () => {
  it('should run the heuristic directly, with no network attempt, when no provider is configured', async () => {
    const decide = vi.fn();
    const decision = await resolveAiDecision({ provider: null, context, gameId: 'g1' });

    expect(decision).toEqual({ action: 'roll' });
    expect(decide).not.toHaveBeenCalled();
  });

  it('should return the provider decision when it resolves in time with a valid shape', async () => {
    const provider: AiDecisionProvider = {
      decide: async () => ({ action: 'hold' }),
    };

    const decision = await resolveAiDecision({ provider, context, gameId: 'g1' });

    expect(decision).toEqual({ action: 'hold' });
  });

  it('should fall back to the heuristic and log a timeout warning when the provider hangs past the deadline', async () => {
    const logger = fakeLogger();
    const resultPromise = resolveAiDecision({
      provider: hangingProvider(),
      context,
      gameId: 'game-42',
      logger,
    });

    await vi.advanceTimersByTimeAsync(AI_DEADLINE_MS);
    const decision = await resultPromise;

    expect(decision).toEqual({ action: 'roll' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('deadline'),
      expect.objectContaining({ gameId: 'game-42', reason: 'ai_provider_timeout' }),
    );
  });

  it('should fall back to the heuristic and log when the provider reply fails schema validation', async () => {
    const logger = fakeLogger();
    const provider: AiDecisionProvider = {
      decide: async () => ({ action: 'jump' }) as unknown as AiDecision,
    };

    const decision = await resolveAiDecision({ provider, context, gameId: 'game-7', logger });

    expect(decision).toEqual({ action: 'roll' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('invalid decision'),
      expect.objectContaining({ gameId: 'game-7', reason: 'ai_provider_invalid_output' }),
    );
  });

  it('should call onProviderSettled only when the provider promise truly settles, not when the deadline race resolves', async () => {
    let resolveProvider!: (decision: AiDecision) => void;
    const provider: AiDecisionProvider = {
      decide: () =>
        new Promise<AiDecision>((resolve) => {
          resolveProvider = resolve;
        }),
    };
    const onProviderSettled = vi.fn();

    const resultPromise = resolveAiDecision({
      provider,
      context,
      gameId: 'game-9',
      onProviderSettled,
    });
    await vi.advanceTimersByTimeAsync(AI_DEADLINE_MS);
    const decision = await resultPromise;

    expect(decision).toEqual({ action: 'roll' });
    expect(onProviderSettled).not.toHaveBeenCalled();

    resolveProvider({ action: 'hold' });
    await vi.advanceTimersByTimeAsync(0);

    expect(onProviderSettled).toHaveBeenCalledTimes(1);
  });
});
