// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  AuthCredentialsInputSchema,
  AuthResponseSchema,
  CreateGameInputSchema,
  ExpectedVersionSchema,
  GameStateSchema,
  ListGamesQuerySchema,
} from '../schemas';

function buildGameState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'game-1',
    mode: 'human',
    aiSeat: null,
    targetScore: 100,
    status: 'in_progress',
    currentSeat: 1,
    p1Score: 0,
    p2Score: 0,
    roundScore: 0,
    lastDice: [],
    winnerSeat: null,
    version: 0,
    lastMove: null,
    ...overrides,
  };
}

describe('GameStateSchema', () => {
  describe('derived busted (I6)', () => {
    it('should derive busted true when lastMove is a roll with busted true', () => {
      const result = GameStateSchema.parse(
        buildGameState({
          lastMove: { kind: 'roll', dice: [6, 6], busted: true },
          lastDice: [6, 6],
        }),
      );

      expect(result.busted).toBe(true);
    });

    it('should derive busted false when lastMove is a roll with busted false', () => {
      const result = GameStateSchema.parse(
        buildGameState({
          lastMove: { kind: 'roll', dice: [3, 4], busted: false },
          lastDice: [3, 4],
        }),
      );

      expect(result.busted).toBe(false);
    });

    it('should derive busted false when lastMove is a hold', () => {
      const result = GameStateSchema.parse(buildGameState({ lastMove: { kind: 'hold' } }));

      expect(result.busted).toBe(false);
    });

    it('should derive busted false when lastMove is a forfeit', () => {
      const result = GameStateSchema.parse(buildGameState({ lastMove: { kind: 'forfeit' } }));

      expect(result.busted).toBe(false);
    });

    it('should derive busted false when lastMove is null (freshly created game)', () => {
      const result = GameStateSchema.parse(buildGameState({ lastMove: null }));

      expect(result.busted).toBe(false);
    });
  });

  describe('numeric bounds', () => {
    it('should reject a targetScore below the minimum', () => {
      expect(() => GameStateSchema.parse(buildGameState({ targetScore: 9 }))).toThrow();
    });

    it('should reject a targetScore above the maximum', () => {
      expect(() => GameStateSchema.parse(buildGameState({ targetScore: 1001 }))).toThrow();
    });

    it('should reject a non-integer targetScore', () => {
      expect(() => GameStateSchema.parse(buildGameState({ targetScore: 100.5 }))).toThrow();
    });

    it('should reject a negative p1Score', () => {
      expect(() => GameStateSchema.parse(buildGameState({ p1Score: -1 }))).toThrow();
    });
  });

  describe('lastDice', () => {
    it('should accept an empty tuple', () => {
      expect(() => GameStateSchema.parse(buildGameState({ lastDice: [] }))).not.toThrow();
    });

    it('should accept a pair of valid dice', () => {
      expect(() => GameStateSchema.parse(buildGameState({ lastDice: [1, 6] }))).not.toThrow();
    });

    it('should reject a die value out of range', () => {
      expect(() => GameStateSchema.parse(buildGameState({ lastDice: [1, 7] }))).toThrow();
    });

    it('should reject a single-element tuple', () => {
      expect(() => GameStateSchema.parse(buildGameState({ lastDice: [3] }))).toThrow();
    });
  });
});

describe('CreateGameInputSchema', () => {
  it('should accept a human-mode game with no aiSeat', () => {
    expect(() => CreateGameInputSchema.parse({ targetScore: 100, mode: 'human' })).not.toThrow();
  });

  it('should accept an ai-mode game with a valid aiSeat', () => {
    expect(() =>
      CreateGameInputSchema.parse({ targetScore: 100, mode: 'ai', aiSeat: 2 }),
    ).not.toThrow();
  });

  it('should reject an ai-mode game missing aiSeat', () => {
    expect(() => CreateGameInputSchema.parse({ targetScore: 100, mode: 'ai' })).toThrow();
  });

  it('should reject a human-mode game with an aiSeat set', () => {
    expect(() =>
      CreateGameInputSchema.parse({ targetScore: 100, mode: 'human', aiSeat: 1 }),
    ).toThrow();
  });

  it('should reject an unknown key (strict)', () => {
    expect(() =>
      CreateGameInputSchema.parse({ targetScore: 100, mode: 'human', extra: 'nope' }),
    ).toThrow();
  });

  it('should reject a targetScore outside the allowed range', () => {
    expect(() => CreateGameInputSchema.parse({ targetScore: 5, mode: 'human' })).toThrow();
  });
});

