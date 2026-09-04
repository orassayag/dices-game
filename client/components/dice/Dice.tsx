import { useEffect, useState } from 'react';
import './dice.css';

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

interface DiceProps {
  value: DiceValue | null;
  rolling: boolean;
}

type PipPosition = 'tl' | 'tm' | 'tr' | 'ml' | 'mm' | 'mr' | 'bl' | 'bm' | 'br';

const DICE_FACES: DiceValue[] = [1, 2, 3, 4, 5, 6];

const PIPS_BY_FACE: Record<DiceValue, PipPosition[]> = {
  1: ['mm'],
  2: ['tr', 'bl'],
  3: ['tr', 'mm', 'bl'],
  4: ['tl', 'tr', 'bl', 'br'],
  5: ['tl', 'tr', 'mm', 'bl', 'br'],
  6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
};

// Fixed per-face landing rotations, reused verbatim from the reference 3D-dice markup
// (dices-ref.txt) — each combination of whole turns was hand-tuned there so every face
// lands right-side-up when the cube stops; deriving them from cube geometry isn't needed.
const FACE_TRANSFORMS: Record<DiceValue, string> = {
  1: 'rotateX(1turn) rotateY(-3.5turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
  2: 'rotateX(2turn) rotateY(5.25turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
  3: 'rotateX(3.75turn) rotateY(3turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
  4: 'rotateX(5.25turn) rotateY(-1turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
  5: 'rotateX(7turn) rotateY(7.75turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
  6: 'rotateX(6turn) rotateY(2turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))',
};

const IDLE_TRANSFORM: string =
  'rotateX(8.5turn) rotateY(6turn) rotateZ(0) translateZ(calc(var(--dice-size) * -1))';

const ROLL_TICK_MS: number = 90;

function nextTumbleFace(current: DiceValue): DiceValue {
  return ((current % DICE_FACES.length) + 1) as DiceValue;
}

/** A single real 3D die. Cycles through faces while `rolling` to look like a tumble,
 * then settles on `value` once rolling stops (or shows an idle resting pose before the
 * first roll, when `value` is null). */
export function Dice({ value, rolling }: DiceProps) {
  const [tumbleFace, setTumbleFace] = useState<DiceValue>(value ?? 1);

  useEffect(() => {
    if (!rolling) {
      return;
    }
    const intervalId: number = window.setInterval(() => {
      setTumbleFace(nextTumbleFace);
    }, ROLL_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [rolling]);

  const restingTransform: string = value !== null ? FACE_TRANSFORMS[value] : IDLE_TRANSFORM;
  const transform: string = rolling ? FACE_TRANSFORMS[tumbleFace] : restingTransform;

  return (
    <div className="dice-scene" aria-hidden="true">
      <div className="dice-cube" data-rolling={rolling || undefined} style={{ transform }}>
        {DICE_FACES.map((face) => (
          <div key={face} className={`dice-face dice-face-${face}`}>
            {PIPS_BY_FACE[face].map((position) => (
              <span key={position} className={`dice-pip dice-pip-${position}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
