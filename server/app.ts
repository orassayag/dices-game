import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, routeNotFoundHandler } from './middleware/errorHandler.js';

const clientDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  // Credentialed CORS pinned to an exact origin — never '*' (credentialed CORS forbids
  // the wildcard). Required even in production's same-origin static-serving mode below,
  // because dev always runs client:5173/server:3000 as separate origins, and the CSRF
  // Origin check (added at M1b) reuses this same FRONTEND_URL allowlist.
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Route handlers land here at M1/M3/M5 (auth, game, ai-turn).

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
