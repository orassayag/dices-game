import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AuthCredentialsInput, AuthResponse } from '../../shared/index.js';
import { AuthCredentialsInputSchema } from '../../shared/index.js';
import { env } from '../config/env.js';
import { AUTH_TOKEN_LIFETIME_SECONDS, normalizeUsernameKey } from '../lib/authCrypto.js';
import { RateLimitedError } from '../lib/errors.js';
import { validateBody } from '../middleware/validate.js';
import { loginUser, registerUser } from '../services/authService.js';

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

type AuthRequest = Request<Record<string, never>, unknown, AuthCredentialsInput>;

export const authRouter: Router = Router();

// validateBody replaces req.body with the parsed AuthCredentialsInput before this
// handler runs, so the { username, password } destructure below is sound even though
// Express's own typing can't see across the middleware chain.
authRouter.post(
  '/register',
  registerRateLimiter,
  validateBody(AuthCredentialsInputSchema),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;
      const user = await registerUser(username, password);
      setAuthCookie(res, user.authToken);
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
  validateBody(AuthCredentialsInputSchema),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;
      const user = await loginUser(username, password);
      setAuthCookie(res, user.authToken);
      const body: AuthResponse = { user: { id: user.id, username: user.username } };
      res.status(200).json(body);
    } catch (error) {
      next(error);
    }
  },
);

authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(env.cookie.authCookieName, authCookieOptions());
  res.status(204).end();
});
