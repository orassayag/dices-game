import { useEffect, useState } from 'react';
import type { DiceValue } from '../components/dice/Dice';

const DICE_FACE_COUNT: number = 6;
const ROLL_TICK_MS: number = 90;

function nextTumbleFace(current: DiceValue): DiceValue {
  return ((current % DICE_FACE_COUNT) + 1) as DiceValue;
}

interface UseDiceTumbleOptions {
  value: DiceValue | null;
  rolling: boolean;
}

export function useDiceTumble({ value, rolling }: UseDiceTumbleOptions): DiceValue {
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

  return tumbleFace;
}
