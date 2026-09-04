import { Dices, RefreshCw, ShieldCheck } from 'lucide-react';
import type { GameStateDto } from '../../../shared/index';
import { Dice } from '../dice/Dice';
import { Button } from '../button/Button';
import { Confetti } from '../confetti/Confetti';
import { Leaderboard } from '../leaderboard/Leaderboard';
import { PlayerCard } from '../player-card/PlayerCard';
import {
  AI_PLAYER_NAME,
  resolveSeatDisplay,
  type PlayerIdentities,
} from '../../lib/playerAvatars';
import { useDiceRoundAnimation } from '../../hooks/useDiceRoundAnimation';
import './gameBoard.css';

// Cross-game win counts, owned by GamePage and keyed by fixed identity — never by
// "whichever seat is currently playing" — so a seat switching between its human and the AI
// (New Game modal) never reassigns one identity's wins to the other (bug: the human
// opponent's row was disappearing from the leaderboard, replaced by the AI's, the moment
// an AI game started, because both had shared the same seat-numbered win counter).
export interface WinCounts {
  seat1: number;
  seat2: number;
  ai: number;
}

interface GameBoardProps {
  game: GameStateDto;
  // Generated once per session by GamePage, not per game — must never be recomputed
  // here, or editing the New Game modal (which re-renders this component) would reshuffle
  // the avatars/names shown for a game still in progress.
  identities: PlayerIdentities;
  wins: WinCounts;
  // True once any game this session has ever had mode 'ai' — the AI's leaderboard row
  // appears from that point on and is never removed again (a player is never deleted from
  // the leaderboard), even after switching back to a human-vs-human game.
  aiHasPlayed: boolean;
  onRoll: () => void;
  onHold: () => void;
  onNewGame: () => void;
  busy: boolean;
  // True while the AI seat's move is delayed ("thinking") or in flight — shown as a
  // loading icon above that seat's "Player N" title (see GamePage's AI turn effect).
  aiThinking: boolean;
}

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
  aiHasPlayed,
  onRoll,
  onHold,
  onNewGame,
  busy,
  aiThinking,
}: GameBoardProps) {
  const { frozen, rolling, displayDice, displayedRoundScore, scorePulseKey, handleRollClick } =
    useDiceRoundAnimation({ game, busy, onRoll });

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
  // §4: the AI opponent's fixed name/avatar replace whichever seat it's currently
  // playing; `identities` itself is untouched, so switching that seat back to "Human"
  // (next New Game) shows the same player as before with no restore step needed.
  const seat1Display = resolveSeatDisplay(identities.seat1, game.mode === 'ai' && game.aiSeat === 1);
  const seat2Display = resolveSeatDisplay(identities.seat2, game.mode === 'ai' && game.aiSeat === 2);
  // The leaderboard tracks the two fixed human identities plus the AI, never "whichever
  // seat is live right now" — so it keeps identities.seat1/seat2's own names even while a
  // seat is currently AI-played, instead of seat1Display/seat2Display's live swap.
  const leaderboardEntries = [
    { id: 'seat1', name: identities.seat1.name, wins: wins.seat1 },
    { id: 'seat2', name: identities.seat2.name, wins: wins.seat2 },
    ...(aiHasPlayed ? [{ id: 'ai', name: AI_PLAYER_NAME, wins: wins.ai }] : []),
  ];

  return (
    <section
      className={`relative flex w-(--game-panel-width) min-w-[20rem] max-h-(--game-panel-height) flex-col gap-3 overflow-hidden rounded-2xl border border-border p-4 pt-14 text-foreground sm:p-6 sm:pt-16 ${
        frozen ? 'ring-2 ring-danger' : ''
      }`}
    >
      {/* CSS polish #3: the panel's own background, split into a seat-1/seat-2 half each.
          Whichever seat is currently on turn gets an accent tint over its half and the
          other half gets a distinct neutral shade, so the two halves read as two clearly
          different colors rather than "one tinted, one plain" — whose turn it is reads at
          a glance without having to read either PlayerCard. Both halves fall back to the
          same plain surface color while the game isn't active. Negative z-index keeps it
          beneath every other child while still painting above the section's (now
          transparent) own background; overflow-hidden on the section clips it to the
          rounded corners. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 flex">
        <div
          className={`h-full w-1/2 transition-colors duration-500 ${
            !showTurnHighlight ? 'bg-surface' : game.currentSeat === 1 ? 'bg-accent/25' : 'bg-surface-alt'
          }`}
        />
        <div
          className={`h-full w-1/2 transition-colors duration-500 ${
            !showTurnHighlight ? 'bg-surface' : game.currentSeat === 2 ? 'bg-accent/25' : 'bg-surface-alt'
          }`}
        />
      </div>

      <Confetti active={hasWinner} />

      {/* Pinned to the panel's own top-left corner, mirroring New Game's top-right
          placement — always visible, never competing with the round-score area below. */}
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
        <Leaderboard entries={leaderboardEntries} />
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

      <div className="mx-auto flex flex-col items-center justify-center gap-1 rounded-2xl bg-accent px-10 py-6 text-accent-foreground shadow-sm sm:px-14 sm:py-8">
        <span className="text-sm font-semibold uppercase tracking-wide opacity-80">Goal score</span>
        <span className="text-4xl font-extrabold sm:text-5xl">{game.targetScore}</span>
      </div>

      {hasWinner && (
        <p
          role="status"
          className="winner-fade-in text-center text-lg font-bold text-success sm:text-xl"
        >
          🏆🏆🏆 {game.winnerSeat === 1 ? seat1Display.name : seat2Display.name} wins!
          🏆🏆🏆
        </p>
      )}

      {/* Requirement: the dice sit between the two avatars at the same line height, not
          below the whole player row — one 3-column grid instead of a player-card row
          followed by a separate dice row. `items-center` vertically centers the shorter
          middle (dice) column against the taller PlayerCard columns, landing it level
          with the avatars rather than the names/scores above and below them. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <PlayerCard
          seatNumber={1}
          name={seat1Display.name}
          avatarSrc={seat1Display.avatarSrc}
          score={game.p1Score}
          isCurrentTurn={game.currentSeat === 1}
          isWinner={game.status === 'finished' && game.winnerSeat === 1}
          isThinking={aiThinking && game.aiSeat === 1}
        />

        <div
          className={`flex items-center justify-center gap-3 rounded-xl bg-surface-alt px-5 py-5 sm:gap-6 sm:px-8 sm:py-7 ${
            frozen ? 'outline outline-2 outline-danger' : ''
          }`}
        >
          <Dice value={displayDice ? displayDice[0] : null} rolling={rolling} />

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-medium tracking-wide whitespace-nowrap uppercase text-muted-foreground">
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

        <PlayerCard
          seatNumber={2}
          name={seat2Display.name}
          avatarSrc={seat2Display.avatarSrc}
          score={game.p2Score}
          isCurrentTurn={game.currentSeat === 2}
          isWinner={game.status === 'finished' && game.winnerSeat === 2}
          isThinking={aiThinking && game.aiSeat === 2}
        />
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
