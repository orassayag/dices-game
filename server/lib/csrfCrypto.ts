import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

// Hardened double-submit CSRF tokens: a naive double-submit (readable random cookie,
// header checked against cookie) only proves the two values match, not that this server
// issued them — anyone able to write a cookie can set both sides. Binding the token to a
// server-verified HMAC over the subject (the authenticated user id, or a fixed pre-auth
// marker before a session exists) closes that gap: forging a token that verifies for a
// chosen subject requires knowing the secret. Token shape: `<random>.<hmac>`, where
// `hmac = HMAC-SHA256(secret, "<context>:<subject>:<random>")`. Reuses env.jwtSecret as
// the HMAC key; the context prefix domain-separates this from anything else that secret signs.
const HMAC_ALGORITHM = 'sha256';
const HMAC_CONTEXT = 'csrf-v1';
const PRE_AUTH_SUBJECT = 'pre-auth';
const RANDOM_BYTES: number = 32;

function computeHmac(subject: string, random: string): string {
  return createHmac(HMAC_ALGORITHM, env.jwtSecret)
    .update(`${HMAC_CONTEXT}:${subject}:${random}`)
    .digest('hex');
}

function buildToken(subject: string): string {
  const random: string = randomBytes(RANDOM_BYTES).toString('hex');
  return `${random}.${computeHmac(subject, random)}`;
}

// `timingSafeEqual` requires equal-length buffers; a length mismatch alone (e.g. a
// truncated or corrupted token) means "not equal" rather than a thrown error.
function hmacMatches(expectedHmac: string, providedHmac: string): boolean {
  const expected = Buffer.from(expectedHmac, 'hex');
  const provided = Buffer.from(providedHmac, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function verifyToken(token: string, subject: string): boolean {
  const separatorIndex: number = token.indexOf('.');
  if (separatorIndex === -1) {
    return false;
  }
  const random: string = token.slice(0, separatorIndex);
  const providedHmac: string = token.slice(separatorIndex + 1);
  if (random.length === 0 || providedHmac.length === 0) {
    return false;
  }
  return hmacMatches(computeHmac(subject, random), providedHmac);
}

export function generatePreAuthCsrfToken(): string {
  return buildToken(PRE_AUTH_SUBJECT);
}

export function verifyPreAuthCsrfToken(token: string): boolean {
  return verifyToken(token, PRE_AUTH_SUBJECT);
}

export function generateUserBoundCsrfToken(userId: string): string {
  return buildToken(userId);
}

export function verifyUserBoundCsrfToken(token: string, userId: string): boolean {
  return verifyToken(token, userId);
}
