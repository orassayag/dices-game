// @vitest-environment node
// Deliberately its own file: the register rate limiter is a module-level singleton
// shared by every createApp() call, and this test exhausts its entire quota — sharing a
// file with a test that needs /auth/register to keep succeeding would make it order-dependent.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import { fetchPreAuthCsrf, withCsrfHeaders } from '../../__tests__/helpers/csrf.js';

const REGISTER_LIMIT: number = 10;

describe('POST /auth/register rate limit (§10)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should allow up to the limit and 429 the request after it, from the same IP', async () => {
    const app = createApp();
    for (let i = 0; i < REGISTER_LIMIT; i += 1) {
      const csrf = await fetchPreAuthCsrf(app);
      const response = await withCsrfHeaders(request(app).post('/auth/register'), csrf).send({
        username: `user-${i}`,
        password: 'a valid password 1',
      });
      expect(response.status).toBe(201);
    }
    const overLimitCsrf = await fetchPreAuthCsrf(app);
    const overLimit = await withCsrfHeaders(
      request(app).post('/auth/register'),
      overLimitCsrf,
    ).send({
      username: 'user-overflow',
      password: 'a valid password 1',
    });
    expect(overLimit.status).toBe(429);
    expect(overLimit.body.error.code).toBe('RATE_LIMITED');
  });
});