describe('ExpectedVersionSchema', () => {
  it('should accept zero', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: 0 })).not.toThrow();
  });

  it('should accept a positive integer', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: 5 })).not.toThrow();
  });

  it('should reject a fractional version', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: 1.5 })).toThrow();
  });

  it('should reject NaN', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: Number.NaN })).toThrow();
  });

  it('should reject a negative version', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: -1 })).toThrow();
  });

  it('should reject an unknown key (strict)', () => {
    expect(() => ExpectedVersionSchema.parse({ expectedVersion: 1, dice: [1, 2] })).toThrow();
  });
});

describe('ListGamesQuerySchema', () => {
  it('should accept status=in_progress with no limit and default the limit', () => {
    const result = ListGamesQuerySchema.parse({ status: 'in_progress' });
    expect(result.limit).toBe(10);
  });

  it('should coerce a string limit (as query params always arrive) to a number', () => {
    const result = ListGamesQuerySchema.parse({ status: 'in_progress', limit: '5' });
    expect(result.limit).toBe(5);
  });

  it('should reject a status other than in_progress', () => {
    expect(() => ListGamesQuerySchema.parse({ status: 'finished' })).toThrow();
  });

  it('should reject a missing status', () => {
    expect(() => ListGamesQuerySchema.parse({})).toThrow();
  });

  it('should reject a limit over the max', () => {
    expect(() => ListGamesQuerySchema.parse({ status: 'in_progress', limit: '51' })).toThrow();
  });

  it('should reject a zero or negative limit', () => {
    expect(() => ListGamesQuerySchema.parse({ status: 'in_progress', limit: '0' })).toThrow();
  });

  it('should reject an unknown query key (strict)', () => {
    expect(() => ListGamesQuerySchema.parse({ status: 'in_progress', sort: 'asc' })).toThrow();
  });
});

describe('AuthCredentialsInputSchema', () => {
  it('should accept a valid username and password', () => {
    expect(() =>
      AuthCredentialsInputSchema.parse({ username: 'player1', password: 'hunter22' }),
    ).not.toThrow();
  });

  it('should reject a username shorter than the minimum', () => {
    expect(() =>
      AuthCredentialsInputSchema.parse({ username: 'ab', password: 'hunter22' }),
    ).toThrow();
  });

  it('should reject a username longer than the maximum', () => {
    expect(() =>
      AuthCredentialsInputSchema.parse({ username: 'a'.repeat(31), password: 'hunter22' }),
    ).toThrow();
  });

  it('should reject a password shorter than the minimum', () => {
    expect(() =>
      AuthCredentialsInputSchema.parse({ username: 'player1', password: 'short1' }),
    ).toThrow();
  });

  it('should reject a password exceeding the bcrypt byte limit despite a short JS length', () => {
    // Each 🔥 is a 4-byte UTF-8 character but 2 UTF-16 code units — 20 of them is 40
    // JS chars (would pass a naive .max(72) on string length) but 80 UTF-8 bytes.
    const multiByteOverLimit = '🔥'.repeat(20);

    expect(() =>
      AuthCredentialsInputSchema.parse({ username: 'player1', password: multiByteOverLimit }),
    ).toThrow();
  });

  it('should reject an unknown key (strict)', () => {
    expect(() =>
      AuthCredentialsInputSchema.parse({
        username: 'player1',
        password: 'hunter22',
        remember: true,
      }),
    ).toThrow();
  });
});

describe('AuthResponseSchema', () => {
  it('should accept a valid user response', () => {
    expect(() =>
      AuthResponseSchema.parse({ user: { id: 'user-1', username: 'player1' } }),
    ).not.toThrow();
  });

  it('should reject a response carrying a token field', () => {
    expect(() =>
      AuthResponseSchema.parse({ user: { id: 'user-1', username: 'player1' }, token: 'abc' }),
    ).toThrow();
  });
});
