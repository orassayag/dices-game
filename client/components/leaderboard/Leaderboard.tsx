import { Trophy } from 'lucide-react';

// Each row is absolutely positioned and slid to its rank via translateY — must match the
// row's actual rendered height (padding + line height) or rows would overlap/gap on reorder.
const LEADERBOARD_ROW_HEIGHT_PX: number = 44;
const LEADERBOARD_REORDER_TRANSITION_MS: number = 500;

export interface LeaderboardEntry {
  id: string;
  name: string;
  wins: number;
}

interface LeaderboardProps {
  // Every entry that has ever taken a seat this session — a fixed set of stable `id`s
  // (never seat numbers alone), so a row is never dropped just because a different
  // opponent (e.g. the AI) currently occupies that seat in the live game.
  entries: LeaderboardEntry[];
}

/** Fixed top-left win-count table. Ranks by win count (ties keep each entry's original
 * position, via `Array#sort`'s stability) and animates a row sliding to its new rank via a
 * `translateY` transition — rows stay mounted across a reorder instead of being remounted
 * in new DOM positions, which is what makes the position swap animate. Entries are never
 * removed once shown (see LeaderboardProps) — the caller controls the set that's passed. */
export function Leaderboard({ entries }: LeaderboardProps) {
  const ranked: LeaderboardEntry[] = [...entries].sort((a, b) => b.wins - a.wins);
  // A tied lead has no single leader to crown — showing the crown on one of several equal
  // scores would misrepresent the standings.
  const topWins: number = ranked[0]?.wins ?? 0;
  const isTiedLead: boolean = ranked.filter((entry) => entry.wins === topWins).length > 1;

  return (
    <div className="w-48 rounded-xl border border-border bg-surface/95 shadow-sm sm:w-56">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Leaderboard
      </p>
      <div className="relative" style={{ height: LEADERBOARD_ROW_HEIGHT_PX * entries.length }}>
        {entries.map((entry) => {
          const rank: number = ranked.findIndex((rankedEntry) => rankedEntry.id === entry.id);
          return (
            <div
              key={entry.id}
              className="absolute inset-x-0 flex items-center gap-2 px-3 transition-transform ease-out"
              style={{
                height: LEADERBOARD_ROW_HEIGHT_PX,
                transform: `translateY(${rank * LEADERBOARD_ROW_HEIGHT_PX}px)`,
                transitionDuration: `${LEADERBOARD_REORDER_TRANSITION_MS}ms`,
              }}
            >
              <span
                aria-hidden="true"
                className="w-4 shrink-0 text-center text-xs text-muted-foreground"
              >
                {rank + 1}
              </span>
              <span className="flex flex-1 items-center gap-1 truncate text-sm font-medium">
                <span className="truncate">{entry.name}</span>
                {rank === 0 && !isTiedLead && (
                  <Trophy size={14} aria-hidden="true" className="shrink-0 text-warning" />
                )}
              </span>
              <span className="text-sm font-bold text-accent">{entry.wins}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
