// @vitest-environment node
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env.js';
import {
  AUTH_TOKEN_LIFETIME_SECONDS,
  DUMMY_BCRYPT_HASH,
  hashPassword,
  normalizeUsernameKey,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from '../authCrypto.js';

describe('hashPassword / verifyPassword', () => {
  it('should verify a password against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('should reject the wrong password against a real hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });
});

describe('DUMMY_BCRYPT_HASH', () => {
  it('should be a real cost-12 bcrypt hash', () => {
    expect(DUMMY_BCRYPT_HASH).toMatch(/^\$2[aby]\$12\$/);
  });

  it('should never match an arbitrary password', async () => {
    await expect(verifyPassword('anything at all', DUMMY_BCRYPT_HASH)).resolves.toBe(false);
  });
});

describe('signAuthToken / verifyAuthToken', () => {
  it('should round-trip sub and tokenVersion', () => {
    const token = signAuthToken({ sub: 'user-1', tokenVersion: 3 });
    const payload = verifyAuthToken(token);
    expect(payload).toMatchObject({ sub: 'user-1', tokenVersion: 3 });
  });

  it('should reject a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: 'user-1', tokenVersion: 0 }, 'a-completely-different-secret', {
      algorithm: 'HS256',
    });
    expect(() => verifyAuthToken(forged)).toThrow();
  });

  it('should reject a token signed with a different algorithm', () => {
    const forged = jwt.sign({ sub: 'user-1', tokenVersion: 0 }, env.jwtSecret, {
      algorithm: 'HS384',
    });
    expect(() => verifyAuthToken(forged)).toThrow();
  });

  it('should reject a token whose payload is missing tokenVersion', () => {
    const malformed = jwt.sign({ sub: 'user-1' }, env.jwtSecret, { algorithm: 'HS256' });
    expect(() => verifyAuthToken(malformed)).toThrow();
  });

  it('should reject a garbage string', () => {
    expect(() => verifyAuthToken('not-a-jwt-at-all')).toThrow();
  });

  it('should reject an expired token', () => {
    const expired = jwt.sign({ sub: 'user-1', tokenVersion: 0 }, env.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: -1,
    });
    expect(() => verifyAuthToken(expired)).toThrow();
  });
});

describe('AUTH_TOKEN_LIFETIME_SECONDS', () => {
  it('should be twelve hours', () => {
    expect(AUTH_TOKEN_LIFETIME_SECONDS).toBe(12 * 60 * 60);
  });
});

describe('normalizeUsernameKey', () => {
  it('should trim surrounding whitespace', () => {
    expect(normalizeUsernameKey('  alice  ')).toBe('alice');
  });

  it('should lowercase the username', () => {
    expect(normalizeUsernameKey('Alice')).toBe('alice');
  });

  it('should NFKC-normalize so differently-encoded equivalents collide', () => {
    const precomposed = 'é'; // "é" as a single code point
    const decomposed = 'é'; // "e" + a combining acute accent — visually identical
    expect(precomposed).not.toBe(decomposed);
    expect(normalizeUsernameKey(precomposed)).toBe(normalizeUsernameKey(decomposed));
  });
});
