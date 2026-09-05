import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiceValue } from '../../components/dice/Dice';
import { useDiceTumble } from '../useDiceTumble';

describe('useDiceTumble', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should default to 1 when no value is given', () => {
    const { result } = renderHook(() => useDiceTumble({ value: null, rolling: false }));
    expect(result.current).toBe(1);
  });

  it('should start from the provided value', () => {
    const { result } = renderHook(() =>
      useDiceTumble({ value: 3 as DiceValue, rolling: false }),
    );
    expect(result.current).toBe(3);
  });

  it('should cycle faces while rolling and wrap past 6', () => {
    const { result } = renderHook(() =>
      useDiceTumble({ value: 6 as DiceValue, rolling: true }),
    );
    expect(result.current).toBe(6);

    act(() => vi.advanceTimersByTime(90));
    expect(result.current).toBe(1);

    act(() => vi.advanceTimersByTime(90));
    expect(result.current).toBe(2);
  });

  it('should not advance when not rolling', () => {
    const { result } = renderHook(() =>
      useDiceTumble({ value: 2 as DiceValue, rolling: false }),
    );
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(2);
  });
});
