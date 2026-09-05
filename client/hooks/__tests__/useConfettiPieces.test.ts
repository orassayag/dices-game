import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConfettiPieces } from '../useConfettiPieces';

describe('useConfettiPieces', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when inactive', () => {
    const { result } = renderHook(() => useConfettiPieces(false));
    expect(result.current).toBeNull();
  });

  it('should generate pieces when active', () => {
    const { result } = renderHook(() => useConfettiPieces(true));
    expect(result.current).not.toBeNull();
    expect(result.current!.length).toBe(140);
    expect(result.current!.every((piece) => piece.kind === 'shred' || piece.kind === 'icon')).toBe(
      true,
    );
  });

  it('should produce icon pieces when random is below the icon ratio', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const { result } = renderHook(() => useConfettiPieces(true));
    expect(result.current!.every((piece) => piece.kind === 'icon')).toBe(true);
  });

  it('should produce shred pieces when random is above the icon ratio', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const { result } = renderHook(() => useConfettiPieces(true));
    expect(result.current!.every((piece) => piece.kind === 'shred')).toBe(true);
  });

  it('should clear pieces when toggled back to inactive', () => {
    const { result, rerender } = renderHook(({ active }) => useConfettiPieces(active), {
      initialProps: { active: true },
    });
    expect(result.current).not.toBeNull();

    rerender({ active: false });
    expect(result.current).toBeNull();
  });
});
