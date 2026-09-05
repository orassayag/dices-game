import { hash as bcryptHash, compare as bcryptCompare, hashSync as bcryptHashSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

// bcryptjs (pure JS) over the native `bcrypt` package — same algorithm, no node-gyp
// build-tooling requirement.
const BCRYPT_COST: number = 12;

// A real bcrypt hash of a value no real user will ever submit, computed once at module
// load. The login handler runs exactly one bcrypt.compare against this hash when the
// username doesn't exist, so present and absent usernames take comparable time.
const DUMMY_BCRYPT_PLAINTEXT: string = 'dummy-password-never-submitted-by-a-real-user';
export const DUMMY_BCRYPT_HASH: string = bcryptHashSync(DUMMY_BCRYPT_PLAINTEXT, BCRYPT_COST);

export async function hashPassword(password: string): Promise<string> {
  return await bcryptHash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return await bcryptCompare(password, passwordHash);
}

// Pinned explicitly on both sign and verify — a single-element allowlist — closing the
// "none"/algorithm-swap forgery path.
const JWT_ALGORITHM = 'HS256' as const;

// Shared with the auth cookie's maxAge (server/routes/auth.ts) so the cookie never
// outlives the JWT it carries.
export const AUTH_TOKEN_LIFETIME_SECONDS: number = 12 * 60 * 60;

export interface AuthTokenPayload {
  sub: string;
  tokenVersion: number;
}

// jwt.verify's return type is `JwtPayload | string` — validated with Zod instead of cast.
// `.passthrough()` tolerates jsonwebtoken's own `iat`/`exp` fields.
const AuthTokenPayloadSchema = z
  .object({
    sub: z.string(),
    tokenVersion: z.number().int().nonnegative(),
  })
  .passthrough();

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: AUTH_TOKEN_LIFETIME_SECONDS,
  });
}

// Throws on any invalid/expired/malformed/wrong-algorithm token; callers map that to an
// HTTP-facing error — this module stays HTTP-agnostic.
export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded: unknown = jwt.verify(token, env.jwtSecret, { algorithms: [JWT_ALGORITHM] });
  return AuthTokenPayloadSchema.parse(decoded);
}

// NFKC normalization so visually-identical usernames typed in different Unicode forms
// can't register as distinct accounts.
export function normalizeUsernameKey(rawUsername: string): string {
  return rawUsername.trim().normalize('NFKC').toLowerCase();
}
