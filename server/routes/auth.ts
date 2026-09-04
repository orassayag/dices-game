import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AuthCredentialsInput, AuthResponse } from '../../shared/index.js';
import { AuthCredentialsInputSchema } from '../../shared/index.js';
import { env } from '../config/env.js';
import { AUTH_TOKEN_LIFETIME_SECONDS, normalizeUsernameKey } from '../lib/authCrypto.js';
import { generatePreAuthCsrfToken, generateUserBoundCsrfToken } from '../lib/csrfCrypto.js';
import { RateLimitedError } from '../lib/errors.js';
import { requireAuth, requireUserId } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validateBody } from '../middleware/validate.js';
import { getAuthenticatedUser, loginUser, registerUser } from '../services/authService.js';

// Auth rate limits (plan_v6.md §10). `app.set('trust proxy', false)` (server/app.ts)
// makes `req.ip` the real socket address, so neither limiter can be bypassed by a forged
// `X-Forwarded-For` header.
const REGISTER_WINDOW_MS: number = 60 * 60 * 1000;
const REGISTER_MAX_REQUESTS: number = 10;
const LOGIN_WINDOW_MS: number = 60 * 1000;
const LOGIN_MAX_REQUESTS: number = 5;

function rejectWithRateLimitedError(_req: Request, _res: Response, next: NextFunction): void {
  next(new RateLimitedError('Too many requests. Please try again later.'));
}

const registerRateLimiter = rateLimit({
  windowMs: REGISTER_WINDOW_MS,
  limit: REGISTER_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rejectWithRateLimitedError,
});

// Keyed on ip + normalized username (not username alone) — a per-username-only lockout
// would let an attacker lock a victim out by repeatedly failing their login.
const loginRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: LOGIN_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const rawUsername: unknown = (req.body as { username?: unknown } | undefined)?.username;
    const usernameKey = normalizeUsernameKey(typeof rawUsername === 'string' ? rawUsername : '');
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${usernameKey}`;
  },
  handler: rejectWithRateLimitedError,
});

// The pre-auth CSRF token only needs to survive the login/register round trip, not a
// full session — a short lifetime limits the window a leaked/unused pre-auth cookie
// stays valid.
const PRE_AUTH_CSRF_COOKIE_MAX_AGE_MS: number = 10 * 60 * 1000;

function authCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
} {
  return { httpOnly: true, secure: env.cookie.secure, sameSite: 'lax', path: '/' };
}

function setAuthCookie(res: Response, authToken: string): void {
  res.cookie(env.cookie.authCookieName, authToken, {
    ...authCookieOptions(),
    maxAge: AUTH_TOKEN_LIFETIME_SECONDS * 1000,
  });
}

// The CSRF cookie must stay readable by JS (it's echoed into the X-CSRF-Token header),
// so — unlike the auth cookie — it is NOT httpOnly. `secure`/`sameSite`/`path` still
// match the auth cookie; `env.cookie.csrfCookieName` already carries the `__Host-`
// prefix in production (server/config/env.ts).
function csrfCookieOptions(): { httpOnly: false; secure: boolean; sameSite: 'lax'; path: string } {
  return { httpOnly: false, secure: env.cookie.secure, sameSite: 'lax', path: '/' };
}

function setCsrfCookie(res: Response, csrfToken: string, maxAgeMs: number): void {
  res.cookie(env.cookie.csrfCookieName, csrfToken, { ...csrfCookieOptions(), maxAge: maxAgeMs });
}

type AuthRequest = Request<Record<string, never>, unknown, AuthCredentialsInput>;

export const authRouter: Router = Router();

// Pre-auth CSRF token (I9) — the client fetches this before submitting login/register,
// so a purely cross-site auto-submit (no prior same-origin fetch to read the token) can
// never supply a valid X-CSRF-Token. GET is exempt from csrfProtection's own checks, so
// this route needs no guard itself.
authRouter.get('/csrf', (_req: Request, res: Response): void => {
  setCsrfCookie(res, generatePreAuthCsrfToken(), PRE_AUTH_CSRF_COOKIE_MAX_AGE_MS);
  res.status(204).end();
});

// Restores the session on page reload (bug report: a refresh logged the user back out)
// — the client calls this once on mount instead of assuming "no local state" means "no
// session". GET is exempt from csrfProtection, so this needs only requireAuth: a valid,
// unrevoked auth cookie alone is enough to read the session back.
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await getAuthenticatedUser(requireUserId(req));
      const body: AuthResponse = { user };
      res.status(200).json(body);
    } catch (error) {
      next(error);
    }
  },
);

// validateBody replaces req.body with the parsed AuthCredentialsInput before this
// handler runs, so the { username, password } destructure below is sound even though
// Express's own typing can't see across the middleware chain. csrfProtection runs
// before requireAuth would ever apply here (there is no session yet), so it verifies
// the pre-auth token (req.userId is unset) rather than a user-bound one.
authRouter.post(
  '/register',
  registerRateLimiter,
  csrfProtection,
  validateBody(AuthCredentialsInputSchema),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;
      const user = await registerUser(username, password);
      setAuthCookie(res, user.authToken);
      // Rotation (§1): the pre-auth token is replaced by a user-bound one now that a
      // session exists, matching the auth cookie's own lifetime.
      setCsrfCookie(res, generateUserBoundCsrfToken(user.id), AUTH_TOKEN_LIFETIME_SECONDS * 1000);
      const body: AuthResponse = { user: { id: user.id, username: user.username } };
      res.status(201).json(body);
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post(
  '/login',
  loginRateLimiter,
  csrfProtection,
  validateBody(AuthCredentialsInputSchema),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;
      const user = await loginUser(username, password);
      setAuthCookie(res, user.authToken);
      setCsrfCookie(res, generateUserBoundCsrfToken(user.id), AUTH_TOKEN_LIFETIME_SECONDS * 1000);
      const body: AuthResponse = { user: { id: user.id, username: user.username } };
      res.status(200).json(body);
    } catch (error) {
      next(error);
    }
  },
);

// requireAuth must run BEFORE csrfProtection here: the CSRF check needs `req.userId` to
// recompute the expected HMAC against the actual authenticated subject (not merely
// confirm header === cookie) — see server/middleware/csrf.ts.
authRouter.post('/logout', requireAuth, csrfProtection, (_req: Request, res: Response): void => {
  res.clearCookie(env.cookie.authCookieName, authCookieOptions());
  res.clearCookie(env.cookie.csrfCookieName, csrfCookieOptions());
  res.status(204).end();
});
