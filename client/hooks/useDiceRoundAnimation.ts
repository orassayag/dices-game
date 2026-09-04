import { useEffect, useRef, useState } from 'react';
import type { GameStateDto } from '../../shared/index';
import type { DiceValue } from '../components/dice/Dice';

// A 6&6 bust briefly freezes the board so the player registers what happened before the
// turn passes (Extra 4) — long enough to read, short enough not to feel unresponsive.
const BUST_FREEZE_MS: number = 1200;

// Minimum time the dice spend visibly tumbling after Roll is clicked, so a fast server
// response doesn't skip straight to the result — the roll always reads as an animation.
const MIN_ROLL_ANIMATION_MS: number = 550;

// Must match dice.css's `.dice-cube` transition-duration (380ms) — once `rolling` flips
// false the cube still spends this long visually rotating from its last tumble face into
// its landed one. The round score must not reveal the new number until that rotation
// actually finishes, or the score changes while the dice are still visibly mid-roll.
const DICE_SETTLE_TRANSITION_MS: number = 380;

interface UseDiceRoundAnimationOptions {
  game: GameStateDto;
  busy: boolean;
  onRoll: () => void;
}

interface UseDiceRoundAnimationResult {
  frozen: boolean;
  rolling: boolean;
  displayDice: [DiceValue, DiceValue] | null;
  displayedRoundScore: number;
  scorePulseKey: number;
  handleRollClick: () => void;
}

/** Drives GameBoard's dice-tumble/round-score animation timing off the server's game
 * state — GameBoard consumes this and only renders the result. */
export function useDiceRoundAnimation({
  game,
  busy,
  onRoll,
}: UseDiceRoundAnimationOptions): UseDiceRoundAnimationResult {
  const [frozen, setFrozen] = useState<boolean>(false);
  const [rolling, setRolling] = useState<boolean>(false);
  const [scorePulseKey, setScorePulseKey] = useState<number>(0);
  const [displayDice, setDisplayDice] = useState<[DiceValue, DiceValue] | null>(null);
  const [displayedRoundScore, setDisplayedRoundScore] = useState<number>(game.roundScore);
  const rollStartedAtRef = useRef<number>(0);
  // Tracks whether the *previous* render had the dice tumbling, so the round-score effect
  // below can tell "a roll just landed" (roundScore may lag the dice by one more render
  // while `rolling` itself already flipped) apart from "roundScore changed for some other
  // reason" (a hold, an AI forfeit) — only the former needs the settle delay.
  const wasRollingRef = useRef<boolean>(false);

  // Gated on `rolling` (not just game.busted) so the bust ring/message never appear while
  // the dice are still tumbling — the server already knows the roll busted the instant the
  // response lands, but the warning must wait for the roll animation to finish landing on
  // 6 & 6 before it takes over the screen (Extra 4 / CSS polish #1).
  useEffect(() => {
    if (rolling || !game.busted) {
      setFrozen(false);
      return;
    }
    setFrozen(true);
    const timeoutId: number = window.setTimeout(() => setFrozen(false), BUST_FREEZE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game.version, game.busted, rolling]);

  // A new game (game.id change) starts the dice fresh; within one game the dice only
  // ever update on an actual roll (see below) — holding must leave them exactly as they
  // last landed (Extra 4), not reset to an idle pose.
  useEffect(() => {
    setDisplayDice(null);
    setDisplayedRoundScore(game.roundScore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  useEffect(() => {
    if (game.lastMove?.kind === 'roll') {
      setDisplayDice(game.lastMove.dice);
    }
  }, [game.lastMove]);

  // Keeps the displayed round score in sync with the server. Two distinct cases share this
  // effect: (1) a roll just finished (`rolling` transitioned true → false) — the number and
  // its pop-in (bumping scorePulseKey) must wait for DICE_SETTLE_TRANSITION_MS so they land
  // exactly when the dice finish their CSS settle-rotation, not the instant `rolling` flips;
  // (2) any other change (a hold, an AI forfeit) — no dice animation is playing, so the
  // number updates immediately with no pop-in.
  useEffect(() => {
    if (rolling) {
      wasRollingRef.current = true;
      return;
    }
    const justFinishedRolling: boolean = wasRollingRef.current;
    wasRollingRef.current = false;
    if (!justFinishedRolling) {
      setDisplayedRoundScore(game.roundScore);
      return;
    }
    const timeoutId: number = window.setTimeout(() => {
      setDisplayedRoundScore(game.roundScore);
      setScorePulseKey((key) => key + 1);
    }, DICE_SETTLE_TRANSITION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game.roundScore, rolling]);

  // The server already has the result by the time `busy` flips back to false; this only
  // holds the dice in their tumbling state for whatever's left of MIN_ROLL_ANIMATION_MS
  // so the animation doesn't get cut short on a fast response.
  useEffect(() => {
    if (busy || !rolling) {
      return;
    }
    const elapsedMs: number = Date.now() - rollStartedAtRef.current;
    const remainingMs: number = Math.max(0, MIN_ROLL_ANIMATION_MS - elapsedMs);
    const timeoutId: number = window.setTimeout(() => setRolling(false), remainingMs);
    return () => window.clearTimeout(timeoutId);
  }, [busy, rolling]);

  function handleRollClick(): void {
    rollStartedAtRef.current = Date.now();
    setRolling(true);
    onRoll();
  }

  return { frozen, rolling, displayDice, displayedRoundScore, scorePulseKey, handleRollClick };
}
