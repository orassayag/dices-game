// @vitest-environment node
// Own file: the login rate limiter is a module-level singleton, and these tests
// deliberately exhaust one of its per-(ip, username) buckets.
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';

const LOGIN_LIMIT: number = 5;
const CREDENTIALS = { username: 'alice', password: 'correct horse battery staple' };

async function attemptLogin(app: ReturnType<typeof createApp>, body: Record<string, unknown>) {
  return await request(app).post('/auth/login').send(body);
}

describe('POST /auth/login rate limit (§10)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should 429 the request after the limit for one (ip, username) pair, without affecting a different username', async () => {
    const app = createApp();
    await request(app).post('/auth/register').send(CREDENTIALS);

    for (let i = 0; i < LOGIN_LIMIT; i += 1) {
      const response = await attemptLogin(app, { username: 'alice', password: 'wrong password' });
      expect(response.status).toBe(401);
    }
    const overLimit = await attemptLogin(app, { username: 'alice', password: 'wrong password' });
    expect(overLimit.status).toBe(429);
    expect(overLimit.body.error.code).toBe('RATE_LIMITED');

    const otherUsername = await attemptLogin(app, {
      username: 'someone-else',
      password: 'wrong password',
    });
    expect(otherUsername.status).toBe(401);
  });

  it('should key on the real socket address, ignoring a forged X-Forwarded-For (trust proxy = false)', async () => {
    const app = createApp();

    for (let i = 0; i < LOGIN_LIMIT; i += 1) {
      await request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ username: 'ip-test', password: 'wrong' });
    }
    const overLimit = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ username: 'ip-test', password: 'wrong' });
    expect(overLimit.status).toBe(429);
  });
});
