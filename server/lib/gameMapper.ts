// Maps a Prisma Game row + its latest Move row to the API's GameStateDto, field by
// field — never `...game` spread (plan_v6.md §1). `lastMove` is derived from the most
// recent Move row rather than stored on Game; `busted` is in turn derived from
// `lastMove` by GameStateSchema's own transform (I6) — this mapper never sets it.

import type { Game, Move } from '@prisma/client';
import { GameStateSchema, type GameStateDto } from '../../shared/index.js';

type RawLastMove =
  { kind: 'roll'; dice: number[]; busted: boolean } | { kind: 'hold' } | { kind: 'forfeit' } | null;

function mapLastMove(move: Move | null | undefined): RawLastMove {
  if (!move) {
    return null;
  }
  if (move.kind === 'roll') {
    return { kind: 'roll', dice: move.dice, busted: move.busted };
  }
  if (move.kind === 'hold') {
    return { kind: 'hold' };
  }
  return { kind: 'forfeit' };
}

// `.parse` re-validates every field at runtime (numeric bounds, dice ranges, the
// mode/aiSeat pairing) even though the values came from our own DB — cheap defense in
// depth against a future write path that skips this mapper, and it's what derives the
// top-level `busted` field from `lastMove`.
export function mapGameToDto(game: Game, latestMove: Move | null | undefined): GameStateDto {
  return GameStateSchema.parse({
    id: game.id,
    mode: game.mode,
    aiSeat: game.aiSeat,
    targetScore: game.targetScore,
    status: game.status,
    currentSeat: game.currentSeat,
    p1Score: game.p1Score,
    p2Score: game.p2Score,
    roundScore: game.roundScore,
    lastDice: game.lastDice,
    winnerSeat: game.winnerSeat,
    version: game.version,
    lastMove: mapLastMove(latestMove),
  });
}
