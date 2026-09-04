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

// Body size cap (§10) — an oversized JSON body is rejected by express.json() itself,
// before it ever reaches a route handler (or bcrypt, on the auth routes).
const JSON_BODY_LIMIT: string = '16kb';

export function createApp() {
  const app = express();
  // This is a directly-exposed single instance (no reverse proxy in front) — Express
  // must not trust any X-Forwarded-For header, or the auth/gameplay rate limiters
  // (server/routes/auth.ts) could be bypassed by forging one (§10).
  app.set('trust proxy', false);
  // Default CSP img-src ('self' data:) blocks the pravatar.cc player avatars and the
  // fixed AI opponent avatar — allow both exact hosts explicitly rather than widening
  // img-src to any origin.
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
  // Credentialed CORS pinned to an exact origin — never '*' (credentialed CORS forbids
  // the wildcard). Required even in production's same-origin static-serving mode below,
  // because dev always runs client:5173/server:3000 as separate origins, and the CSRF
  // Origin check (added at M1b) reuses this same FRONTEND_URL allowlist.
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/games', gamesRouter);

  // ai-turn lands at M5 (server/routes/games.ts or a sibling router).

  // In production the server is the single deployment unit: it serves the
  // Vite-built client alongside the API. In dev, Vite serves the client.
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

  // Reached only for a request the production block above didn't serve the SPA shell
  // for (i.e. any /api path with no matching route, in every env).
  app.use(routeNotFoundHandler);
  app.use(errorHandler);
  return app;
}
