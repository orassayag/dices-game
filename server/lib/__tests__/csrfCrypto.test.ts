// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  generatePreAuthCsrfToken,
  generateUserBoundCsrfToken,
  verifyPreAuthCsrfToken,
  verifyUserBoundCsrfToken,
} from '../csrfCrypto.js';

describe('pre-auth CSRF tokens (I9)', () => {
  it('should verify a freshly generated pre-auth token', () => {
    const token = generatePreAuthCsrfToken();
    expect(verifyPreAuthCsrfToken(token)).toBe(true);
  });

  it('should reject a tampered random component', () => {
    const token = generatePreAuthCsrfToken();
    const [, hmac] = token.split('.');
    expect(verifyPreAuthCsrfToken(`not-the-real-random.${hmac}`)).toBe(false);
  });

  it('should reject a tampered HMAC', () => {
    const token = generatePreAuthCsrfToken();
    const [random] = token.split('.');
    expect(
      verifyPreAuthCsrfToken(
        `${random}.0000000000000000000000000000000000000000000000000000000000000000`,
      ),
    ).toBe(false);
  });

  it('should reject a token with no separator', () => {
    expect(verifyPreAuthCsrfToken('not-a-valid-token-shape')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(verifyPreAuthCsrfToken('')).toBe(false);
  });

  it('should not verify as a user-bound token for any user id', () => {
    const token = generatePreAuthCsrfToken();
    expect(verifyUserBoundCsrfToken(token, 'user-1')).toBe(false);
  });

  it('should produce a different token on every call', () => {
    expect(generatePreAuthCsrfToken()).not.toBe(generatePreAuthCsrfToken());
  });
});

describe('user-bound CSRF tokens', () => {
  it('should verify a token against the user id it was issued for', () => {
    const token = generateUserBoundCsrfToken('user-1');
    expect(verifyUserBoundCsrfToken(token, 'user-1')).toBe(true);
  });

  it('should reject a token whose HMAC binds it to a different user (I3)', () => {
    const token = generateUserBoundCsrfToken('user-1');
    expect(verifyUserBoundCsrfToken(token, 'user-2')).toBe(false);
  });

  it('should not verify as a pre-auth token', () => {
    const token = generateUserBoundCsrfToken('user-1');
    expect(verifyPreAuthCsrfToken(token)).toBe(false);
  });
});
