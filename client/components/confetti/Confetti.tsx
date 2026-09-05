import type { CSSProperties } from 'react';
import { useConfettiPieces } from '../../hooks/useConfettiPieces';
import './confetti.css';

interface ConfettiProps {
  active: boolean;
}

export function Confetti({ active }: ConfettiProps) {
  const pieces = useConfettiPieces(active);

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
