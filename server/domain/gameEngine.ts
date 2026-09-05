export type Seat = 1 | 2;

export type DiceRoller = () => [number, number];

const DIE_FACE_MIN: number = 1;
const DIE_FACE_MAX: number = 6;
const BUST_FACE_VALUE: number = 6;

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

// A won game keeps the winning seat as `currentSeat` — there is no next turn to pass it
// to; the persistence layer separately marks the game finished.
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

// Standard mulberry32 PRNG — the constants below are the algorithm's own fixed mixing
// constants, not project-specific configuration.
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

export function createDiceRoller(seed?: number): DiceRoller {
  const random = seed === undefined ? Math.random : createSeededRandom(seed);
  return () => [rollOneDie(random), rollOneDie(random)];
}
