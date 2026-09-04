import { Dice } from '../dice/Dice';
import { useAutoDiceRoll } from '../../hooks/useAutoDiceRoll';

/** Two decorative dice above the login/register panel. There's no game yet at this
 * point — this only borrows the in-game `Dice` visuals to make the page feel alive.
 * The first roll starts within a couple of seconds of mount; every roll after that
 * lands on its own random schedule, one die at a time, with at least MIN_ROLL_GAP_MS
 * separating one settling and the next starting (§4). */
export function AutoDicePair() {
  const { values, rollingIndex } = useAutoDiceRoll();

  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      <Dice value={values[0]} rolling={rollingIndex === 0} />
      <Dice value={values[1]} rolling={rollingIndex === 1} />
    </div>
  );
}
