import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateDto } from '../../../shared/index';
import { useDiceRoundAnimation } from '../useDiceRoundAnimation';

function makeGame(overrides: Partial<GameStateDto> = {}): GameStateDto {
  return {
    id: 'game-1',
    mode: 'human',
    aiSeat: null,
    targetScore: 100,
    status: 'in_progress',
    currentSeat: 1,
    p1Score: 0,
    p2Score: 0,
    roundScore: 0,
    lastDice: [],
    winnerSeat: null,
    version: 1,
    lastMove: null,
    busted: false,
    ...overrides,
  };
}

describe('useDiceRoundAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call onRoll and start rolling on a roll click', () => {
    const onRoll = vi.fn();
    const game = makeGame();
    const { result } = renderHook(() => useDiceRoundAnimation({ game, busy: false, onRoll }));

    act(() => result.current.handleRollClick());
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(result.current.rolling).toBe(true);
  });

  it('should reveal the round score and pulse after a roll settles', () => {
    const onRoll = vi.fn();
    const { result, rerender } = renderHook(
      ({ game, busy }) => useDiceRoundAnimation({ game, busy, onRoll }),
      { initialProps: { game: makeGame(), busy: true } },
    );

    act(() => result.current.handleRollClick());
    expect(result.current.rolling).toBe(true);

    rerender({ game: makeGame({ roundScore: 7, version: 2 }), busy: false });
    act(() => vi.advanceTimersByTime(550));
    expect(result.current.rolling).toBe(false);

    act(() => vi.advanceTimersByTime(380));
    expect(result.current.displayedRoundScore).toBe(7);
    expect(result.current.scorePulseKey).toBe(1);
  });

  it('should freeze on a bust and unfreeze after the freeze window', () => {
    const game = makeGame({ busted: true, version: 3 });
    const { result } = renderHook(() =>
      useDiceRoundAnimation({ game, busy: false, onRoll: vi.fn() }),
    );

    expect(result.current.frozen).toBe(true);
    act(() => vi.advanceTimersByTime(1200));
    expect(result.current.frozen).toBe(false);
  });

  it('should display the dice from a roll move', () => {
    const game = makeGame({ lastMove: { kind: 'roll', dice: [2, 5], busted: false } });
    const { result } = renderHook(() =>
      useDiceRoundAnimation({ game, busy: false, onRoll: vi.fn() }),
    );
    expect(result.current.displayDice).toEqual([2, 5]);
  });

  it('should reset dice and round score on a new game id', () => {
    const { result, rerender } = renderHook(
      ({ game }) => useDiceRoundAnimation({ game, busy: false, onRoll: vi.fn() }),
      { initialProps: { game: makeGame({ lastMove: { kind: 'roll', dice: [2, 5], busted: false } }) } },
    );
    expect(result.current.displayDice).toEqual([2, 5]);

    rerender({ game: makeGame({ id: 'game-2', roundScore: 3 }) });
    expect(result.current.displayDice).toBeNull();
    expect(result.current.displayedRoundScore).toBe(3);
  });
});
