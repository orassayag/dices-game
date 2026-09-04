import { useEffect, useState } from 'react';
import { Dice, type DiceValue } from '../dice/Dice';

const DICE_VALUES: DiceValue[] = [1, 2, 3, 4, 5, 6];

// §4: dice roll independently, never together — a random gap between rounds, centered on
// ~7s so the page reads as lively, with a spread either side so it never ticks on a
// metronomic exact interval.
const MIN_ROLL_GAP_MS: number = 5_000;
const MAX_ROLL_GAP_MS: number = 9_000;
const ROLL_ANIMATION_MS: number = 650;

// The very first roll uses its own, much shorter window — the page should feel alive
// almost immediately on login, not wait out a full steady-state gap before anything moves.
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

/** Two decorative dice above the login/register panel. There's no game yet at this
 * point — this only borrows the in-game `Dice` visuals to make the page feel alive.
 * The first roll starts within a couple of seconds of mount; every roll after that
 * lands on its own random schedule, one die at a time, with at least MIN_ROLL_GAP_MS
 * separating one settling and the next starting (§4). */
export function AutoDicePair() {
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

  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      <Dice value={values[0]} rolling={rollingIndex === 0} />
      <Dice value={values[1]} rolling={rollingIndex === 1} />
    </div>
  );
}
