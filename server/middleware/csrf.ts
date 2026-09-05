import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { CsrfError } from '../lib/errors.js';
import { verifyPreAuthCsrfToken, verifyUserBoundCsrfToken } from '../lib/csrfCrypto.js';

const CSRF_HEADER_NAME: string = 'x-csrf-token';
const SAFE_METHOD: string = 'GET';

// `req.get('origin')` is absent on some same-origin browser requests; `Referer` is the
// fallback. A malformed Referer (not a parseable URL) is treated as absent rather than
// throwing.
function resolveRequestOrigin(req: Request): string | undefined {
  const originHeader: string | undefined = req.get('origin');
  if (originHeader) {
    return originHeader;
  }
  const refererHeader: string | undefined = req.get('referer');
  if (!refererHeader) {
    return undefined;
  }
  try {
    return new URL(refererHeader).origin;
  } catch {
    return undefined;
  }
}

// Mount on every state-changing route, including pre-auth ones — those verify the token
// against the fixed pre-auth subject; every other route verifies it against req.userId,
// which requireAuth must therefore run and set BEFORE this middleware on that route.
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === SAFE_METHOD) {
    next();
    return;
  }

  const requestOrigin = resolveRequestOrigin(req);
  if (!requestOrigin || requestOrigin !== env.frontendUrl) {
    next(new CsrfError('Request origin does not match the allowed frontend origin.'));
    return;
  }

  const headerToken: unknown = req.get(CSRF_HEADER_NAME);
  const cookieToken: unknown = req.cookies?.[env.cookie.csrfCookieName];
  if (
    typeof headerToken !== 'string' ||
    typeof cookieToken !== 'string' ||
    headerToken.length === 0 ||
    headerToken !== cookieToken
  ) {
    next(new CsrfError('Missing or mismatched CSRF token.'));
    return;
  }

  const isVerified: boolean = req.userId
    ? verifyUserBoundCsrfToken(headerToken, req.userId)
    : verifyPreAuthCsrfToken(headerToken);
  if (!isVerified) {
    next(new CsrfError('CSRF token failed verification.'));
    return;
  }

  next();
}
