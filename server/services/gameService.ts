import { Prisma, type Move } from '@prisma/client';
import prisma from '../db.js';
import { env } from '../config/env.js';
import type { CreateGameInput, GameStateDto } from '../../shared/index.js';
import { createDiceRoller, hold, roll, toSeat, type DiceRoller } from '../domain/gameEngine.js';
import { assertActionGuard, assertReadGuard } from '../domain/gameGuards.js';
import { ConflictError } from '../lib/errors.js';
import { mapGameToDto } from '../lib/gameMapper.js';

// Process-wide singleton so a set DICE_SEED produces one deterministic sequence shared
// across every roll in the process, including server/services/ai/aiTurnService.ts.
export const defaultDiceRoller: DiceRoller = createDiceRoller(env.diceSeed);

const UNIQUE_CONSTRAINT_VIOLATION_CODE: string = 'P2002';

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
  );
}

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
    // A unique-constraint violation here can only be the DB's game_one_live_per_owner
    // partial index catching a concurrent create — map it to the domain-specific conflict.
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

export async function getGame(gameId: string, userId: string): Promise<GameStateDto> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  assertReadGuard(game, userId);
  const latestMove = await findLatestMove(gameId);
  return mapGameToDto(game, latestMove);
}

export async function assertVersionMatched(
  tx: Prisma.TransactionClient,
  gameId: string,
  updatedCount: number,
): Promise<void> {
  if (updatedCount === 0) {
    // A zero-row update is ambiguous (stale version vs. the row being abandoned out from
    // under this action) — re-read to tell the two apart and map each to its own error code.
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

    // Redundant with assertActionGuard (already rejects the AI seat) but kept explicit so
    // a win never credits the AI if that guarantee ever changes.
    if (outcome.won && (game.mode === 'human' || actorSeat !== game.aiSeat)) {
      await tx.user.update({
        where: { id: game.ownerUserId },
        data: { wins: { increment: 1 } },
      });
    }

    // lastDice deliberately left unchanged so the last roll stays visible after holding.
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
