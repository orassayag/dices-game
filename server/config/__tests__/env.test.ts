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
});
