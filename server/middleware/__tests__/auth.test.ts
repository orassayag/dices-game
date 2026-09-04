// @vitest-environment node
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { signAuthToken } from '../../lib/authCrypto.js';
import prisma from '../../db.js';
import { errorHandler } from '../errorHandler.js';
import { requireAuth } from '../auth.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';

// A minimal app exercising requireAuth in isolation — no protected route exists yet
// (game routes land at M3, stage 5), so this stands in for the eventual mount point.
function buildProtectedApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.status(200).json({ userId: req.userId });
  });
  app.use(errorHandler);
  return app;
}

describe('requireAuth', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should reject a request with no auth cookie', async () => {
    const app = buildProtectedApp();
    const response = await request(app).get('/protected');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject a garbage cookie value', async () => {
    const app = buildProtectedApp();
    const response = await request(app)
      .get('/protected')
      .set('Cookie', `${env.cookie.authCookieName}=not-a-real-jwt`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should accept a valid token whose tokenVersion matches the DB', async () => {
    const user = await prisma.user.create({
      data: { username: 'alice', usernameKey: 'alice', passwordHash: 'x' },
    });
    const token = signAuthToken({ sub: user.id, tokenVersion: user.tokenVersion });
    const app = buildProtectedApp();
    const response = await request(app)
      .get('/protected')
      .set('Cookie', `${env.cookie.authCookieName}=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(user.id);
  });

  it('should reject a token whose tokenVersion is behind the user current value', async () => {
    const user = await prisma.user.create({
      data: { username: 'bob', usernameKey: 'bob', passwordHash: 'x', tokenVersion: 5 },
    });
    const staleToken = signAuthToken({ sub: user.id, tokenVersion: 0 });
    const app = buildProtectedApp();
    const response = await request(app)
      .get('/protected')
      .set('Cookie', `${env.cookie.authCookieName}=${staleToken}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should reject a token for a user that no longer exists', async () => {
    const token = signAuthToken({ sub: 'deleted-user-id', tokenVersion: 0 });
    const app = buildProtectedApp();
    const response = await request(app)
      .get('/protected')
      .set('Cookie', `${env.cookie.authCookieName}=${token}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 503 SERVICE_UNAVAILABLE when the tokenVersion lookup throws (I8)', async () => {
    const user = await prisma.user.create({
      data: { username: 'carol', usernameKey: 'carol', passwordHash: 'x' },
    });
    const token = signAuthToken({ sub: user.id, tokenVersion: user.tokenVersion });
    const findUniqueSpy = vi
      .spyOn(prisma.user, 'findUnique')
      .mockRejectedValueOnce(new Error('connection refused'));

    const app = buildProtectedApp();
    const response = await request(app)
      .get('/protected')
      .set('Cookie', `${env.cookie.authCookieName}=${token}`);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    findUniqueSpy.mockRestore();
  });
});
