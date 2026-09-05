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

// Keyed by fixed identity, never by "whichever seat is currently playing" — a seat
// switching between its human and the AI must not reassign one identity's wins to another.
export interface WinCounts {
  seat1: number;
  seat2: number;
  ai: number;
}

interface GameBoardProps {
  game: GameStateDto;
  identities: PlayerIdentities;
  wins: WinCounts;
  aiHasPlayed: boolean;
  onRoll: () => void;
  onHold: () => void;
  onNewGame: () => void;
  busy: boolean;
  aiThinking: boolean;
}

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
  const holdDisabled = actionsDisabled || game.roundScore === 0;
  const hasWinner = game.status === 'finished' && game.winnerSeat !== null;
  const lastMoveMessage = describeLastMove(game.lastMove);
  const showTurnHighlight = game.status === 'in_progress';
  const seat1Display = resolveSeatDisplay(identities.seat1, game.mode === 'ai' && game.aiSeat === 1);
  const seat2Display = resolveSeatDisplay(identities.seat2, game.mode === 'ai' && game.aiSeat === 2);
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

      <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
        <Leaderboard entries={leaderboardEntries} />
      </div>

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
