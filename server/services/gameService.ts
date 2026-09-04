// Game orchestration (plan_v6.md §5, §6, §7 — M3a happy path + M3b hardening). Routes
// call these; nothing here touches req/res. Roll/hold run inside a transaction with a
// row lock so `actorSeat` and the optimistic-concurrency check both read the same locked
// row; create runs abandon+create in one transaction so the owner is never left with no
// playable game (§7).

import { Prisma, type Move } from '@prisma/client';
import prisma from '../db.js';
import { env } from '../config/env.js';
import type { CreateGameInput, GameStateDto } from '../../shared/index.js';
import { createDiceRoller, hold, roll, toSeat, type DiceRoller } from '../domain/gameEngine.js';
import { assertActionGuard, assertReadGuard } from '../domain/gameGuards.js';
import { ConflictError } from '../lib/errors.js';
import { mapGameToDto } from '../lib/gameMapper.js';

// One process-wide roller: real (Math.random) unless DICE_SEED is set, in which case
// every roll in the process shares one deterministic sequence (§13). Routes never pass
// a roller explicitly; tests that need a specific outcome pass their own. Exported so
// server/services/ai/aiTurnService.ts (M5b) shares the same single sequence rather than
// instantiating a second seeded roller.
export const defaultDiceRoller: DiceRoller = createDiceRoller(env.diceSeed);

const UNIQUE_CONSTRAINT_VIOLATION_CODE: string = 'P2002';

// Exported as its own pure predicate (rather than inlined in the catch below) so it can
// be unit-tested directly against a constructed Prisma error, with no live DB connection
// or client mocking involved.
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
  );
}

// Abandon any existing live game for this owner, then create the new one, in one
// transaction (§7) — a create failure rolls the abandon back, so the owner is never left
// without a playable game. The `game_one_live_per_owner` partial unique index is the
// final concurrency guard for two near-simultaneous creates; the loser's violation is
// caught here and mapped to 409 GAME_CONFLICT rather than the generic 500 fallback.
export async function createGame(
  ownerUserId: string,
  input: CreateGameInput,
): Promise<GameStateDto> {
  try {
    const game = await prisma.$transaction(async (tx) => {
      await tx.game.updateMany({
        where: { ownerUserId, status: 'in_progress' },
        data: { status: 'abandoned', version: { increment: 1 } },
      });
      return await tx.game.create({
        data: {
          ownerUserId,
          mode: input.mode,
          aiSeat: input.aiSeat ?? null,
          targetScore: input.targetScore,
        },
      });
    });
    return mapGameToDto(game, null);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError('You already have a game in progress.', {
        errorCode: 'GAME_CONFLICT',
        error,
      });
    }
    throw error;
  }
}

async function findLatestMove(gameId: string): Promise<Move | null> {
  return await prisma.move.findFirst({ where: { gameId }, orderBy: { createdAt: 'desc' } });
}

// list-my-games (§5): the DB's one-live-game partial unique index already caps this at
// one row per owner — `limit` bounds the response shape rather than a genuinely large set.
export async function listInProgressGames(
  ownerUserId: string,
  limit: number,
): Promise<GameStateDto[]> {
  const games = await prisma.game.findMany({
    where: { ownerUserId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return await Promise.all(
    games.map(async (game) => mapGameToDto(game, await findLatestMove(game.id))),
  );
}

// Read guard only — applies regardless of status (§3), so an abandoned/finished game
// the caller owns still returns its full state.
export async function getGame(gameId: string, userId: string): Promise<GameStateDto> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  assertReadGuard(game, userId);
  const latestMove = await findLatestMove(gameId);
  return mapGameToDto(game, latestMove);
}

// Re-reads the row before assuming a plain version race (§6): if it was abandoned out
// from under this action (§7's abandon+create), that's a distinct, more specific signal
// than a generic conflict. A zero-row update can also mean the game finished in the
// meantime — that case still falls through to VERSION_CONFLICT, matching the reference
// implementation, since the client's own refetch-on-conflict recovery (§8) surfaces the
// real status either way. Exported so aiTurnService.ts (M5b)'s roll/hold/forfeit
// transactions reuse the identical zero-row mapping rather than a second copy of it.
export async function assertVersionMatched(
  tx: Prisma.TransactionClient,
  gameId: string,
  updatedCount: number,
): Promise<void> {
  if (updatedCount === 0) {
    const fresh = await tx.game.findUnique({ where: { id: gameId } });
    if (fresh?.status === 'abandoned') {
      throw new ConflictError('This game was abandoned before the action was applied.', {
        errorCode: 'GAME_ABANDONED',
      });
    }
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
    await assertVersionMatched(tx, gameId, updated.count);

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
    await assertVersionMatched(tx, gameId, updated.count);

    // Guarded one-time win credit (§6, Extra 1): only a human winner earns it. Currently
    // every holdGame caller is already guaranteed human by assertActionGuard (it rejects
    // the AI seat), but the explicit check documents intent and keeps this correct if
    // that guarantee ever changes. It's "guarded" against double-counting because a
    // repeat call on the same expectedVersion fails the version check above and never
    // reaches here.
    if (outcome.won && (game.mode === 'human' || actorSeat !== game.aiSeat)) {
      await tx.user.update({
        where: { id: game.ownerUserId },
        data: { wins: { increment: 1 } },
      });
    }

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
