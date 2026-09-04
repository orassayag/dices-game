import { hash as bcryptHash, compare as bcryptCompare, hashSync as bcryptHashSync } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

// Password hashing (plan_v6.md §1, §10). bcryptjs is a pure-JS, zero-native-dependency
// implementation of the same algorithm as the `bcrypt` package — chosen so the project
// installs cleanly with no node-gyp/build-tooling requirement, at the accepted cost of
// synchronous-path CPU work instead of a native binding.
const BCRYPT_COST: number = 12;

// A real cost-12 bcrypt hash of a value no real user will ever submit, computed once at
// module load. The login handler (server/services/authService.ts) runs exactly one
// bcrypt.compare against this hash when the username doesn't exist, so present and
// absent usernames take comparable time (constant-time login, §10).
const DUMMY_BCRYPT_PLAINTEXT: string = 'dummy-password-never-submitted-by-a-real-user';
export const DUMMY_BCRYPT_HASH: string = bcryptHashSync(DUMMY_BCRYPT_PLAINTEXT, BCRYPT_COST);

export async function hashPassword(password: string): Promise<string> {
  return await bcryptHash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return await bcryptCompare(password, passwordHash);
}

// JWT (plan_v6.md §1). The algorithm is pinned explicitly on both sign and verify — a
// single-element allowlist — closing the "none"/algorithm-swap forgery path. The payload
// carries `sub` (user id) and `tokenVersion`; the auth middleware (server/middleware/auth.ts)
// rejects a token whose `tokenVersion` no longer matches the user's current value, so
// bumping it invalidates every outstanding token.
const JWT_ALGORITHM = 'HS256' as const;

// Single source of truth for the token lifetime — shared with the auth cookie's
// `maxAge` (server/routes/auth.ts) so the cookie never outlives the JWT it carries.
export const AUTH_TOKEN_LIFETIME_SECONDS: number = 12 * 60 * 60;

export interface AuthTokenPayload {
  sub: string;
  tokenVersion: number;
}

// jwt.verify's return type is `JwtPayload | string` — an untyped boundary (the token was
// carried over the wire). Validate the decoded shape with Zod instead of casting past it
// (typescript-typing.md). `.passthrough()` tolerates jsonwebtoken's own `iat`/`exp` fields.
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

// Throws (SyntaxError from jwt.verify, or a ZodError from the shape check) on any
// invalid/expired/malformed/wrong-algorithm token. The auth middleware translates the
// throw into the HTTP-facing UnauthorizedError — this module stays HTTP-agnostic.
export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded: unknown = jwt.verify(token, env.jwtSecret, { algorithms: [JWT_ALGORITHM] });
  return AuthTokenPayloadSchema.parse(decoded);
}

// Username normalization (plan_v6.md §5) — trim + NFKC + lowercase, applied before length
// and uniqueness checks so visually-identical usernames typed in different Unicode forms
// can't register as distinct accounts.
export function normalizeUsernameKey(rawUsername: string): string {
  return rawUsername.trim().normalize('NFKC').toLowerCase();
}
