import { useEffect, useState } from 'react';
import { Dice, type DiceValue } from '../dice/Dice';

const DICE_VALUES: DiceValue[] = [1, 2, 3, 4, 5, 6];

// §4: dice roll independently, never together — a random gap between rounds, floored at
// 10s so the page never feels busy, with a further random spread on top for "several
// seconds" of variance rather than a metronomic exact-10s tick.
const MIN_ROLL_GAP_MS: number = 10_000;
const MAX_ROLL_GAP_MS: number = 16_000;
const ROLL_ANIMATION_MS: number = 650;

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

/** Two decorative dice above the login/register panel. There's no game yet at this
 * point — this only borrows the in-game `Dice` visuals to make the page feel alive.
 * Each die rolls to a new face on its own random schedule; only one tumbles at a time
 * and at least MIN_ROLL_GAP_MS separates one settling and the next starting (§4). */
export function AutoDicePair() {
  const [values, setValues] = useState<[DiceValue, DiceValue]>([4, 6]);
  const [rollingIndex, setRollingIndex] = useState<0 | 1 | null>(null);

  useEffect(() => {
    let gapTimeoutId: number;
    let settleTimeoutId: number;

    function scheduleNextRoll(): void {
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
          scheduleNextRoll();
        }, ROLL_ANIMATION_MS);
      }, randomGapMs());
    }

    scheduleNextRoll();
    return () => {
      window.clearTimeout(gapTimeoutId);
      window.clearTimeout(settleTimeoutId);
    };
  }, []);

  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      <Dice value={values[0]} rolling={rollingIndex === 0} />
      <Dice value={values[1]} rolling={rollingIndex === 1} />
    </div>
  );
}
