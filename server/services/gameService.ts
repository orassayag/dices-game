// Game orchestration (plan_v6.md §5, §6 happy-path subset). Routes call these; nothing
// here touches req/res. Roll/hold run inside a transaction with a row lock so
// `actorSeat` and the optimistic-concurrency check both read the same locked row.
//
// Deferred to Stage 6 (M3b) per the stage plan's own split, NOT reimplemented here:
// abandon-existing-game-on-create (§7), the GAME_CONFLICT/one-live-game mapping, the
// GAME_ABANDONED distinction on a zero-row update (no abandon path exists yet, so a
// zero-row update here can only be a real version conflict or a finished game), and the
// guarded `User.wins` increment (Extra 1) on a winning hold.

import type { Move } from '@prisma/client';
import prisma from '../db.js';
import { env } from '../config/env.js';
import type { CreateGameInput, GameStateDto } from '../../shared/index.js';
import { createDiceRoller, hold, roll, toSeat, type DiceRoller } from '../domain/gameEngine.js';
import { assertActionGuard, assertReadGuard } from '../domain/gameGuards.js';
import { ConflictError } from '../lib/errors.js';
import { mapGameToDto } from '../lib/gameMapper.js';

// One process-wide roller: real (Math.random) unless DICE_SEED is set, in which case
// every roll in the process shares one deterministic sequence (§13). Routes never pass
// a roller explicitly; tests that need a specific outcome pass their own.
const defaultDiceRoller: DiceRoller = createDiceRoller(env.diceSeed);

export async function createGame(
  ownerUserId: string,
  input: CreateGameInput,
): Promise<GameStateDto> {
  const game = await prisma.game.create({
    data: {
      ownerUserId,
      mode: input.mode,
      aiSeat: input.aiSeat ?? null,
      targetScore: input.targetScore,
    },
  });
  return mapGameToDto(game, null);
}

async function findLatestMove(gameId: string): Promise<Move | null> {
  return await prisma.move.findFirst({ where: { gameId }, orderBy: { createdAt: 'desc' } });
}

// Read guard only — applies regardless of status (§3), so an abandoned/finished game
// the caller owns still returns its full state.
export async function getGame(gameId: string, userId: string): Promise<GameStateDto> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  assertReadGuard(game, userId);
  const latestMove = await findLatestMove(gameId);
  return mapGameToDto(game, latestMove);
}

function assertVersionMatched(updatedCount: number): void {
  if (updatedCount === 0) {
    throw new ConflictError('The game has moved on since your last known version.', {
      errorCode: 'VERSION_CONFLICT',
    });
  }
}

export async function rollGame(
  gameId: string,
  userId: string,
  expectedVersion: number,
  diceRoller: DiceRoller = defaultDiceRoller,
): Promise<GameStateDto> {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.game.findUnique({ where: { id: gameId } });
    assertActionGuard(game, userId);
    const actorSeat = toSeat(game.currentSeat);
    const outcome = roll({ currentSeat: actorSeat, roundScore: game.roundScore }, diceRoller);

    const updated = await tx.game.updateMany({
      where: { id: gameId, version: expectedVersion, status: 'in_progress' },
      data: {
        version: { increment: 1 },
        currentSeat: outcome.nextCurrentSeat,
        roundScore: outcome.nextRoundScore,
        lastDice: outcome.dice,
      },
    });
    assertVersionMatched(updated.count);

    await tx.move.create({
      data: {
        gameId,
        actorSeat,
        kind: 'roll',
        dice: outcome.dice,
        busted: outcome.busted,
        roundScore: outcome.nextRoundScore,
      },
    });
    const freshGame = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const latestMove = await tx.move.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
    });
    return mapGameToDto(freshGame, latestMove);
  });
}

export async function holdGame(
  gameId: string,
  userId: string,
  expectedVersion: number,
): Promise<GameStateDto> {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.game.findUnique({ where: { id: gameId } });
    assertActionGuard(game, userId);
    const actorSeat = toSeat(game.currentSeat);
    const outcome = hold({
      currentSeat: actorSeat,
      roundScore: game.roundScore,
      p1Score: game.p1Score,
      p2Score: game.p2Score,
      targetScore: game.targetScore,
    });

    const updated = await tx.game.updateMany({
      where: { id: gameId, version: expectedVersion, status: 'in_progress' },
      data: {
        version: { increment: 1 },
        currentSeat: outcome.nextCurrentSeat,
        roundScore: outcome.nextRoundScore,
        ...(actorSeat === 1 ? { p1Score: outcome.seatTotal } : { p2Score: outcome.seatTotal }),
        ...(outcome.won ? { status: 'finished' as const, winnerSeat: actorSeat } : {}),
      },
    });
    assertVersionMatched(updated.count);

    // lastDice deliberately NOT written here — the last roll stays visible (§5).
    await tx.move.create({
      data: {
        gameId,
        actorSeat,
        kind: 'hold',
        dice: game.lastDice,
        busted: false,
        roundScore: outcome.nextRoundScore,
      },
    });
    const freshGame = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const latestMove = await tx.move.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
    });
    return mapGameToDto(freshGame, latestMove);
  });
}
