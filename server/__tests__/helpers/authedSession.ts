import type { Express } from 'express';
import request from 'supertest';
import { env } from '../../config/env.js';
import {
  CSRF_HEADER_NAME,
  TEST_FRONTEND_ORIGIN,
  extractCookieValue,
  extractSetCookieHeaders,
  fetchPreAuthCsrf,
  withCsrfHeaders,
} from './csrf.js';

// Shared by every route-level test suite that needs a real authenticated + CSRF-bound
// session (game routes, gameplay rate limiting, …) — extracted once two suites needed
// the identical register-then-build-a-session flow.
export interface TestSession {
  userId: string;
  cookieHeader: string;
  csrfToken: string;
}

export async function registerTestUser(app: Express, username: string): Promise<TestSession> {
  const preAuthCsrf = await fetchPreAuthCsrf(app);
  const response = await withCsrfHeaders(request(app).post('/auth/register'), preAuthCsrf).send({
    username,
    password: 'correct horse battery staple',
  });
  const setCookie = extractSetCookieHeaders(response);
  const authToken = extractCookieValue(setCookie, env.cookie.authCookieName);
  const csrfToken = extractCookieValue(setCookie, env.cookie.csrfCookieName);
  return {
    userId: (response.body as { user: { id: string } }).user.id,
    cookieHeader: `${env.cookie.authCookieName}=${authToken}; ${env.cookie.csrfCookieName}=${csrfToken}`,
    csrfToken,
  };
}

export function authedGet(app: Express, path: string, session: TestSession): request.Test {
  return request(app).get(path).set('Cookie', session.cookieHeader);
}

export function authedPost(app: Express, path: string, session: TestSession): request.Test {
  return request(app)
    .post(path)
    .set('Origin', TEST_FRONTEND_ORIGIN)
    .set(CSRF_HEADER_NAME, session.csrfToken)
    .set('Cookie', session.cookieHeader);
}
