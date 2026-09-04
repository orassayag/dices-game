import { useEffect, useRef, useState } from 'react';
import type { CreateGameInput, GameStateDto } from '../../../shared/index';
import { ApiError } from '../../api/apiClient';
import { logout } from '../../api/authApi';
import {
  aiTurnGame,
  createGame,
  holdGame,
  listInProgressGames,
  rollGame,
  type GameActionResult,
} from '../../api/gamesApi';
import { GameBoard, type WinCounts } from '../../components/game-board/GameBoard';
import { NewGameModal } from '../../components/new-game-modal/NewGameModal';
import { createLogger } from '../../lib/logger';
import { generatePlayerIdentities } from '../../lib/playerAvatars';
import { playWinSound } from '../../lib/sound';

const logger = createLogger('game-screen');

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface GameScreenProps {
  user: AuthenticatedUser;
  onSessionExpired: () => void;
  onLogout: () => void;
}

const DEFAULT_TARGET_SCORE: number = 100;
const DEFAULT_AI_SEAT: 1 | 2 = 2; // the human plays seat 1 by default when starting an AI game

// Pause before each automated AI move so it reads as "thinking" rather than instant —
// the loading icon above the AI's "Player N" title (PlayerCard) is shown for this whole
// window, not just the network round-trip.
const AI_TURN_THINK_DELAY_MS: number = 900;

