import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, routeNotFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { gamesRouter } from './routes/games.js';

const clientDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');

const JSON_BODY_LIMIT: string = '16kb';

export function createApp() {
  const app = express();
  // Directly-exposed single instance, no reverse proxy in front — Express must not trust
  // any X-Forwarded-For header, or the rate limiters could be bypassed by forging one.
  app.set('trust proxy', false);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'https://i.pravatar.cc', 'https://img.magnific.com'],
        },
      },
    }),
  );
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  // Pinned to an exact origin, never '*' — credentialed CORS forbids the wildcard.
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/games', gamesRouter);

  if (env.isProduction) {
    app.use(express.static(clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  app.use(routeNotFoundHandler);
  app.use(errorHandler);
  return app;
}
