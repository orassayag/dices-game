// @vitest-environment node
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { generatePreAuthCsrfToken, generateUserBoundCsrfToken } from '../../lib/csrfCrypto.js';
import { errorHandler } from '../errorHandler.js';
import { csrfProtection } from '../csrf.js';

const FRONTEND_ORIGIN: string = 'http://localhost:5173';
const CSRF_HEADER_NAME: string = 'X-CSRF-Token';

// `withAuthenticatedUserId` simulates requireAuth having already run and set req.userId
// — the real ordering requirement is enforced by mounting order in the actual routers,
// not by this middleware itself.
function buildApp(withAuthenticatedUserId?: string): Express {
  const app = express();
  app.use(cookieParser());
  if (withAuthenticatedUserId) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.userId = withAuthenticatedUserId;
      next();
    });
  }
  app.post('/protected', csrfProtection, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/safe', csrfProtection, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('csrfProtection — pre-auth (no req.userId)', () => {
  it('should pass a matching header/cookie/origin trio', async () => {
    const app = buildApp();
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(200);
  });

  it('should not require a token on a GET request', async () => {
    const app = buildApp();
    const response = await request(app).get('/safe');
    expect(response.status).toBe(200);
  });

  it('should reject a missing X-CSRF-Token header', async () => {
    const app = buildApp();
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a header/cookie mismatch', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, generatePreAuthCsrfToken())
      .set('Cookie', `csrfToken=${generatePreAuthCsrfToken()}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a cross-origin Origin header regardless of a valid token', async () => {
    const app = buildApp();
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set('Origin', 'https://evil.example.com')
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should fall back to a same-origin Referer when Origin is absent', async () => {
    const app = buildApp();
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set('Referer', `${FRONTEND_ORIGIN}/login`)
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(200);
  });

  it('should reject when neither Origin nor Referer is present', async () => {
    const app = buildApp();
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a user-bound token presented before authentication', async () => {
    const app = buildApp();
    const token = generateUserBoundCsrfToken('user-1');
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
});

describe('csrfProtection — authenticated (req.userId set)', () => {
  it('should pass a token bound to the authenticated user', async () => {
    const app = buildApp('user-1');
    const token = generateUserBoundCsrfToken('user-1');
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(200);
  });

  it('should reject a token bound to a different user even though header === cookie (I3)', async () => {
    const app = buildApp('victim-id');
    const attackersToken = generateUserBoundCsrfToken('attacker-id');
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, attackersToken)
      .set('Cookie', `csrfToken=${attackersToken}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a pre-auth token once a user is authenticated', async () => {
    const app = buildApp('user-1');
    const token = generatePreAuthCsrfToken();
    const response = await request(app)
      .post('/protected')
      .set('Origin', FRONTEND_ORIGIN)
      .set(CSRF_HEADER_NAME, token)
      .set('Cookie', `csrfToken=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });
});
