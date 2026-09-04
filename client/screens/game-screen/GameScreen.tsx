import { useEffect, useState, type FormEvent } from 'react';
import type { GameStateDto } from '../../../shared/index';
import { ApiError } from '../../api/apiClient';
import {
  createGame,
  holdGame,
  listInProgressGames,
  rollGame,
  type GameActionResult,
} from '../../api/gamesApi';
import { GameBoard } from '../../components/game-board/GameBoard';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface GameScreenProps {
  user: AuthenticatedUser;
  onSessionExpired: () => void;
}

const DEFAULT_TARGET_SCORE: number = 100;
const TARGET_SCORE_MIN: number = 10;
const TARGET_SCORE_MAX: number = 1000;

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function GameScreen({ user, onSessionExpired }: GameScreenProps) {
  const [game, setGame] = useState<GameStateDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [targetScoreInput, setTargetScoreInput] = useState<number>(DEFAULT_TARGET_SCORE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    listInProgressGames()
      .then((games) => {
        setGame(games[0] ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
          onSessionExpired();
          return;
        }
        setErrorMessage(friendlyErrorMessage(error));
        setLoading(false);
      });
    // Runs once on mount only — re-fetching on every render would clobber in-flight
    // game state after roll/hold already updated it locally (lesson L003).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAction(action: () => Promise<GameActionResult>): Promise<void> {
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await action();
      setGame(result.state);
      if (result.versionConflictRecovered) {
        setInfoMessage('The game moved on — showing the latest state. Try again.');
      }
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
        onSessionExpired();
        return;
      }
      if (error instanceof ApiError && error.errorCode === 'GAME_ABANDONED') {
        // §8: a GAME_ABANDONED response shows a distinct notice and reloads the
        // in-progress list — the abandon+create transaction (M3b) may already have a
        // fresh game waiting.
        setErrorMessage('This game was abandoned. Loading your latest game…');
        try {
          const games = await listInProgressGames();
          setGame(games[0] ?? null);
        } catch (reloadError) {
          setErrorMessage(friendlyErrorMessage(reloadError));
        }
        return;
      }
      setErrorMessage(friendlyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // mode/aiSeat is hardcoded 'human' — that selector is deferred to stage 10 alongside
  // the AI opponent it configures; exposing it earlier would let a player create an AI
  // game with no working ai-turn endpoint yet.
  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runAction(async () => {
      const state = await createGame({ targetScore: targetScoreInput, mode: 'human' });
      return { state, versionConflictRecovered: false };
    });
  }

  async function handleRoll(): Promise<void> {
    if (!game) {
      return;
    }
    await runAction(() => rollGame(game.id, game.version));
  }

  async function handleHold(): Promise<void> {
    if (!game) {
      return;
    }
    await runAction(() => holdGame(game.id, game.version));
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-100">
      <p className="text-sm text-slate-400">Signed in as {user.username}</p>

      {errorMessage && (
        <p role="alert" className="text-sm text-red-400">
          {errorMessage}
        </p>
      )}
      {infoMessage && <p className="text-sm text-amber-400">{infoMessage}</p>}

      {game ? (
        <>
          <GameBoard
            game={game}
            onRoll={() => void handleRoll()}
            onHold={() => void handleHold()}
            busy={busy}
          />
          {/* Assignment requirement: a player can start a new game at any time —
              submitting the form below re-runs createGame, which abandons this game
              server-side (M3b abandon+create) before creating the new one. */}
          <button
            type="button"
            onClick={() => setGame(null)}
            className="text-sm text-slate-400 underline"
          >
            Start a new game
          </button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            void handleCreate(event);
          }}
          className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-slate-900 p-8"
        >
          <h1 className="text-xl font-semibold">Start a new game</h1>
          <label className="flex flex-col gap-1 text-sm">
            Target score
            <input
              type="number"
              value={targetScoreInput}
              onChange={(event) => setTargetScoreInput(Number(event.target.value))}
              min={TARGET_SCORE_MIN}
              max={TARGET_SCORE_MAX}
              required
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-indigo-600 px-3 py-2 font-medium disabled:opacity-50"
          >
            Start Game
          </button>
        </form>
      )}
    </main>
  );
}
