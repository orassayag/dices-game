import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { CreateGameInput, ExpectedVersionInput } from '../../shared/index.js';
import {
  CreateGameInputSchema,
  ExpectedVersionSchema,
  ListGamesQuerySchema,
} from '../../shared/index.js';
import { RateLimitedError } from '../lib/errors.js';
import { requireAuth, requireUserId } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createGame,
  getGame,
  holdGame,
  listInProgressGames,
  rollGame,
} from '../services/gameService.js';
import { aiTurnGame } from '../services/ai/aiTurnService.js';

export const gamesRouter: Router = Router();

gamesRouter.use(requireAuth);

type GameIdParams = { id: string };
type CreateGameRequest = Request<Record<string, never>, unknown, CreateGameInput>;
type GameActionRequest = Request<GameIdParams, unknown, ExpectedVersionInput>;

function rejectWithRateLimitedError(_req: Request, _res: Response, next: NextFunction): void {
  next(new RateLimitedError('Too many requests. Please try again later.'));
}

const GAMEPLAY_RATE_LIMIT_WINDOW_MS: number = 60 * 1000;
const GAMEPLAY_RATE_LIMIT_MAX_REQUESTS: number = 60;

export const gameplayRateLimiter = rateLimit({
  windowMs: GAMEPLAY_RATE_LIMIT_WINDOW_MS,
  limit: GAMEPLAY_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => requireUserId(req),
  handler: rejectWithRateLimitedError,
});

gamesRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = ListGamesQuerySchema.parse(req.query);
    const games = await listInProgressGames(requireUserId(req), query.limit);
    res.status(200).json(games);
  } catch (error) {
    next(error);
  }
});

gamesRouter.post(
  '/',
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
  gameplayRateLimiter,
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
  gameplayRateLimiter,
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

gamesRouter.post(
  '/:id/ai-turn',
  gameplayRateLimiter,
  validateBody(ExpectedVersionSchema),
  async (req: GameActionRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const game = await aiTurnGame(req.params.id, requireUserId(req), req.body.expectedVersion);
      res.status(200).json(game);
    } catch (error) {
      next(error);
    }
  },
);
