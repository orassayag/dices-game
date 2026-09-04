// @vitest-environment node
// Own file for the same reason as authLoginRateLimit.test.ts: the gameplay rate limiter
// is a module-level singleton, and this test deliberately exhausts a user's bucket.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import { authedPost, registerTestUser } from '../../__tests__/helpers/authedSession.js';

const GAMEPLAY_RATE_LIMIT: number = 60;

describe('gameplay rate limit on roll/hold (§10)', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should 429 a user after 60 gameplay requests in the window, without affecting a different user', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'xena');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 1000,
      mode: 'human',
    });
    let expectedVersion: number = created.body.version;

    for (let i = 0; i < GAMEPLAY_RATE_LIMIT; i += 1) {
      const response = await authedPost(app, `/games/${created.body.id}/roll`, session).send({
        expectedVersion,
      });
      expect(response.status).toBe(200);
      expectedVersion = response.body.version;
    }

    const overLimit = await authedPost(app, `/games/${created.body.id}/roll`, session).send({
      expectedVersion,
    });
    expect(overLimit.status).toBe(429);
    expect(overLimit.body.error.code).toBe('RATE_LIMITED');

    const otherSession = await registerTestUser(app, 'yara');
    const otherCreated = await authedPost(app, '/games', otherSession).send({
      targetScore: 1000,
      mode: 'human',
    });
    const otherResponse = await authedPost(
      app,
      `/games/${otherCreated.body.id}/roll`,
      otherSession,
    ).send({ expectedVersion: otherCreated.body.version });
    expect(otherResponse.status).toBe(200);
  }, 20000);
});
