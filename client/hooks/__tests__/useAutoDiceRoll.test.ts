import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDiceRoll } from '../useAutoDiceRoll';

describe('useAutoDiceRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should expose the initial dice values and no rolling die', () => {
    const { result } = renderHook(() => useAutoDiceRoll());
    expect(result.current.values).toEqual([4, 6]);
    expect(result.current.rollingIndex).toBeNull();
  });

  it('should mark a die rolling, then settle it to a new value', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useAutoDiceRoll());

    act(() => vi.advanceTimersByTime(1_500));
    expect(result.current.rollingIndex).toBe(0);

    act(() => vi.advanceTimersByTime(650));
    expect(result.current.rollingIndex).toBeNull();
    expect(result.current.values[0]).not.toBe(4);
  });

  it('should roll the second die when random selects it', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { result } = renderHook(() => useAutoDiceRoll());

    act(() => vi.advanceTimersByTime(2_500));
    expect(result.current.rollingIndex).toBe(1);
  });

  it('should clean up its timers on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const { unmount } = renderHook(() => useAutoDiceRoll());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
