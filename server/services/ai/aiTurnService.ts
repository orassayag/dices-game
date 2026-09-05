import type { Game } from '@prisma/client';
import prisma from '../../db.js';
import type { GameStateDto } from '../../../shared/index.js';
import { hold, roll, toSeat, type DiceRoller, type Seat } from '../../domain/gameEngine.js';
import { assertAiTurnGuard } from '../../domain/gameGuards.js';
import { createLogger, type Logger } from '../../lib/logger.js';
import { mapGameToDto } from '../../lib/gameMapper.js';
import { assertVersionMatched, creditWin, defaultDiceRoller, getGame } from '../gameService.js';
import type { AiDecision, AiDecisionProvider } from './aiTypes.js';
import { resolveAiDecision } from './resolveAiDecision.js';
import { aiProviderSemaphore, claimAiTurn, releaseAiTurnClaim } from './aiTurnConcurrency.js';
import { buildAiDecisionContext } from './buildAiDecisionContext.js';

// Mirrors the DB CHECK game_ai_move_count_cap_check (aiMoveCount <= 50) so the 51st
// attempt forfeits cleanly here instead of ever hitting that CHECK as a 500.
const AI_MOVE_COUNT_CAP: number = 50;

const defaultLogger: Logger = createLogger('ai-turn');

function requireAiSeat(game: Game): Seat {
  if (game.aiSeat === null) {
    throw new Error('NO_AI_SEAT_ON_AI_MODE_GAME — assertAiTurnGuard must run before this.');
  }
  return toSeat(game.aiSeat);
}

function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

async function aiRollMove(
  gameId: string,
  expectedVersion: number,
  diceRoller: DiceRoller,
): Promise<GameStateDto> {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const actorSeat = toSeat(game.currentSeat);
    const outcome = roll({ currentSeat: actorSeat, roundScore: game.roundScore }, diceRoller);

    const updated = await tx.game.updateMany({
      where: { id: gameId, version: expectedVersion, status: 'in_progress' },
      data: {
        version: { increment: 1 },
        currentSeat: outcome.nextCurrentSeat,
        roundScore: outcome.nextRoundScore,
        lastDice: outcome.dice,
        aiMoveCount: { increment: 1 },
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

// This path is only ever reached for the AI seat, so a win here credits the AI's own
// leaderboard row (the seat's stored name is AI_PLAYER_NAME).
async function aiHoldMove(gameId: string, expectedVersion: number): Promise<GameStateDto> {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
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
        aiMoveCount: { increment: 1 },
      },
    });
    await assertVersionMatched(tx, gameId, updated.count);

    if (outcome.won) {
      const winnerName: string = actorSeat === 1 ? game.p1Name : game.p2Name;
      await creditWin(tx, game.ownerUserId, winnerName);
    }

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

// Clears roundScore (the AI's accumulated round points are discarded, never banked to
// the human) and deliberately never increments aiMoveCount, so the DB's
// `aiMoveCount <= 50` CHECK can never be pushed to 51.
async function forfeitAiTurn(gameId: string, expectedVersion: number): Promise<GameStateDto> {
  return await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const aiSeat = requireAiSeat(game);
    const humanSeat = otherSeat(aiSeat);

    const updated = await tx.game.updateMany({
      where: { id: gameId, version: expectedVersion, status: 'in_progress' },
      data: {
        version: { increment: 1 },
        currentSeat: humanSeat,
        roundScore: 0,
      },
    });
    await assertVersionMatched(tx, gameId, updated.count);

    await tx.move.create({
      data: { gameId, actorSeat: aiSeat, kind: 'forfeit', roundScore: 0 },
    });
    const freshGame = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const latestMove = await tx.move.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
    });
    return mapGameToDto(freshGame, latestMove);
  });
}

export async function aiTurnGame(
  gameId: string,
  userId: string,
  expectedVersion: number,
  provider: AiDecisionProvider | null = null,
  diceRoller: DiceRoller = defaultDiceRoller,
  logger: Logger = defaultLogger,
): Promise<GameStateDto> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  assertAiTurnGuard(game, userId);
  const actorSeat = requireAiSeat(game);

  const claim = claimAiTurn(gameId, expectedVersion);
  if (claim === 'alreadyInProgress') {
    // Refetch instead of computing an independent decision: one committed AI move costs
    // at most one provider call, hung or not.
    return await getGame(gameId, userId);
  }

  // False unless a real provider call is in flight, in which case releasing the claim is
  // handed off to resolveAiDecision's onProviderSettled hook — which may fire well after
  // this function has already returned (a timed-out-but-still-running call).
  let releaseOwnedByHook: boolean = false;
  try {
    if (game.aiMoveCount >= AI_MOVE_COUNT_CAP) {
      logger.info('AI move-count cap reached; forfeiting the turn to the human seat', {
        gameId,
        aiMoveCount: game.aiMoveCount,
      });
      return await forfeitAiTurn(gameId, expectedVersion);
    }

    const context = buildAiDecisionContext(game, actorSeat);
    let decision: AiDecision;
    if (provider === null) {
      decision = await resolveAiDecision({ provider: null, context, gameId, logger });
    } else {
      await aiProviderSemaphore.acquire();
      releaseOwnedByHook = true;
      decision = await resolveAiDecision({
        provider,
        context,
        gameId,
        logger,
        onProviderSettled: () => {
          releaseAiTurnClaim(gameId, expectedVersion);
          aiProviderSemaphore.release();
        },
      });
    }

    if (decision.action === 'roll') {
      return await aiRollMove(gameId, expectedVersion, diceRoller);
    }
    return await aiHoldMove(gameId, expectedVersion);
  } finally {
    if (!releaseOwnedByHook) {
      releaseAiTurnClaim(gameId, expectedVersion);
    }
  }
}
