import { useEffect, useRef, useState } from 'react';
import type { GameStateDto } from '../../shared/index';
import type { DiceValue } from '../components/dice/Dice';

const BUST_FREEZE_MS: number = 1200;

const MIN_ROLL_ANIMATION_MS: number = 550;

// Must match dice.css's `.dice-cube` transition-duration — changing one without the
// other desyncs the round-score reveal from when the dice actually finish settling.
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
  // Distinguishes "a roll just landed" from "roundScore changed for an unrelated reason"
  // (hold, AI forfeit) in the effect below, since roundScore can lag one render behind
  // `rolling` flipping false.
  const wasRollingRef = useRef<boolean>(false);

  useEffect(() => {
    if (rolling || !game.busted) {
      setFrozen(false);
      return;
    }
    setFrozen(true);
    const timeoutId: number = window.setTimeout(() => setFrozen(false), BUST_FREEZE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [game.version, game.busted, rolling]);

  useEffect(() => {
    setDisplayDice(null);
    setDisplayedRoundScore(game.roundScore);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on a new game
  }, [game.id]);

  useEffect(() => {
    if (game.lastMove?.kind === 'roll') {
      setDisplayDice(game.lastMove.dice);
    }
  }, [game.lastMove]);

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
