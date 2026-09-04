// Pure game rules (plan_v6.md §4). Every function here takes state in and returns an
// outcome out — no DB, no Express, no side effects. `roll`/`hold` take an injected
// `DiceRoller` rather than calling Math.random() directly, so the rules are testable
// without randomness and swappable for a deterministic sequence (§13).

export type Seat = 1 | 2;

export type DiceRoller = () => [number, number];

const DIE_FACE_MIN: number = 1;
const DIE_FACE_MAX: number = 6;
const BUST_FACE_VALUE: number = 6; // both dice showing this value busts the round

/** Validates a raw DB/request integer is actually 1 or 2 rather than blindly casting it. */
export function toSeat(value: number): Seat {
  if (value !== 1 && value !== 2) {
    throw new Error(`Expected a seat value of 1 or 2, got ${value}.`);
  }
  return value;
}

function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

export interface RollState {
  currentSeat: Seat;
  roundScore: number;
}

export interface RollOutcome {
  dice: [number, number];
  busted: boolean;
  nextRoundScore: number;
  nextCurrentSeat: Seat;
}

// Two dice via the injected roller; 6 & 6 busts (round score lost, seat passes),
// otherwise the round score accumulates and the seat stays (plan_v6.md §4).
export function roll(state: RollState, diceRoller: DiceRoller): RollOutcome {
  const dice = diceRoller();
  const busted = dice[0] === BUST_FACE_VALUE && dice[1] === BUST_FACE_VALUE;
  if (busted) {
    return {
      dice,
      busted: true,
      nextRoundScore: 0,
      nextCurrentSeat: otherSeat(state.currentSeat),
    };
  }
  return {
    dice,
    busted: false,
    nextRoundScore: state.roundScore + dice[0] + dice[1],
    nextCurrentSeat: state.currentSeat,
  };
}

export interface HoldState {
  currentSeat: Seat;
  roundScore: number;
  p1Score: number;
  p2Score: number;
  targetScore: number;
}

export interface HoldOutcome {
  seatTotal: number;
  nextRoundScore: 0;
  nextCurrentSeat: Seat;
  won: boolean;
}

// Banks the round score into the acting seat's total and always clears the round score
// (plan_v6.md §4). A won game keeps the winning seat as `currentSeat` — there is no next
// turn to pass it to; the persistence layer separately marks the game finished.
export function hold(state: HoldState): HoldOutcome {
  const priorSeatTotal = state.currentSeat === 1 ? state.p1Score : state.p2Score;
  const seatTotal = priorSeatTotal + state.roundScore;
  const won = seatTotal >= state.targetScore;
  return {
    seatTotal,
    nextRoundScore: 0,
    nextCurrentSeat: won ? state.currentSeat : otherSeat(state.currentSeat),
    won,
  };
}

// Standard mulberry32 PRNG — small, fast, and deterministic for a given 32-bit seed.
// Only used when DICE_SEED is set (§13); the constants below are the algorithm's own
// fixed mixing constants, not project-specific configuration.
function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return function random(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollOneDie(random: () => number): number {
  return Math.floor(random() * DIE_FACE_MAX) + DIE_FACE_MIN;
}

// Real dice (Math.random) unless a seed is supplied, in which case every call to the
// returned roller advances the same deterministic sequence — reproducible smoke runs
// and tests without depending on real randomness (§13).
export function createDiceRoller(seed?: number): DiceRoller {
  const random = seed === undefined ? Math.random : createSeededRandom(seed);
  return () => [rollOneDie(random), rollOneDie(random)];
}
