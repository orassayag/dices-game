// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { loadEnv, ConfigError } from '../env.js';

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    ...overrides,
  };
}

describe('loadEnv', () => {
  describe('FRONTEND_URL production guard', () => {
    it('should throw when FRONTEND_URL contains "localhost" in production', () => {
      expect(() => loadEnv(baseEnv({ FRONTEND_URL: 'http://localhost:3000' }))).toThrow(ConfigError);
    });

    it('should throw when FRONTEND_URL is missing in production', () => {
      expect(() => loadEnv(baseEnv())).toThrow(ConfigError);
    });

    it('should accept a non-localhost FRONTEND_URL in production', () => {
      const env = loadEnv(baseEnv({ FRONTEND_URL: 'https://dices-game.example.com' }));
      expect(env.frontendUrl).toBe('https://dices-game.example.com');
    });

    it('should still throw on a localhost FRONTEND_URL when ALLOW_LOCAL_FRONTEND_URL is not exactly "true"', () => {
      expect(() =>
        loadEnv(
          baseEnv({ FRONTEND_URL: 'http://localhost:3000', ALLOW_LOCAL_FRONTEND_URL: '1' }),
        ),
      ).toThrow(ConfigError);
    });

    it('should allow a localhost FRONTEND_URL when ALLOW_LOCAL_FRONTEND_URL=true (docker-compose demo escape hatch)', () => {
      const env = loadEnv(
        baseEnv({ FRONTEND_URL: 'http://localhost:3000', ALLOW_LOCAL_FRONTEND_URL: 'true' }),
      );
      expect(env.frontendUrl).toBe('http://localhost:3000');
    });

    it('should still require FRONTEND_URL even with ALLOW_LOCAL_FRONTEND_URL=true', () => {
      expect(() => loadEnv(baseEnv({ ALLOW_LOCAL_FRONTEND_URL: 'true' }))).toThrow(ConfigError);
    });
  });

  describe('NODE_ENV', () => {
    it('should default to development when NODE_ENV is unset', () => {
      const env = loadEnv({
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      });
      expect(env.nodeEnv).toBe('development');
      expect(env.isProduction).toBe(false);
    });

    it('should throw when NODE_ENV is an unknown value', () => {
      expect(() => loadEnv(baseEnv({ NODE_ENV: 'staging' }))).toThrow(ConfigError);
    });
  });

  describe('JWT_SECRET', () => {
    it('should throw when JWT_SECRET is missing', () => {
      const env = baseEnv({ FRONTEND_URL: 'https://app.example.com' });
      delete env.JWT_SECRET;
      expect(() => loadEnv(env)).toThrow('JWT_SECRET is required.');
    });

    it('should throw when JWT_SECRET is shorter than 32 bytes', () => {
      expect(() =>
        loadEnv(baseEnv({ FRONTEND_URL: 'https://app.example.com', JWT_SECRET: 'short' })),
      ).toThrow(/at least 32 bytes/);
    });
  });

  describe('DATABASE_URL', () => {
    it('should throw when DATABASE_URL is missing', () => {
      const env = baseEnv({ FRONTEND_URL: 'https://app.example.com' });
      delete env.DATABASE_URL;
      expect(() => loadEnv(env)).toThrow('DATABASE_URL is required.');
    });
  });

  describe('PORT', () => {
    it('should parse a valid PORT', () => {
      const env = loadEnv(baseEnv({ FRONTEND_URL: 'https://app.example.com', PORT: '8080' }));
      expect(env.port).toBe(8080);
    });

    it('should throw when PORT is not a positive integer', () => {
      expect(() =>
        loadEnv(baseEnv({ FRONTEND_URL: 'https://app.example.com', PORT: 'abc' })),
      ).toThrow(/PORT must be a positive integer/);
    });
  });

  describe('DICE_SEED', () => {
    it('should throw when DICE_SEED is set in production', () => {
      expect(() =>
        loadEnv(baseEnv({ FRONTEND_URL: 'https://app.example.com', DICE_SEED: '42' })),
      ).toThrow(/DICE_SEED must not be set in production/);
    });

    it('should parse a finite DICE_SEED in development', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        DICE_SEED: '42',
      });
      expect(env.diceSeed).toBe(42);
    });

    it('should treat an empty DICE_SEED as undefined', () => {
      const env = loadEnv({
        NODE_ENV: 'development',
        JWT_SECRET: 'a'.repeat(32),
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        DICE_SEED: '',
      });
      expect(env.diceSeed).toBeUndefined();
    });

    it('should throw when DICE_SEED is not a finite number in development', () => {
      expect(() =>
        loadEnv({
          NODE_ENV: 'development',
          JWT_SECRET: 'a'.repeat(32),
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
          DICE_SEED: 'notanumber',
        }),
      ).toThrow(/DICE_SEED must be a finite number/);
    });
  });
});
