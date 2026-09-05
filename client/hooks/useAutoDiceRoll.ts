import { useEffect, useState } from 'react';
import type { DiceValue } from '../components/dice/Dice';

const DICE_VALUES: DiceValue[] = [1, 2, 3, 4, 5, 6];

const MIN_ROLL_GAP_MS: number = 5_000;
const MAX_ROLL_GAP_MS: number = 9_000;
const ROLL_ANIMATION_MS: number = 650;

const INITIAL_ROLL_MIN_DELAY_MS: number = 1_500;
const INITIAL_ROLL_MAX_DELAY_MS: number = 2_500;

function randomDiceValue(excludeValue: DiceValue): DiceValue {
  let nextValue: DiceValue;
  do {
    nextValue = DICE_VALUES[Math.floor(Math.random() * DICE_VALUES.length)] as DiceValue;
  } while (nextValue === excludeValue);
  return nextValue;
}

function randomGapMs(): number {
  return MIN_ROLL_GAP_MS + Math.random() * (MAX_ROLL_GAP_MS - MIN_ROLL_GAP_MS);
}

function randomInitialDelayMs(): number {
  return INITIAL_ROLL_MIN_DELAY_MS + Math.random() * (INITIAL_ROLL_MAX_DELAY_MS - INITIAL_ROLL_MIN_DELAY_MS);
}

interface UseAutoDiceRollResult {
  values: [DiceValue, DiceValue];
  rollingIndex: 0 | 1 | null;
}

export function useAutoDiceRoll(): UseAutoDiceRollResult {
  const [values, setValues] = useState<[DiceValue, DiceValue]>([4, 6]);
  const [rollingIndex, setRollingIndex] = useState<0 | 1 | null>(null);

  useEffect(() => {
    let gapTimeoutId: number;
    let settleTimeoutId: number;

    function scheduleNextRoll(delayMs: number): void {
      gapTimeoutId = window.setTimeout(() => {
        const dieIndex: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        setRollingIndex(dieIndex);
        settleTimeoutId = window.setTimeout(() => {
          setValues((current) => {
            const next: [DiceValue, DiceValue] = [...current];
            next[dieIndex] = randomDiceValue(current[dieIndex]);
            return next;
          });
          setRollingIndex(null);
          scheduleNextRoll(randomGapMs());
        }, ROLL_ANIMATION_MS);
      }, delayMs);
    }

    scheduleNextRoll(randomInitialDelayMs());
    return () => {
      window.clearTimeout(gapTimeoutId);
      window.clearTimeout(settleTimeoutId);
    };
  }, []);

  return { values, rollingIndex };
}
