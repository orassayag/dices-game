// @vitest-environment node
// Own file so its registrations don't push games.test.ts's register calls over the
// auth register rate limiter's ceiling — each test file gets its own untouched
// module-level counter.
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import { authedGet, authedPost, registerTestUser } from '../../__tests__/helpers/authedSession.js';

describe('GET /games', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("should return the owner's in-progress game", async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'ursula');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    const response = await authedGet(app, '/games?status=in_progress', session);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(created.body.id);
  });

  it('should return an empty array when the owner has no in-progress game', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'victor');

    const response = await authedGet(app, '/games?status=in_progress', session);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should reject a request missing the required status query param', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'wendy');

    const response = await authedGet(app, '/games', session);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });
});

describe('GET /games/leaderboard', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should return the registered seat names, not match "leaderboard" as a game id', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'xena');
    await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
      p1Name: 'Ryan Mitchell',
      p2Name: 'James Carter',
    });

    const response = await authedGet(app, '/games/leaderboard', session);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { name: 'James Carter', wins: 0 },
      { name: 'Ryan Mitchell', wins: 0 },
    ]);
  });

  it('should scope the leaderboard to the requesting owner', async () => {
    const app = createApp();
    const owner = await registerTestUser(app, 'yolanda');
    await authedPost(app, '/games', owner).send({
      targetScore: 100,
      mode: 'human',
      p1Name: 'Ryan Mitchell',
      p2Name: 'James Carter',
    });
    const other = await registerTestUser(app, 'zack');

    const response = await authedGet(app, '/games/leaderboard', other);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
