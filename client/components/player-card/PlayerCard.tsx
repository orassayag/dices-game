import { useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { fallbackAvatarUrl } from '../../lib/playerAvatars';
import './playerCard.css';

interface PlayerCardProps {
  seatNumber: 1 | 2;
  name: string;
  // Resolved by the caller (GameBoard) via `resolveSeatDisplay` — either a pravatar.cc
  // photo URL or the fixed AI opponent avatar; this component doesn't know which.
  avatarSrc: string;
  score: number;
  isCurrentTurn: boolean;
  isWinner: boolean;
  // True while this seat is the AI and its move is delayed/in flight (GameBoard).
  isThinking: boolean;
}

/** One player's avatar, name, and score — used twice (seat 1 / seat 2) by GameBoard. */
export function PlayerCard({
  seatNumber,
  name,
  avatarSrc,
  score,
  isCurrentTurn,
  isWinner,
  isThinking,
}: PlayerCardProps) {
  const [avatarLoaded, setAvatarLoaded] = useState<boolean>(false);

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      {/* Fixed-height slot above the title, reserved whether or not the AI is currently
          thinking, so a seat flipping in/out of "thinking" never shifts the layout below. */}
      <div className="flex h-4 items-center justify-center">
        {isThinking && (
          <>
            <Loader2 size={16} aria-hidden="true" className="animate-spin text-accent" />
            <span className="sr-only">Player {seatNumber} (AI) is thinking…</span>
          </>
        )}
      </div>
      <p
        className={`text-sm font-semibold ${isCurrentTurn ? 'text-accent' : 'text-muted-foreground'}`}
      >
        Player {seatNumber}
      </p>
      {/* Fixed-height slot above the avatar, not an absolute overlay — the crown then
          sits on top of the avatar instead of covering part of the image, and both
          player cards stay the same height whether or not either shows one. */}
      <div className="flex h-8 items-center justify-center">
        {isWinner && (
          <Crown
            size={32}
            aria-hidden="true"
            className="winner-fade-in text-warning drop-shadow"
          />
        )}
      </div>
      {/* relative wrapper sized to match the avatar circle exactly, so the loading spinner
          overlay below sits inside it rather than needing its own size bookkeeping. */}
      <div className="relative size-20 sm:size-24">
        <img
          src={avatarSrc}
          alt={`Player ${seatNumber}'s avatar`}
          onLoad={() => setAvatarLoaded(true)}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = fallbackAvatarUrl(name);
            setAvatarLoaded(true);
          }}
          className={`size-full rounded-full object-cover transition-[box-shadow] duration-700 ease-out ${
            // The winner ring matches the crown's color (text-warning) so the two read as
            // one signal. A real "your turn" border reads clearly against both themes only
            // if it's literally white, not a token — same reasoning as the dice faces in
            // dice.css. Every other seat still gets the same white ring by default, so the
            // orange-on-turn switch is the only border color change happening.
            isWinner
              ? 'winner-avatar ring-4 ring-warning'
              : isCurrentTurn
                ? 'ring-4 ring-accent'
                : 'ring-4 ring-white'
          }`}
        />
        {/* Decorative only — not role="status": GameBoard's "Game over" banner is the one
            live status region per finished game, and the avatar's alt text on the <img>
            above already covers what a screen reader needs. */}
        {!avatarLoaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-full bg-surface-alt"
          >
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      {/* mt-8 mirrors the h-8 crown slot reserved above the avatar, so the name gets the
          same top margin from the avatar that the "Player N" title effectively has. */}
      <p
        className={`mt-8 text-sm ${isCurrentTurn ? 'font-semibold text-accent' : 'text-foreground'}`}
      >
        {name}
      </p>
      <p className={`text-3xl font-bold sm:text-4xl ${isCurrentTurn ? 'text-accent' : ''}`}>
        {score}
      </p>
      {/* Not a live region — GameBoard's own "Game over" banner is the single status
          announcement per finished game (only one `role="status"` should ever be live
          at once); this is just the per-card label reinforcing the same crown/ring. */}
      {isWinner && (
        <p className="winner-fade-in text-sm font-semibold text-success">Winner!</p>
      )}
    </div>
  );
}
