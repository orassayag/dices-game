// AI turn orchestration (plan_v6.md §9, M5b). Wires stage 9's primitives — the
// decision resolver and the single-flight/semaphore concurrency guards — into one
// committed move, applied through the same guarded-updateMany shape roll/hold use
// (server/services/gameService.ts). Structurally mirrors rollGame/holdGame rather than
// sharing a generic "applyMove" helper with them — this file's own established
// convention (rollGame and holdGame are already separate, un-shared functions).

import type { Game } from '@prisma/client';
import prisma from '../../db.js';
import type { GameStateDto } from '../../../shared/index.js';
import { hold, roll, toSeat, type DiceRoller, type Seat } from '../../domain/gameEngine.js';
import { assertAiTurnGuard } from '../../domain/gameGuards.js';
import { createLogger, type Logger } from '../../lib/logger.js';
import { mapGameToDto } from '../../lib/gameMapper.js';
import { assertVersionMatched, defaultDiceRoller, getGame } from '../gameService.js';
import type { AiDecision, AiDecisionProvider } from './aiTypes.js';
import { resolveAiDecision } from './resolveAiDecision.js';
import { aiProviderSemaphore, claimAiTurn, releaseAiTurnClaim } from './aiTurnConcurrency.js';
import { buildAiDecisionContext } from './buildAiDecisionContext.js';

// Hard cap on SUCCESSFUL AI moves (I1) — mirrors the DB CHECK
// game_ai_move_count_cap_check (aiMoveCount <= 50); the app-level check below exists so
// the 51st attempt forfeits cleanly instead of ever reaching that CHECK as a 500.
const AI_MOVE_COUNT_CAP: number = 50;

const defaultLogger: Logger = createLogger('ai-turn');

/** `game.aiSeat` is non-null whenever mode==='ai' (DB CHECK + assertAiTurnGuard already
 *  confirmed mode==='ai' before this is called) — this is a defensive narrowing, not a
 *  real user-reachable path, mirroring routes/games.ts's `requireUserId`. */
function requireAiSeat(game: Game): Seat {
  if (game.aiSeat === null) {
    throw new Error('NO_AI_SEAT_ON_AI_MODE_GAME — assertAiTurnGuard must run before this.');
  }
  return toSeat(game.aiSeat);
}

function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

// One committed AI roll — identical write shape to gameService.ts's rollGame, plus the
// aiMoveCount increment (I1). Never asserts a guard itself: the caller (aiTurnGame) has
// already re-confirmed the AI-turn precondition on the same locked read.
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

// One committed AI hold — identical write shape to holdGame, plus the aiMoveCount
// increment (I1). No win-credit branch: this path is only ever reached for the AI seat,
// and Extra 1's win counter is human-only by design (never conditional here).
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

// The cap hand-back (§9, I1/I4): same guarded updateMany shape as roll/hold, reused
// verbatim per the plan. Clears roundScore (I4 — the AI's accumulated round points are
// discarded, never banked to the human) and deliberately never increments aiMoveCount,
// so the counter — and the DB's `aiMoveCount <= 50` CHECK — can never be pushed to 51.
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

/**
 * Applies exactly one AI move for `gameId` (plan_v6.md §9). `provider` defaults to
 * `null` — this project's heuristic-only setup (stage 9's decision, the plan's Open
 * Questions item): the heuristic runs with zero network attempts. A real adapter can be
 * passed in later (or by tests, with a fake) with no change to this function.
 */
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
    // Loser path (§9, I2): refetch instead of computing an independent decision — one
    // committed AI move costs at most one provider call, hung or not.
    return await getGame(gameId, userId);
  }

  // Owns the release UNLESS a real provider call is in flight — then release is handed
  // off entirely to resolveAiDecision's onProviderSettled hook, which may fire well
  // after this function has already returned (a timed-out-but-still-running call, I2).
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
