import { Prisma, type Move } from '@prisma/client';
import prisma from '../db.js';
import { env } from '../config/env.js';
import { AI_PLAYER_NAME } from '../../shared/index.js';
import type { CreateGameInput, GameStateDto, LeaderboardEntryDto } from '../../shared/index.js';
import { createDiceRoller, hold, roll, toSeat, type DiceRoller } from '../domain/gameEngine.js';
import { assertActionGuard, assertReadGuard } from '../domain/gameGuards.js';
import { ConflictError } from '../lib/errors.js';
import { mapGameToDto } from '../lib/gameMapper.js';

// Process-wide singleton so a set DICE_SEED produces one deterministic sequence shared
// across every roll in the process, including server/services/ai/aiTurnService.ts.
export const defaultDiceRoller: DiceRoller = createDiceRoller(env.diceSeed);

const UNIQUE_CONSTRAINT_VIOLATION_CODE: string = 'P2002';

const DEFAULT_SEAT_1_NAME: string = 'Player 1';
const DEFAULT_SEAT_2_NAME: string = 'Player 2';

export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
  );
}

interface SeatNames {
  p1Name: string;
  p2Name: string;
}

// The AI seat's stored name is always forced to AI_PLAYER_NAME so every AI game credits
// the one shared AI row, regardless of what the client sent for that seat.
function resolveSeatNames(input: CreateGameInput): SeatNames {
  const names: SeatNames = {
    p1Name: input.p1Name ?? DEFAULT_SEAT_1_NAME,
    p2Name: input.p2Name ?? DEFAULT_SEAT_2_NAME,
  };
  if (input.mode === 'ai') {
    if (input.aiSeat === 1) {
      names.p1Name = AI_PLAYER_NAME;
    } else {
      names.p2Name = AI_PLAYER_NAME;
    }
  }
  return names;
}

// Ensures a leaderboard row exists (at zero wins) for every seat name the moment a game
// starts, so a player who has only played — not yet won — still appears. Never resets an
// existing row's win count. Deduped so a game with two identical names upserts once.
async function registerLeaderboardPlayers(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  names: SeatNames,
): Promise<void> {
  const distinctNames: string[] = [...new Set([names.p1Name, names.p2Name])];
  for (const name of distinctNames) {
    await tx.leaderboardPlayer.upsert({
      where: { ownerUserId_name: { ownerUserId, name } },
      create: { ownerUserId, name },
      update: {},
    });
  }
}

// Upsert rather than a bare update so a win is still credited even if the row was somehow
// never registered — the leaderboard can never miss a win.
export async function creditWin(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  winnerName: string,
): Promise<void> {
  await tx.leaderboardPlayer.upsert({
    where: { ownerUserId_name: { ownerUserId, name: winnerName } },
    create: { ownerUserId, name: winnerName, wins: 1 },
    update: { wins: { increment: 1 } },
  });
}

export async function getLeaderboard(ownerUserId: string): Promise<LeaderboardEntryDto[]> {
  const players = await prisma.leaderboardPlayer.findMany({
    where: { ownerUserId },
    orderBy: [{ wins: 'desc' }, { name: 'asc' }],
  });
  return players.map((player) => ({ name: player.name, wins: player.wins }));
}

const DEFAULT_STARTING_SEAT: number = 1;

// The player who won the most recent finished game takes the first turn of the next one;
// with no prior winner (first game ever) the default seat leads.
async function resolvePreviousWinnerSeat(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
): Promise<number> {
  const lastFinished = await tx.game.findFirst({
    where: { ownerUserId, status: 'finished', winnerSeat: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { winnerSeat: true },
  });
  return lastFinished?.winnerSeat ?? DEFAULT_STARTING_SEAT;
}

export async function createGame(
  ownerUserId: string,
  input: CreateGameInput,
): Promise<GameStateDto> {
  const seatNames = resolveSeatNames(input);
  try {
    const game = await prisma.$transaction(async (tx) => {
      await tx.game.updateMany({
        where: { ownerUserId, status: 'in_progress' },
        data: { status: 'abandoned', version: { increment: 1 } },
      });
      const startingSeat = await resolvePreviousWinnerSeat(tx, ownerUserId);
      const created = await tx.game.create({
        data: {
          ownerUserId,
          mode: input.mode,
          aiSeat: input.aiSeat ?? null,
          targetScore: input.targetScore,
          currentSeat: startingSeat,
          p1Name: seatNames.p1Name,
          p2Name: seatNames.p2Name,
        },
      });
      await registerLeaderboardPlayers(tx, ownerUserId, seatNames);
      return created;
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

    if (outcome.won) {
      const winnerName: string = actorSeat === 1 ? game.p1Name : game.p2Name;
      await creditWin(tx, game.ownerUserId, winnerName);
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
