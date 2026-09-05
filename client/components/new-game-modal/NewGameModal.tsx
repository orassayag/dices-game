import { type FormEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../button/Button';

const TARGET_SCORE_MIN: number = 10;
const TARGET_SCORE_MAX: number = 1000;

interface NewGameModalProps {
  targetScore: number;
  mode: 'human' | 'ai';
  aiSeat: 1 | 2;
  onTargetScoreChange: (value: number) => void;
  onModeChange: (value: 'human' | 'ai') => void;
  onAiSeatChange: (value: 1 | 2) => void;
  onSubmit: () => void;
  // null means the modal cannot be dismissed — there is no in-progress game to cancel back to.
  onCancel: (() => void) | null;
  busy: boolean;
}

export function NewGameModal({
  targetScore,
  mode,
  aiSeat,
  onTargetScoreChange,
  onModeChange,
  onAiSeatChange,
  onSubmit,
  onCancel,
  busy,
}: NewGameModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  function blockNonPositiveKeys(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  }

  function handleTargetScoreChange(value: string): void {
    const parsed: number = Number(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }
    onTargetScoreChange(parsed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-game-modal-heading"
        onSubmit={handleSubmit}
        className="relative flex w-(--login-panel-width) min-w-[20rem] flex-col justify-center gap-4 rounded-2xl border border-border bg-surface p-8"
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="absolute top-4 right-4 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={20} aria-hidden="true" />
          </button>
        )}
        <h1 id="new-game-modal-heading" className="text-xl font-semibold">
          New Game
        </h1>
        <label className="flex flex-col gap-1 text-sm">
          Goal score
          <input
            type="number"
            value={targetScore}
            onChange={(event) => handleTargetScoreChange(event.target.value)}
            onKeyDown={blockNonPositiveKeys}
            min={TARGET_SCORE_MIN}
            max={TARGET_SCORE_MAX}
            spellCheck={false}
            required
            className="rounded-lg border border-border bg-surface-alt px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Opponent
          <select
            value={mode}
            onChange={(event) => onModeChange(event.target.value === 'ai' ? 'ai' : 'human')}
            className="cursor-pointer rounded-lg border border-border bg-surface-alt px-3 py-2"
          >
            <option value="human">Human (play both seats)</option>
            <option value="ai">AI</option>
          </select>
        </label>
        {mode === 'ai' && (
          <label className="flex flex-col gap-1 text-sm">
            AI plays seat
            <select
              value={aiSeat}
              onChange={(event) => onAiSeatChange(event.target.value === '2' ? 2 : 1)}
              className="cursor-pointer rounded-lg border border-border bg-surface-alt px-3 py-2"
            >
              <option value={1}>Player 1</option>
              <option value={2}>Player 2</option>
            </select>
          </label>
        )}
        <div className="flex gap-3">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={busy} className="flex-1">
            Let's Go!
          </Button>
        </div>
      </form>
    </div>
  );
}