// Shown behind the New Game modal before any game exists (requirement: the very first
// load should read as "already on the game screen, New Game already open" — not a bare
// modal floating over an empty page). Never sent to the server; the modal's overlay
// (z-50, full-viewport) sits on top and makes it visually inert, exactly like reopening
// New Game mid-game.
const PLACEHOLDER_GAME: GameStateDto = {
  id: '__placeholder__',
  mode: 'human',
  aiSeat: null,
  targetScore: DEFAULT_TARGET_SCORE,
  status: 'in_progress',
  currentSeat: 1,
  p1Score: 0,
  p2Score: 0,
  roundScore: 0,
  lastDice: [],
  winnerSeat: null,
  version: 0,
  lastMove: null,
  busted: false,
};

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function GameScreen({ user, onSessionExpired, onLogout }: GameScreenProps) {
  const [game, setGame] = useState<GameStateDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [showNewGameModal, setShowNewGameModal] = useState<boolean>(false);
  // True once the player has opened New Game from the in-game button at least once (as
  // opposed to the automatic modal shown on login). From that point on, opening New Game
  // must show the real board behind the modal instead of a reset-looking placeholder —
  // only submitting the modal ("Let's Go!") may actually change game state; Cancel/X must
  // return to exactly what was on screen before the click.
  const [midGameReopen, setMidGameReopen] = useState<boolean>(false);
  const [targetScoreInput, setTargetScoreInput] = useState<number>(DEFAULT_TARGET_SCORE);
  const [modeInput, setModeInput] = useState<'human' | 'ai'>('human');
  const [aiSeatInput, setAiSeatInput] = useState<1 | 2>(DEFAULT_AI_SEAT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState<boolean>(false);
  const [wins, setWins] = useState<WinCounts>({ seat1: 0, seat2: 0, ai: 0 });
  // Set once any game this session has ever had mode 'ai' and never reset back to false —
  // the AI's leaderboard row must never disappear again after it first appears (bug: it
  // was previously not tracked at all, so switching back to a human-vs-human game silently
  // dropped whichever seat the AI had been "borrowing" its win count from).
  const [aiHasPlayed, setAiHasPlayed] = useState<boolean>(false);
  // Guards the win-count/sound effect below against double-counting the same finished
  // game across re-renders (e.g. an unrelated state update re-running the effect).
  const countedWinGameIdsRef = useRef<Set<string>>(new Set());
  // Generated once per session (lazy initializer), not per game — the New Game modal must
  // never reshuffle who "Player 1"/"Player 2" look like (bug report: editing the goal
  // score was reshuffling avatars/names because they used to be regenerated per game.id).
  const [identities] = useState(() => generatePlayerIdentities());

  useEffect(() => {
    listInProgressGames()
      .then((games) => {
        const inProgressGame = games[0] ?? null;
        setGame(inProgressGame);
        // Every login/register opens the New Game modal (product requirement: never
        // silently resume straight to an old game's scores). If an in-progress game exists
        // it's still fetched and shown behind the modal — Cancel (available whenever a game
        // exists, same as the mid-game "New Game" button) lets the player return to it.
        setShowNewGameModal(true);
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

  async function runAction(action: () => Promise<GameActionResult>): Promise<boolean> {
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await action();
      setGame(result.state);
      if (result.versionConflictRecovered) {
        setInfoMessage('The game moved on — showing the latest state. Try again.');
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === 'UNAUTHORIZED') {
        onSessionExpired();
        return false;
      }
      if (error instanceof ApiError && error.errorCode === 'GAME_ABANDONED') {
        // §8: a GAME_ABANDONED response shows a distinct notice and reloads the
        // in-progress list — the abandon+create transaction (M3b) may already have a
        // fresh game waiting.
        setErrorMessage('This game was abandoned. Loading your latest game…');
        try {
          const games = await listInProgressGames();
          const inProgressGame = games[0] ?? null;
          setGame(inProgressGame);
          setShowNewGameModal(inProgressGame === null);
        } catch (reloadError) {
          setErrorMessage(friendlyErrorMessage(reloadError));
        }
        return false;
      }
      setErrorMessage(friendlyErrorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The AI seat plays itself (§9): whenever it becomes the AI's turn, wait
  // AI_TURN_THINK_DELAY_MS (so the move reads as "thinking" rather than instant, and the
  // loading icon on its PlayerCard has something to show), then call ai-turn once and let
  // the resulting state change re-trigger this effect — it stops on its own once the seat
  // passes (bust/hold), a forfeit hands the turn back, or the game ends. Gated on `busy` so
  // it never overlaps a human action or a previous ai-turn call in flight, and on
  // `showNewGameModal` so it can't keep auto-playing the game being replaced — without that
  // gate, an ai-turn response could resolve after the New Game modal already created a new
  // game and clobber it with the old game's state (bug report: selecting AI got "stuck"
  // showing the previous game).
  useEffect(() => {
    if (!game || busy || showNewGameModal) {
      return;
    }
    if (game.status !== 'in_progress' || game.mode !== 'ai' || game.currentSeat !== game.aiSeat) {
      setAiThinking(false);
      return;
    }
    setAiThinking(true);
    const timeoutId: number = window.setTimeout(() => {
      void runAction(() => aiTurnGame(game.id, game.version)).finally(() => setAiThinking(false));
    }, AI_TURN_THINK_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, busy, showNewGameModal]);

  // Tracks whether the AI has ever taken a seat this session — see the aiHasPlayed
  // declaration above for why this must never be un-set.
  useEffect(() => {
    if (game?.mode === 'ai') {
      setAiHasPlayed(true);
    }
  }, [game]);

  // Counts a win exactly once per finished game (guarded by countedWinGameIdsRef, since
  // `game` changes reference on every action and would otherwise re-fire this effect for
  // the same already-finished game) and plays the victory chime alongside it. Attributed by
  // fixed identity (seat1/seat2/ai), not by raw seat number, so a seat's win history stays
  // with whoever actually won it rather than following the seat when the AI takes it over.
  useEffect(() => {
    if (!game || game.status !== 'finished' || game.winnerSeat === null) {
      return;
    }
    if (countedWinGameIdsRef.current.has(game.id)) {
      return;
    }
    countedWinGameIdsRef.current.add(game.id);
    const winnerSeat: 1 | 2 = game.winnerSeat;
    const winnerIsAi: boolean = game.mode === 'ai' && winnerSeat === game.aiSeat;
    const winnerKey: keyof WinCounts = winnerIsAi ? 'ai' : winnerSeat === 1 ? 'seat1' : 'seat2';
    setWins((current) => ({ ...current, [winnerKey]: current[winnerKey] + 1 }));
    playWinSound();
  }, [game]);

  async function handleCreate(): Promise<void> {
    const succeeded = await runAction(async () => {
      const input: CreateGameInput =
        modeInput === 'ai'
          ? { targetScore: targetScoreInput, mode: 'ai', aiSeat: aiSeatInput }
          : { targetScore: targetScoreInput, mode: 'human' };
      const state = await createGame(input);
      return { state, versionConflictRecovered: false };
    });
    if (succeeded) {
      setShowNewGameModal(false);
    }
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

  // The server-side session cookie is httpOnly and cleared by /auth/logout — if that call
  // fails (e.g. the session already expired), the user still expects the click to leave
  // them logged out locally, so onLogout runs in `finally` rather than only on success.
  async function handleLogout(): Promise<void> {
    try {
      await logout();
    } catch (error) {
      logger.warn('Logout request failed; clearing local session anyway', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onLogout();
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-4 text-foreground sm:p-6">
      <div className="fixed top-4 left-4 z-40">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            Logout
          </button>
          <span aria-hidden="true">|</span>
          <span>{user.username}</span>
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      )}
      {infoMessage && <p className="text-sm text-warning">{infoMessage}</p>}

      {/* Assignment requirement: a player can start a new game at any time — GameBoard's
          New Game button opens the modal below instead of navigating to a separate
          screen; submitting it re-runs createGame, which abandons this game server-side
          (M3b abandon+create) before creating the new one. Renders even with no real game
          yet (PLACEHOLDER_GAME) so the New Game modal always opens over a board, never a
          bare page. The automatic login-time modal still shows PLACEHOLDER_GAME (0/0)
          behind it — even over an existing in-progress game — so the player never sees a
          previous game's scores before choosing to resume it. Once the player has opened
          New Game from the in-game button (midGameReopen), the real board stays visible
          and unchanged behind the modal instead: opening/cancelling New Game must never
          look like a reset — only submitting it ("Let's Go!") actually changes state. */}
      <GameBoard
        key={game?.id ?? 'placeholder'}
        game={showNewGameModal && !midGameReopen ? PLACEHOLDER_GAME : (game ?? PLACEHOLDER_GAME)}
        identities={identities}
        wins={wins}
        aiHasPlayed={aiHasPlayed}
        onRoll={() => void handleRoll()}
        onHold={() => void handleHold()}
        onNewGame={() => {
          setMidGameReopen(true);
          setShowNewGameModal(true);
        }}
        busy={busy}
        aiThinking={aiThinking}
      />

      {showNewGameModal && (
        <NewGameModal
          targetScore={targetScoreInput}
          mode={modeInput}
          aiSeat={aiSeatInput}
          onTargetScoreChange={setTargetScoreInput}
          onModeChange={setModeInput}
          onAiSeatChange={setAiSeatInput}
          onSubmit={() => void handleCreate()}
          onCancel={game ? () => setShowNewGameModal(false) : null}
          busy={busy}
        />
      )}
    </main>
  );
}
