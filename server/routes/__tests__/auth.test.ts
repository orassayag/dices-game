// @vitest-environment node
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import * as authCrypto from '../../lib/authCrypto.js';
import {
  authedGet,
  extractSetCookieHeaders,
  registerTestUser,
} from '../../__tests__/helpers/authedSession.js';

const CREDENTIALS = { username: 'alice', password: 'correct horse battery staple' };

async function register(
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown> = CREDENTIALS,
) {
  return await request(app).post('/auth/register').send(body);
}

async function login(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  return await request(app).post('/auth/login').send(body);
}

describe('POST /auth/register', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should create a user and set the auth cookie', async () => {
    const app = createApp();
    const response = await register(app);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ user: { id: expect.any(String), username: 'alice' } });
    const setCookie = extractSetCookieHeaders(response);
    expect(setCookie.some((cookie) => cookie.startsWith('token='))).toBe(true);
  });

  it('should reject a duplicate username (case/whitespace-insensitive)', async () => {
    const app = createApp();
    await register(app);
    const response = await register(app, {
      username: '  Alice  ',
      password: 'another valid password',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('should reject a password under the minimum length', async () => {
    const app = createApp();
    const response = await register(app, { username: 'bob', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('should reject a body with unknown extra fields', async () => {
    const app = createApp();
    const response = await register(app, { ...CREDENTIALS, isAdmin: true });
    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should log in with correct credentials and set the auth cookie', async () => {
    const app = createApp();
    await register(app);

    const response = await login(app, CREDENTIALS);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: expect.any(String), username: 'alice' } });
  });

  it('should return a generic INVALID_CREDENTIALS for a wrong password', async () => {
    const app = createApp();
    await register(app);

    const response = await login(app, { username: 'alice', password: 'totally wrong password' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return the same generic INVALID_CREDENTIALS for a nonexistent username', async () => {
    const app = createApp();
    const response = await login(app, {
      username: 'nobody-registered',
      password: 'whatever password',
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should invoke bcrypt.compare exactly once for a nonexistent username (constant-time login)', async () => {
    const compareSpy = vi.spyOn(authCrypto, 'verifyPassword');
    const app = createApp();
    await login(app, { username: 'nobody-registered', password: 'whatever password' });
    expect(compareSpy).toHaveBeenCalledTimes(1);
    compareSpy.mockRestore();
  });
});

describe('POST /auth/logout', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should reject logout with no auth cookie', async () => {
    const app = createApp();
    const response = await request(app).post('/auth/logout');
    expect(response.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should return the current user for a valid auth cookie (remember-me on reload)', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'alice');

    const response = await authedGet(app, '/auth/me', session);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: session.userId, username: 'alice' } });
  });

  it('should reject with 401 when there is no auth cookie', async () => {
    const app = createApp();
    const response = await request(app).get('/auth/me');
    expect(response.status).toBe(401);
  });
});

// Rate-limit tests live in their own files: the limiters are module-level singletons
// shared by every createApp() call within one test FILE's module graph, so a test that
// deliberately exhausts a quota must not share a file with tests that need requests to
// keep succeeding.
