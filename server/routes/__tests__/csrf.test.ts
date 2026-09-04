// @vitest-environment node
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import {
  extractCookieValue,
  extractSetCookieHeaders,
  fetchPreAuthCsrf,
  TEST_FRONTEND_ORIGIN,
  withCsrfHeaders,
} from '../../__tests__/helpers/csrf.js';

const CREDENTIALS = { username: 'alice', password: 'correct horse battery staple' };

describe('GET /auth/csrf', () => {
  it('should set a csrfToken cookie and return 204', async () => {
    const app = createApp();
    const response = await request(app).get('/auth/csrf');
    expect(response.status).toBe(204);
    const setCookie = extractSetCookieHeaders(response);
    expect(setCookie.some((cookie) => cookie.startsWith('csrfToken='))).toBe(true);
  });
});

describe('CSRF-guarded auth routes (I3, I9)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should reject POST /auth/login with no CSRF token at all (login-CSRF, I9)', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/auth/login')
      .set('Origin', TEST_FRONTEND_ORIGIN)
      .send(CREDENTIALS);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject POST /auth/register with no CSRF token', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/auth/register')
      .set('Origin', TEST_FRONTEND_ORIGIN)
      .send(CREDENTIALS);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a mismatched X-CSRF-Token header vs. cookie on login', async () => {
    const app = createApp();
    const csrf = await fetchPreAuthCsrf(app);
    const response = await request(app)
      .post('/auth/login')
      .set('Origin', TEST_FRONTEND_ORIGIN)
      .set('X-CSRF-Token', 'a-completely-different-token')
      .set('Cookie', csrf.cookieHeader)
      .send(CREDENTIALS);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should reject a cross-origin Origin header on login regardless of a valid token', async () => {
    const app = createApp();
    const csrf = await fetchPreAuthCsrf(app);
    const response = await request(app)
      .post('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('X-CSRF-Token', csrf.token)
      .set('Cookie', csrf.cookieHeader)
      .send(CREDENTIALS);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should accept register with a valid pre-auth CSRF token + matching Origin', async () => {
    const app = createApp();
    const csrf = await fetchPreAuthCsrf(app);
    const response = await withCsrfHeaders(request(app).post('/auth/register'), csrf).send(
      CREDENTIALS,
    );
    expect(response.status).toBe(201);
  });

  it('should rotate the CSRF cookie to a user-bound token on successful login', async () => {
    const app = createApp();
    const registerCsrf = await fetchPreAuthCsrf(app);
    await withCsrfHeaders(request(app).post('/auth/register'), registerCsrf).send(CREDENTIALS);

    const loginCsrf = await fetchPreAuthCsrf(app);
    const loginResponse = await withCsrfHeaders(request(app).post('/auth/login'), loginCsrf).send(
      CREDENTIALS,
    );
    expect(loginResponse.status).toBe(200);

    const rotatedToken = extractCookieValue(extractSetCookieHeaders(loginResponse), 'csrfToken');
    expect(rotatedToken).not.toBe(loginCsrf.token);
  });

  it('should reject logout with no auth cookie (requireAuth runs before csrfProtection)', async () => {
    const app = createApp();
    const csrf = await fetchPreAuthCsrf(app);
    const response = await withCsrfHeaders(request(app).post('/auth/logout'), csrf);
    expect(response.status).toBe(401);
  });

  it('should reject logout with a CSRF token bound to a different user (I3)', async () => {
    const app = createApp();
    const registerCsrf = await fetchPreAuthCsrf(app);
    const registerResponse = await withCsrfHeaders(
      request(app).post('/auth/register'),
      registerCsrf,
    ).send(CREDENTIALS);
    const authCookie = extractCookieValue(extractSetCookieHeaders(registerResponse), 'token');

    const attackerCsrf = await fetchPreAuthCsrf(app);
    const attackerRegisterResponse = await withCsrfHeaders(
      request(app).post('/auth/register'),
      attackerCsrf,
    ).send({
      username: 'mallory',
      password: 'another valid password',
    });
    const attackerCsrfToken = extractCookieValue(
      extractSetCookieHeaders(attackerRegisterResponse),
      'csrfToken',
    );

    const response = await request(app)
      .post('/auth/logout')
      .set('Origin', TEST_FRONTEND_ORIGIN)
      .set('X-CSRF-Token', attackerCsrfToken)
      .set('Cookie', `token=${authCookie}; csrfToken=${attackerCsrfToken}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('should log out with a valid auth cookie + matching user-bound CSRF token, clearing both cookies', async () => {
    const app = createApp();
    const registerCsrf = await fetchPreAuthCsrf(app);
    const registerResponse = await withCsrfHeaders(
      request(app).post('/auth/register'),
      registerCsrf,
    ).send(CREDENTIALS);
    const registerHeaders = extractSetCookieHeaders(registerResponse);
    const authCookie = extractCookieValue(registerHeaders, 'token');
    const userCsrfToken = extractCookieValue(registerHeaders, 'csrfToken');

    const response = await request(app)
      .post('/auth/logout')
      .set('Origin', TEST_FRONTEND_ORIGIN)
      .set('X-CSRF-Token', userCsrfToken)
      .set('Cookie', `token=${authCookie}; csrfToken=${userCsrfToken}`);

    expect(response.status).toBe(204);
    const setCookie = extractSetCookieHeaders(response);
    expect(setCookie.some((cookie) => cookie.startsWith('token=;'))).toBe(true);
    expect(setCookie.some((cookie) => cookie.startsWith('csrfToken=;'))).toBe(true);
  });
});
