import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AuthCredentialsInput, AuthResponse } from '../../shared/index.js';
import { AuthCredentialsInputSchema } from '../../shared/index.js';
import { env } from '../config/env.js';
import { AUTH_TOKEN_LIFETIME_SECONDS, normalizeUsernameKey } from '../lib/authCrypto.js';
import { RateLimitedError } from '../lib/errors.js';
import { requireAuth, requireUserId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  getAuthenticatedUser,
  loginUser,
  registerUser,
  revokeUserSessions,
} from '../services/authService.js';

// `trust proxy` (server/app.ts) is set so `req.ip` is the real client IP — the socket
// address when directly exposed, the single trusted proxy hop on Vercel — so neither
// limiter below can be bypassed by a forged X-Forwarded-For header.
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

// Keyed on ip + username, not username alone — a username-only lockout would let an
// attacker lock a victim out by repeatedly failing their login.
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

authRouter.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await revokeUserSessions(requireUserId(req));
      res.clearCookie(env.cookie.authCookieName, authCookieOptions());
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);
