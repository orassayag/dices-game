// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDiceRoller, hold, roll } from '../gameEngine.js';

function fixedRoller(a: number, b: number) {
  return (): [number, number] => [a, b];
}

describe('roll', () => {
  it('should bust and reset the round score when both dice show 6', () => {
    const outcome = roll({ currentSeat: 1, roundScore: 12 }, fixedRoller(6, 6));

    expect(outcome.busted).toBe(true);
    expect(outcome.dice).toEqual([6, 6]);
    expect(outcome.nextRoundScore).toBe(0);
  });

  it('should pass the seat to the other player on a bust', () => {
    const outcome = roll({ currentSeat: 1, roundScore: 0 }, fixedRoller(6, 6));
    expect(outcome.nextCurrentSeat).toBe(2);
  });

  it('should accumulate the round score on a non-bust roll and keep the same seat', () => {
    const outcome = roll({ currentSeat: 1, roundScore: 10 }, fixedRoller(3, 4));

    expect(outcome.busted).toBe(false);
    expect(outcome.nextRoundScore).toBe(17);
    expect(outcome.nextCurrentSeat).toBe(1);
  });

  it.each([
    [1, 6],
    [6, 1],
    [5, 5],
  ])('should not treat %i & %i as a bust (only 6 & 6 busts)', (a, b) => {
    const outcome = roll({ currentSeat: 1, roundScore: 0 }, fixedRoller(a, b));
    expect(outcome.busted).toBe(false);
  });
});

describe('hold', () => {
  it('should bank the round score into the acting seat total and reset the round score', () => {
    const outcome = hold({
      currentSeat: 1,
      roundScore: 15,
      p1Score: 20,
      p2Score: 0,
      targetScore: 100,
    });

    expect(outcome.seatTotal).toBe(35);
    expect(outcome.nextRoundScore).toBe(0);
    expect(outcome.won).toBe(false);
  });

  it('should pass the seat to the other player on a non-winning hold', () => {
    const outcome = hold({
      currentSeat: 2,
      roundScore: 5,
      p1Score: 0,
      p2Score: 0,
      targetScore: 100,
    });
    expect(outcome.nextCurrentSeat).toBe(1);
  });

  it('should set won and keep the acting seat current when the banked total reaches the target', () => {
    const outcome = hold({
      currentSeat: 2,
      roundScore: 30,
      p1Score: 0,
      p2Score: 75,
      targetScore: 100,
    });

    expect(outcome.won).toBe(true);
    expect(outcome.seatTotal).toBe(105);
    expect(outcome.nextCurrentSeat).toBe(2);
  });

  it('should bank exactly the round score for a seat starting at zero', () => {
    const outcome = hold({
      currentSeat: 1,
      roundScore: 8,
      p1Score: 0,
      p2Score: 0,
      targetScore: 100,
    });
    expect(outcome.seatTotal).toBe(8);
  });
});

describe('createDiceRoller', () => {
  it('should return dice values within 1-6 for the unseeded (Math.random-backed) roller', () => {
    const diceRoller = createDiceRoller();
    for (let i = 0; i < 50; i += 1) {
      const [a, b] = diceRoller();
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(6);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
    }
  });

  it('should be deterministic for a given seed', () => {
    const rollerA = createDiceRoller(42);
    const rollerB = createDiceRoller(42);

    expect([rollerA(), rollerA(), rollerA()]).toEqual([rollerB(), rollerB(), rollerB()]);
  });

  it('should produce different sequences for different seeds', () => {
    const rollerA = createDiceRoller(1);
    const rollerB = createDiceRoller(2);

    expect(rollerA()).not.toEqual(rollerB());
  });
});
