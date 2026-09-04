import { useEffect, useRef, useState } from 'react';
import { Dices, RefreshCw, ShieldCheck } from 'lucide-react';
import type { GameStateDto } from '../../../shared/index';
import { Dice, type DiceValue } from '../dice/Dice';
import { Button } from '../button/Button';
import { Confetti } from '../confetti/Confetti';
import { Leaderboard } from '../leaderboard/Leaderboard';
import { PlayerCard } from '../player-card/PlayerCard';
import type { PlayerIdentities } from '../../lib/playerAvatars';
import './gameBoard.css';

interface GameBoardProps {
  game: GameStateDto;
  // Generated once per session by GameScreen, not per game — must never be recomputed
  // here, or editing the New Game modal (which re-renders this component) would reshuffle
  // the avatars/names shown for a game still in progress.
  identities: PlayerIdentities;
  // Cross-game win counts, keyed by seat — owned by GameScreen (CSS polish #2: the
  // leaderboard now renders inside this panel instead of floating over the page).
  wins: Record<1 | 2, number>;
  onRoll: () => void;
  onHold: () => void;
  onNewGame: () => void;
  busy: boolean;
  // True while the AI seat's move is delayed ("thinking") or in flight — shown as a
  // loading icon above that seat's "Player N" title (see GameScreen's AI turn effect).
  aiThinking: boolean;
}

// A 6&6 bust briefly freezes the board so the player registers what happened before the
// turn passes (Extra 4) — long enough to read, short enough not to feel unresponsive.
const BUST_FREEZE_MS: number = 1200;

// Minimum time the dice spend visibly tumbling after Roll is clicked, so a fast server
// response doesn't skip straight to the result — the roll always reads as an animation.
const MIN_ROLL_ANIMATION_MS: number = 550;

/**
 * Describes the last move for the "what just happened" line. `game.lastMove` is `null`
 * only on a freshly created game, which shows no line at all (§7) — the caller must
 * never destructure it unconditionally. Rolls and holds are left out too: the
 * dice/round-score/player-score already show the result, and a bust already gets its
 * own banner below, so neither needs a text line.
 */
function describeLastMove(lastMove: GameStateDto['lastMove']): string | null {
  if (lastMove === null) {
    return null;
  }
  switch (lastMove.kind) {
    case 'roll':
    case 'hold':
      return null;
    case 'forfeit':
      return 'AI gave up its turn.';
  }
}

function AbandonedNotice({ game }: { game: GameStateDto }) {
  if (game.status !== 'abandoned') {
    return null;
  }
  return (
    <p role="status" className="text-center text-sm font-semibold text-warning">
      This game was abandoned.
    </p>
  );
}

