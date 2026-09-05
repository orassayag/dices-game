import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playWinSound } from '../sound';

function makeFakeAudioContext() {
  const close = vi.fn().mockResolvedValue(undefined);
  const gainNode = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const oscillator = {
    type: '',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const instance = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn().mockReturnValue(oscillator),
    createGain: vi.fn().mockReturnValue(gainNode),
    close,
  };
  return { instance, close, oscillator };
}

describe('playWinSound', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should no-op when no AudioContext is available', () => {
    vi.stubGlobal('AudioContext', undefined);
    const win = window as unknown as { webkitAudioContext?: unknown };
    const original = win.webkitAudioContext;
    win.webkitAudioContext = undefined;

    expect(() => playWinSound()).not.toThrow();

    win.webkitAudioContext = original;
  });

  it('should create one oscillator per note and close the context after the chime', () => {
    const { instance, close } = makeFakeAudioContext();
    const ctor = vi.fn().mockReturnValue(instance);
    vi.stubGlobal('AudioContext', ctor);

    playWinSound();

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instance.createOscillator).toHaveBeenCalledTimes(4);
    expect(close).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('should fall back to webkitAudioContext when AudioContext is absent', () => {
    const { instance } = makeFakeAudioContext();
    vi.stubGlobal('AudioContext', undefined);
    const ctor = vi.fn().mockReturnValue(instance);
    const win = window as unknown as { webkitAudioContext?: unknown };
    const original = win.webkitAudioContext;
    win.webkitAudioContext = ctor;

    playWinSound();
    expect(ctor).toHaveBeenCalledTimes(1);

    win.webkitAudioContext = original;
  });
});
