// @vitest-environment node
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import * as authCrypto from '../../lib/authCrypto.js';

const CREDENTIALS = { username: 'alice', password: 'correct horse battery staple' };

// supertest types `set-cookie` as `string | string[] | undefined` (raw headers can be
// either); tests always send at least one cookie, so normalize to an array up front.
function getSetCookieHeaders(response: request.Response): string[] {
  const raw: unknown = response.headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  throw new Error('Expected a Set-Cookie header on the response.');
}

describe('POST /auth/register', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should create a user and set the auth cookie', async () => {
    const app = createApp();
    const response = await request(app).post('/auth/register').send(CREDENTIALS);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ user: { id: expect.any(String), username: 'alice' } });
    const setCookie = getSetCookieHeaders(response);
    expect(setCookie.some((cookie) => cookie.startsWith('token='))).toBe(true);
  });

  it('should reject a duplicate username (case/whitespace-insensitive)', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(CREDENTIALS);
    const response = await request(app)
      .post('/auth/register')
      .send({ username: '  Alice  ', password: 'another valid password' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('should reject a password under the minimum length', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/auth/register')
      .send({ username: 'bob', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('should reject a body with unknown extra fields', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/auth/register')
      .send({ ...CREDENTIALS, isAdmin: true });
    expect(response.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should log in with correct credentials and set the auth cookie', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(CREDENTIALS);

    const response = await request(app).post('/auth/login').send(CREDENTIALS);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: expect.any(String), username: 'alice' } });
  });

  it('should return a generic INVALID_CREDENTIALS for a wrong password', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(CREDENTIALS);

    const response = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'totally wrong password' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return the same generic INVALID_CREDENTIALS for a nonexistent username', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/auth/login')
      .send({ username: 'nobody-registered', password: 'whatever password' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should invoke bcrypt.compare exactly once for a nonexistent username (constant-time login)', async () => {
    const compareSpy = vi.spyOn(authCrypto, 'verifyPassword');
    const app = createApp();
    await request(app)
      .post('/auth/login')
      .send({ username: 'nobody-registered', password: 'whatever password' });
    expect(compareSpy).toHaveBeenCalledTimes(1);
    compareSpy.mockRestore();
  });
});

describe('POST /auth/logout', () => {
  it('should clear the auth cookie', async () => {
    const app = createApp();
    const response = await request(app).post('/auth/logout');
    expect(response.status).toBe(204);
    const setCookie = getSetCookieHeaders(response);
    expect(setCookie.some((cookie) => cookie.startsWith('token=;'))).toBe(true);
  });
});

// Rate-limit tests live in their own files (authRegisterRateLimit.test.ts,
// authLoginRateLimit.test.ts) — the limiters are module-level singletons shared by
// every createApp() call within one test FILE's module graph, so a test that
// deliberately exhausts a quota must not share a file with tests that need requests
// to keep succeeding. Vitest resets the module graph between test files by default,
// giving each rate-limit file its own untouched counters.
