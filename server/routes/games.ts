// Game routes (plan_v6.md §5, happy-path subset — M3a). Every route requires auth;
// every state-changing route is also CSRF-guarded, matching the auth routes' wiring
// (server/routes/auth.ts). Routes parse/dispatch only — all rules live in gameService.

import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import type { CreateGameInput, ExpectedVersionInput } from '../../shared/index.js';
import { CreateGameInputSchema, ExpectedVersionSchema } from '../../shared/index.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { validateBody } from '../middleware/validate.js';
import { createGame, getGame, holdGame, rollGame } from '../services/gameService.js';

export const gamesRouter: Router = Router();

// Every route below requires a session; csrfProtection (added per-route) needs
// req.userId to already be set for its user-bound HMAC check, so this must run first.
gamesRouter.use(requireAuth);

type GameIdParams = { id: string };
type CreateGameRequest = Request<Record<string, never>, unknown, CreateGameInput>;
type GameActionRequest = Request<GameIdParams, unknown, ExpectedVersionInput>;

// requireAuth (mounted above) always sets req.userId before any handler here runs;
// this guard only protects against a future reordering mistake, not a real user path.
function requireUserId(req: Request): string {
  const userId = req.userId;
  if (!userId) {
    throw new Error('NO_USER_ID_ON_REQUEST — requireAuth must run before this handler.');
  }
  return userId;
}

gamesRouter.post(
  '/',
  csrfProtection,
  validateBody(CreateGameInputSchema),
  async (req: CreateGameRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await createGame(requireUserId(req), req.body);
      res.status(201).json(game);
    } catch (error) {
      next(error);
    }
  },
);

gamesRouter.get(
  '/:id',
  async (req: Request<GameIdParams>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await getGame(req.params.id, requireUserId(req));
      res.status(200).json(game);
    } catch (error) {
      next(error);
    }
  },
);

gamesRouter.post(
  '/:id/roll',
  csrfProtection,
  validateBody(ExpectedVersionSchema),
  async (req: GameActionRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await rollGame(req.params.id, requireUserId(req), req.body.expectedVersion);
      res.status(200).json(game);
    } catch (error) {
      next(error);
    }
  },
);

gamesRouter.post(
  '/:id/hold',
  csrfProtection,
  validateBody(ExpectedVersionSchema),
  async (req: GameActionRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await holdGame(req.params.id, requireUserId(req), req.body.expectedVersion);
      res.status(200).json(game);
    } catch (error) {
      next(error);
    }
  },
);
