import { useState } from 'react';
import { Crown, Loader2 } from 'lucide-react';
import { fallbackAvatarUrl } from '../../lib/playerAvatars';
import './playerCard.css';

interface PlayerCardProps {
  seatNumber: 1 | 2;
  name: string;
  avatarSrc: string;
  score: number;
  isCurrentTurn: boolean;
  isWinner: boolean;
  isThinking: boolean;
}

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
      <div className="flex h-8 items-center justify-center">
        {isWinner && (
          <Crown
            size={32}
            aria-hidden="true"
            className="winner-fade-in text-warning drop-shadow"
          />
        )}
      </div>
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
            // Literally white, not a token, so it reads clearly against both themes —
            // same reasoning as the dice faces in dice.css.
            isWinner
              ? 'winner-avatar ring-4 ring-warning'
              : isCurrentTurn
                ? 'ring-4 ring-accent'
                : 'ring-4 ring-white'
          }`}
        />
        {!avatarLoaded && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center rounded-full bg-surface-alt"
          >
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <p
        className={`mt-8 text-sm ${isCurrentTurn ? 'font-semibold text-accent' : 'text-foreground'}`}
      >
        {name}
      </p>
      <p className={`text-3xl font-bold sm:text-4xl ${isCurrentTurn ? 'text-accent' : ''}`}>
        {score}
      </p>
      {isWinner && (
        <p className="winner-fade-in text-sm font-semibold text-success">Winner!</p>
      )}
    </div>
  );
}
