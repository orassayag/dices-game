import { useEffect, useState } from 'react';
import type { GameStateDto } from '../../../shared/index';

interface GameBoardProps {
  game: GameStateDto;
  onRoll: () => void;
  onHold: () => void;
  busy: boolean;
}

// A 6&6 bust briefly freezes the board so the player registers what happened before the
// turn passes (Extra 4) — long enough to read, short enough not to feel unresponsive.
const BUST_FREEZE_MS: number = 1200;

/**
 * Describes the last move for the "what just happened" line. `game.lastMove` is `null`
 * only on a freshly created game — the caller must never destructure it unconditionally.
 */
function describeLastMove(lastMove: GameStateDto['lastMove']): string {
  if (lastMove === null) {
    return 'No moves yet.';
  }
  switch (lastMove.kind) {
    case 'roll':
      return `Rolled ${lastMove.dice[0]} & ${lastMove.dice[1]}${lastMove.busted ? ' — busted!' : ''}`;
    case 'hold':
      return 'Held — round score banked.';
    case 'forfeit':
      return 'AI gave up its turn.';
  }
}

function StatusNotice({ game }: { game: GameStateDto }) {
  if (game.status === 'finished') {
    return (
      <p role="status" className="text-center text-sm font-semibold text-emerald-400">
        Game over — Player {game.winnerSeat} wins!
      </p>
    );
  }
  if (game.status === 'abandoned') {
    return (
      <p role="status" className="text-center text-sm font-semibold text-amber-400">
        This game was abandoned.
      </p>
    );
  }
  return null;
}

export function GameBoard({ game, onRoll, onHold, busy }: GameBoardProps) {
  const [frozen, setFrozen] = useState<boolean>(false);

  useEffect(() => {
    if (!game.busted) {
      setFrozen(false);
      return;
    }
    setFrozen(true);
    const timeoutId: number = window.setTimeout(() => setFrozen(false), BUST_FREEZE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game.version, game.busted]);

  const actionsDisabled = busy || frozen || game.status !== 'in_progress';

  return (
    <section
      className={`flex w-full max-w-md flex-col gap-4 rounded-lg bg-slate-900 p-8 text-slate-100 ${
        frozen ? 'ring-2 ring-red-500' : ''
      }`}
    >
      <header className="flex justify-between text-sm text-slate-400">
        <span>FINAL SCORE: {game.targetScore}</span>
        <span>Status: {game.status}</span>
      </header>

      <div className="grid grid-cols-2 gap-4 text-center">
        <div
          className={`rounded p-2 ${game.currentSeat === 1 ? 'font-semibold text-indigo-400' : ''} ${
            game.winnerSeat === 1 ? 'bg-emerald-950 ring-2 ring-emerald-400' : ''
          }`}
        >
          <p className="text-sm text-slate-400">Player 1</p>
          <p className="text-2xl">{game.p1Score}</p>
        </div>
        <div
          className={`rounded p-2 ${game.currentSeat === 2 ? 'font-semibold text-indigo-400' : ''} ${
            game.winnerSeat === 2 ? 'bg-emerald-950 ring-2 ring-emerald-400' : ''
          }`}
        >
          <p className="text-sm text-slate-400">Player 2</p>
          <p className="text-2xl">{game.p2Score}</p>
        </div>
      </div>

      <p className="text-center text-sm text-slate-400">Round score: {game.roundScore}</p>

      <p className="text-center text-sm">{describeLastMove(game.lastMove)}</p>

      {frozen && (
        <p role="status" className="text-center text-sm font-semibold text-red-400">
          Busted! Rolled 6 &amp; 6 — round score lost.
        </p>
      )}

      <StatusNotice game={game} />

      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={onRoll}
          disabled={actionsDisabled}
          className="rounded bg-indigo-600 px-4 py-2 font-medium disabled:opacity-50"
        >
          Roll
        </button>
        <button
          type="button"
          onClick={onHold}
          disabled={actionsDisabled}
          className="rounded bg-slate-700 px-4 py-2 font-medium disabled:opacity-50"
        >
          Hold
        </button>
      </div>
    </section>
  );
}