export function GameBoard({
  game,
  identities,
  wins,
  onRoll,
  onHold,
  onNewGame,
  busy,
  aiThinking,
}: GameBoardProps) {
  const [frozen, setFrozen] = useState<boolean>(false);
  const [rolling, setRolling] = useState<boolean>(false);
  const [scorePulseKey, setScorePulseKey] = useState<number>(0);
  const [displayDice, setDisplayDice] = useState<[DiceValue, DiceValue] | null>(null);
  const [displayedRoundScore, setDisplayedRoundScore] = useState<number>(game.roundScore);
  const rollStartedAtRef = useRef<number>(0);
  const isFirstRollTransitionRef = useRef<boolean>(true);

  // Gated on `rolling` (not just game.busted) so the bust ring/message never appear while
  // the dice are still tumbling — the server already knows the roll busted the instant the
  // response lands, but the warning must wait for the roll animation to finish landing on
  // 6 & 6 before it takes over the screen (Extra 4 / CSS polish #1).
  useEffect(() => {
    if (rolling || !game.busted) {
      setFrozen(false);
      return;
    }
    setFrozen(true);
    const timeoutId: number = window.setTimeout(() => setFrozen(false), BUST_FREEZE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game.version, game.busted, rolling]);

  // A new game (game.id change) starts the dice fresh; within one game the dice only
  // ever update on an actual roll (see below) — holding must leave them exactly as they
  // last landed (Extra 4), not reset to an idle pose.
  useEffect(() => {
    setDisplayDice(null);
    setDisplayedRoundScore(game.roundScore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  useEffect(() => {
    if (game.lastMove?.kind === 'roll') {
      setDisplayDice(game.lastMove.dice);
    }
  }, [game.lastMove]);

  // Keeps the displayed round score in sync with the server for every change outside the
  // roll-animation flow (a hold, an AI forfeit) — while the dice are still tumbling the old
  // value stays on screen; the moment `rolling` flips false this fires in the same render
  // pass as the pop-key effect below, so the new number and its pop-in animation land
  // together instead of the number swapping in after the animation has already played.
  useEffect(() => {
    if (rolling) {
      return;
    }
    setDisplayedRoundScore(game.roundScore);
  }, [game.roundScore, rolling]);

  // The server already has the result by the time `busy` flips back to false; this only
  // holds the dice in their tumbling state for whatever's left of MIN_ROLL_ANIMATION_MS
  // so the animation doesn't get cut short on a fast response.
  useEffect(() => {
    if (busy || !rolling) {
      return;
    }
    const elapsedMs: number = Date.now() - rollStartedAtRef.current;
    const remainingMs: number = Math.max(0, MIN_ROLL_ANIMATION_MS - elapsedMs);
    const timeoutId: number = window.setTimeout(() => setRolling(false), remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [busy, rolling]);

  // Bumps a remount key on the round-score value the instant the dice finish tumbling, so
  // its pop-in animation (gameBoard.css) replays on every roll instead of firing once on
  // mount. Skips the very first (mount) transition, which isn't a completed roll. The sync
  // effect above updates displayedRoundScore on this same `rolling` change, so the
  // remounted span's pop-in animation plays showing the new number, not the stale one.
  useEffect(() => {
    if (isFirstRollTransitionRef.current) {
      isFirstRollTransitionRef.current = false;
      return;
    }
    if (rolling) {
      return;
    }
    setScorePulseKey((key) => key + 1);
  }, [rolling]);

  function handleRollClick(): void {
    rollStartedAtRef.current = Date.now();
    setRolling(true);
    onRoll();
  }

  const actionsDisabled = busy || frozen || rolling || game.status !== 'in_progress';
  // Holding before any roll this turn would bank nothing and just pass the turn — every
  // non-busting roll adds at least 2 (the lowest non-6&6 sum), so a round score of 0 means
  // the current player hasn't rolled yet.
  const holdDisabled = actionsDisabled || game.roundScore === 0;
  const hasWinner = game.status === 'finished' && game.winnerSeat !== null;
  const lastMoveMessage = describeLastMove(game.lastMove);
  // Only highlight a "current" half while the game can still be acted on — a finished
  // game's currentSeat is stale (whoever would've gone next) and shouldn't read as active.
  const showTurnHighlight = game.status === 'in_progress';

  return (
    <section
      className={`relative flex w-(--game-panel-width) min-w-[20rem] max-h-(--game-panel-height) flex-col gap-3 overflow-hidden rounded-2xl border border-border p-4 pt-14 text-foreground sm:p-6 sm:pt-16 ${
        frozen ? 'ring-2 ring-danger' : ''
      }`}
    >
      {/* CSS polish #3: the panel's own background, split into a seat-1/seat-2 half each —
          whichever seat is currently on turn gets an orange tint over its half, so whose
          turn it is reads at a glance without having to read either PlayerCard. Negative
          z-index keeps it beneath every other child while still painting above the
          section's (now transparent) own background; overflow-hidden on the section clips
          it to the rounded corners. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 flex">
        <div
          className={`h-full w-1/2 transition-colors duration-500 ${
            showTurnHighlight && game.currentSeat === 1 ? 'bg-accent/15' : 'bg-surface'
          }`}
        />
        <div
          className={`h-full w-1/2 transition-colors duration-500 ${
            showTurnHighlight && game.currentSeat === 2 ? 'bg-accent/15' : 'bg-surface'
          }`}
        />
      </div>

      <Confetti active={hasWinner} />

      {/* Pinned to the panel's own top-left corner, mirroring New Game's top-right
          placement — always visible, never competing with the round-score area below. */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
        <Leaderboard
          seat1={{ seatNumber: 1, name: identities.seat1.name, wins: wins[1] }}
          seat2={{ seatNumber: 2, name: identities.seat2.name, wins: wins[2] }}
        />
      </div>

      {/* Pinned to the panel's own top-right corner (not the dice row further down), so
          it never overlaps the round-score area on a narrow panel. */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <Button
          variant="secondary"
          onClick={onNewGame}
          className="shadow-sm"
          icon={<RefreshCw size={14} aria-hidden="true" />}
        >
          New Game
        </Button>
      </div>

      <div className="mx-auto flex flex-col items-center justify-center gap-1 rounded-2xl bg-accent px-6 py-4 text-accent-foreground shadow-sm sm:px-8 sm:py-5">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Goal score</span>
        <span className="text-2xl font-extrabold sm:text-3xl">{game.targetScore}</span>
      </div>

      {hasWinner && (
        <p role="status" className="text-center text-lg font-bold text-success sm:text-xl">
          🏆🏆🏆 {game.winnerSeat === 1 ? identities.seat1.name : identities.seat2.name} wins!
          🏆🏆🏆
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <PlayerCard
          seatNumber={1}
          name={identities.seat1.name}
          avatarImageId={identities.seat1.avatarImageId}
          score={game.p1Score}
          isCurrentTurn={game.currentSeat === 1}
          isWinner={game.status === 'finished' && game.winnerSeat === 1}
          isThinking={aiThinking && game.aiSeat === 1}
        />
        <PlayerCard
          seatNumber={2}
          name={identities.seat2.name}
          avatarImageId={identities.seat2.avatarImageId}
          score={game.p2Score}
          isCurrentTurn={game.currentSeat === 2}
          isWinner={game.status === 'finished' && game.winnerSeat === 2}
          isThinking={aiThinking && game.aiSeat === 2}
        />
      </div>

      <div
        className={`mx-auto flex w-full max-w-xs items-center justify-center gap-3 rounded-xl bg-surface-alt px-4 py-3 sm:max-w-sm sm:gap-5 sm:px-6 sm:py-4 ${
          frozen ? 'outline outline-2 outline-danger' : ''
        }`}
      >
        <Dice value={displayDice ? displayDice[0] : null} rolling={rolling} />

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Round score
          </span>
          <span
            key={scorePulseKey}
            className="round-score-value text-3xl font-black text-accent sm:text-4xl"
          >
            {displayedRoundScore}
          </span>
        </div>

        <Dice value={displayDice ? displayDice[1] : null} rolling={rolling} />
      </div>

      {lastMoveMessage && <p className="text-center text-sm">{lastMoveMessage}</p>}

      {frozen && (
        <p role="status" className="text-center text-sm font-semibold text-danger">
          Busted! Rolled 6 &amp; 6 — round score lost.
        </p>
      )}

      <AbandonedNotice game={game} />

      <div className="flex justify-center gap-4">
        <Button
          onClick={handleRollClick}
          disabled={actionsDisabled}
          icon={<Dices size={20} aria-hidden="true" />}
        >
          Roll
        </Button>
        <Button
          variant="secondary"
          onClick={onHold}
          disabled={holdDisabled}
          icon={<ShieldCheck size={20} aria-hidden="true" />}
        >
          Hold
        </Button>
      </div>
    </section>
  );
}
