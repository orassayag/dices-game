// The one place a Game row is narrowed down to exactly the AiDecisionContext fields a
// model is allowed to see — no token, username, raw row, or error detail crosses it.

import type { Game } from '@prisma/client';
import type { Seat } from '../../domain/gameEngine.js';
import { LEGAL_AI_ACTIONS, type AiDecisionContext, type Die } from './aiTypes.js';

function toDie(value: number): Die {
  if (value < 1 || value > 6) {
    throw new Error(`Expected a die face 1-6, got ${value}.`);
  }
  return value as Die;
}

function toLastDicePair(dice: number[]): [] | [Die, Die] {
  if (dice.length === 0) {
    return [];
  }
  const first = dice[0];
  const second = dice[1];
  if (first === undefined || second === undefined) {
    throw new Error(`Expected a two-element dice array, got ${dice.length} element(s).`);
  }
  return [toDie(first), toDie(second)];
}

export function buildAiDecisionContext(game: Game, actorSeat: Seat): AiDecisionContext {
  return {
    targetScore: game.targetScore,
    currentSeat: actorSeat,
    seatTotal: actorSeat === 1 ? game.p1Score : game.p2Score,
    roundScore: game.roundScore,
    lastDice: toLastDicePair(game.lastDice),
    legalActions: LEGAL_AI_ACTIONS,
  };
}
