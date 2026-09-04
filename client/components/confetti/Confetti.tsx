import { useEffect, useState, type CSSProperties } from 'react';
import './confetti.css';

interface ConfettiProps {
  active: boolean;
}

type ConfettiPiece =
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

// Colors and fall-physics adapted from confety.txt's reference confetti effect; the
// coin/dollar-bill pieces from that reference are approximated here as emoji glyphs
// mixed in with the colored shreds, rather than reproducing its per-element SCSS/SVG.
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
      // top — spread across the whole duration, this makes the very first frame look
      // like an already-running rain rather than a synchronized burst. Combined with
      // `animation-iteration-count: infinite` (confetti.css) each piece loops forever on
      // its own, so the effect never needs to be regenerated/replaced — the old
      // regenerate-on-interval approach swapped the whole piece array every 2.6s, which
      // unmounted every still-falling piece and made the effect visibly stop and restart.
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

/** Confetti shown continuously while `active` is true (a win) and cleared the moment it
 * flips back to false (the player starts a new game) — each piece loops forever via CSS
 * (`animation-iteration-count: infinite` in confetti.css) rather than being regenerated
 * on a timer, so the effect never visibly stops and restarts. Renders as a
 * viewport-fixed overlay so it displays over the game panel regardless of where this
 * component sits in the tree. */
export function Confetti({ active }: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[] | null>(null);

  useEffect(() => {
    setPieces(active ? createPieces() : null);
  }, [active]);

  if (!pieces) {
    return null;
  }

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((piece) => {
        const style = {
          left: `${piece.leftPercent}%`,
          animationDelay: `${piece.delaySeconds}s`,
          animationDuration: `${piece.durationSeconds}s`,
          '--confetti-drift': `${piece.driftPx}px`,
          '--confetti-rotation': `${piece.rotationDeg}deg`,
        } as CSSProperties;

        if (piece.kind === 'icon') {
          return (
            <span
              key={piece.id}
              className="confetti-piece confetti-icon"
              style={{ ...style, fontSize: `${piece.fontSizePx}px` }}
            >
              {piece.icon}
            </span>
          );
        }

        return (
          <span
            key={piece.id}
            className="confetti-piece confetti-shred"
            style={{
              ...style,
              backgroundColor: piece.color,
              width: `${piece.widthPx}px`,
              height: `${piece.widthPx * 0.4}px`,
            }}
          />
        );
      })}
    </div>
  );
}
