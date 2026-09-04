import { useEffect, useState, type FormEvent } from 'react';
import type { CreateGameInput, GameStateDto } from '../../../shared/index';
import { ApiError } from '../../api/apiClient';
import {
  aiTurnGame,
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
const DEFAULT_AI_SEAT: 1 | 2 = 2; // the human plays seat 1 by default when starting an AI game

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
  const [modeInput, setModeInput] = useState<'human' | 'ai'>('human');
  const [aiSeatInput, setAiSeatInput] = useState<1 | 2>(DEFAULT_AI_SEAT);
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

  // The AI seat plays itself (§9): whenever it becomes the AI's turn, call ai-turn once
  // and let the resulting state change re-trigger this effect — it stops on its own once
  // the seat passes (bust/hold), a forfeit hands the turn back, or the game ends. Gated
  // on `busy` so it never overlaps a human action or a previous ai-turn call in flight.
  useEffect(() => {
    if (!game || busy) {
      return;
    }
    if (game.status !== 'in_progress' || game.mode !== 'ai' || game.currentSeat !== game.aiSeat) {
      return;
    }
    void runAction(() => aiTurnGame(game.id, game.version));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, busy]);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runAction(async () => {
      const input: CreateGameInput =
        modeInput === 'ai'
          ? { targetScore: targetScoreInput, mode: 'ai', aiSeat: aiSeatInput }
          : { targetScore: targetScoreInput, mode: 'human' };
      const state = await createGame(input);
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
          <label className="flex flex-col gap-1 text-sm">
            Opponent
            <select
              value={modeInput}
              onChange={(event) => setModeInput(event.target.value === 'ai' ? 'ai' : 'human')}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
            >
              <option value="human">Human (play both seats)</option>
              <option value="ai">AI</option>
            </select>
          </label>
          {modeInput === 'ai' && (
            <label className="flex flex-col gap-1 text-sm">
              AI plays seat
              <select
                value={aiSeatInput}
                onChange={(event) => setAiSeatInput(event.target.value === '2' ? 2 : 1)}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
              >
                <option value={1}>Player 1</option>
                <option value={2}>Player 2</option>
              </select>
            </label>
          )}
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
