import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

// Hardened double-submit CSRF tokens (plan_v6.md §1, §10, I3/I9). A naive double-submit
// (server issues a readable random cookie, middleware only checks header === cookie) only
// proves the two values match — not that this server issued them — so anyone able to write
// a cookie (a sibling subdomain script, a shared machine) can set both sides. Binding the
// token to a server-verified HMAC over the subject closes that gap: forging a token that
// verifies for a chosen subject requires knowing the secret.
//
// Token shape: `<random>.<hmac>`, where `hmac = HMAC-SHA256(secret, "<context>:<subject>:<random>")`.
// Two subject kinds:
//   - post-auth (register/login/logout, later every game route): subject is the
//     authenticated user's id, so a token planted by an attacker for their OWN account
//     fails verification once it's checked against the victim's real `req.userId`.
//   - pre-auth (the login/register CSRF-token-before-a-session-exists case, I9): subject
//     is a fixed marker — the "pre-session nonce" the plan describes is the random
//     component itself, not a second value, since there is no session/user id yet to bind to.
// Reusing `env.jwtSecret` as the HMAC key avoids a second required env var; the context
// prefix below domain-separates a CSRF HMAC message from anything else that secret signs.
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

/** Issues a pre-auth CSRF token (I9) — bound to its own random nonce, no user id yet. */
export function generatePreAuthCsrfToken(): string {
  return buildToken(PRE_AUTH_SUBJECT);
}

/** Verifies a pre-auth CSRF token against the fixed pre-auth subject. */
export function verifyPreAuthCsrfToken(token: string): boolean {
  return verifyToken(token, PRE_AUTH_SUBJECT);
}

/** Issues a CSRF token bound to an authenticated user id — rotated on register/login. */
export function generateUserBoundCsrfToken(userId: string): string {
  return buildToken(userId);
}

/** Verifies a CSRF token was issued for exactly this user id. */
export function verifyUserBoundCsrfToken(token: string, userId: string): boolean {
  return verifyToken(token, userId);
}
