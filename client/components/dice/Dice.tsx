import { useDiceTumble } from '../../hooks/useDiceTumble';
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

// Hand-tuned so every face lands right-side-up when the cube stops — not derived from
// cube geometry, so don't try to "simplify" the turn counts.
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

export function Dice({ value, rolling }: DiceProps) {
  const tumbleFace = useDiceTumble({ value, rolling });

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
