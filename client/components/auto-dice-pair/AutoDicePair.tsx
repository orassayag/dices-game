import { Dice } from '../dice/Dice';
import { useAutoDiceRoll } from '../../hooks/useAutoDiceRoll';

export function AutoDicePair() {
  const { values, rollingIndex } = useAutoDiceRoll();

  return (
    <div className="flex items-center justify-center gap-4" aria-hidden="true">
      <Dice value={values[0]} rolling={rollingIndex === 0} />
      <Dice value={values[1]} rolling={rollingIndex === 1} />
    </div>
  );
}
