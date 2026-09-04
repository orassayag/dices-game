import type { NextFunction, Request, Response } from 'express';
import prisma from '../db.js';
import { env } from '../config/env.js';
import { verifyAuthToken, type AuthTokenPayload } from '../lib/authCrypto.js';
import { ServiceUnavailableError, UnauthorizedError } from '../lib/errors.js';

// Augments Express's own Request type (the framework's documented extension point —
// code-structure-style.md's DI/casting exceptions cover ecosystem interop like this) so
// downstream route handlers read `req.userId` without a cast.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express's own augmentation pattern requires a namespace here.
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// The per-request tokenVersion re-check makes PostgreSQL a hard dependency of every
// authenticated request (I8, plan_v6.md §1). A short timeout distinguishes "the DB is
// briefly slow/unavailable" (503) from "the token itself is invalid/stale" (401) — a
// hung query must never be mistaken for a logged-out user.
const TOKEN_VERSION_LOOKUP_TIMEOUT_MS: number = 2000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms.`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Reads the user's CURRENT tokenVersion from the DB (not the JWT's own claim) so a
// revoked/stale token is rejected even though its signature is still valid. Returns
// `null` when the user no longer exists (deleted account) — treated as UNAUTHORIZED,
// never SERVICE_UNAVAILABLE, since the DB read itself succeeded.
async function readCurrentTokenVersion(userId: string): Promise<number | null> {
  const user = await withTimeout(
    prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true } }),
    TOKEN_VERSION_LOOKUP_TIMEOUT_MS,
  );
  return user?.tokenVersion ?? null;
}

// Reads the JWT from the HttpOnly auth cookie, verifies it, and checks the DB-held
// tokenVersion (plan_v6.md §1, §10). Any failure is passed to `next(error)` so the
// central error middleware maps it to the documented status/code — this middleware
// itself never writes a response.
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawCookie: unknown = req.cookies?.[env.cookie.authCookieName];
    if (typeof rawCookie !== 'string' || rawCookie.length === 0) {
      throw new UnauthorizedError('Missing auth cookie.', { errorCode: 'UNAUTHORIZED' });
    }

    let payload: AuthTokenPayload;
    try {
      payload = verifyAuthToken(rawCookie);
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired session.', {
        errorCode: 'UNAUTHORIZED',
        error,
      });
    }

    let currentTokenVersion: number | null;
    try {
      currentTokenVersion = await readCurrentTokenVersion(payload.sub);
    } catch (error) {
      throw new ServiceUnavailableError('Could not verify session status.', { error });
    }

    if (currentTokenVersion === null || currentTokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedError('Session has been revoked.', { errorCode: 'UNAUTHORIZED' });
    }

    req.userId = payload.sub;
    next();
  } catch (error) {
    next(error);
  }
}

// requireAuth (above) always sets `req.userId` before any downstream handler runs on a
// protected route; this guard only protects against a future reordering mistake, not a
// real user path. Shared by every router mounted behind requireAuth (games, auth's own
// GET /me) rather than each defining its own copy.
export function requireUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) {
    throw new Error('NO_USER_ID_ON_REQUEST — requireAuth must run before this handler.');
  }
  return userId;
}
