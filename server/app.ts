import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { itemsRouter } from './routes/items.js';
import { errorHandler } from './middleware/errorHandler.js';

const clientDistDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/client');

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json());
  app.use('/api/items', itemsRouter);

  // In production the server is the single deployment unit: it serves the
  // Vite-built client alongside the API. In dev, Vite serves the client.
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(clientDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
