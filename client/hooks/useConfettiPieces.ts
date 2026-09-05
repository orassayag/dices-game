import { useEffect, useState } from 'react';

export type ConfettiPiece =
  | {
      id: number;
      kind: 'shred';
      leftPercent: number;
      color: string;
      widthPx: number;
      delaySeconds: number;
      durationSeconds: number;
      driftPx: number;
      rotationDeg: number;
    }
  | {
      id: number;
      kind: 'icon';
      leftPercent: number;
      icon: string;
      fontSizePx: number;
      delaySeconds: number;
      durationSeconds: number;
      driftPx: number;
      rotationDeg: number;
    };

const CONFETTI_PIECE_COUNT: number = 140;
const CONFETTI_COLORS: string[] = ['#146ff5', '#dd1a8f', '#ee6f40', '#3adcc8', '#8154e2', '#f5a623'];
const CONFETTI_ICONS: string[] = ['💰', '💵', '🪙', '⭐', '🎉'];
const ICON_PIECE_RATIO: number = 0.25;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createPieces(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_PIECE_COUNT }, (_, index) => {
    const durationSeconds: number = randomBetween(2.6, 4.4);
    const sharedProps = {
      id: index,
      leftPercent: randomBetween(0, 100),
      // A negative animation-delay starts the piece already mid-fall instead of at the
      // top, so the first frame reads as an already-running rain rather than a
      // synchronized burst.
      delaySeconds: randomBetween(-durationSeconds, 0),
      durationSeconds,
      driftPx: randomBetween(-80, 80),
      rotationDeg: randomBetween(180, 720),
    };

    if (Math.random() < ICON_PIECE_RATIO) {
      return {
        ...sharedProps,
        kind: 'icon',
        icon: CONFETTI_ICONS[index % CONFETTI_ICONS.length] ?? '🎉',
        fontSizePx: randomBetween(16, 28),
      };
    }

    const widthPx: number = randomBetween(6, 14);
    return {
      ...sharedProps,
      kind: 'shred',
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? '#f5a623',
      widthPx,
    };
  });
}

export function useConfettiPieces(active: boolean): ConfettiPiece[] | null {
  const [pieces, setPieces] = useState<ConfettiPiece[] | null>(null);

  useEffect(() => {
    setPieces(active ? createPieces() : null);
  }, [active]);

  return pieces;
}
