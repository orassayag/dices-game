// @vitest-environment node
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { truncateAll } from '../../__tests__/helpers/testDb.js';
import { authedGet, authedPost, registerTestUser } from '../../__tests__/helpers/authedSession.js';

describe('POST /games', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should create a game with the correct initial state', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'alice');

    const response = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: 'in_progress',
      currentSeat: 1,
      lastMove: null,
      busted: false,
      lastDice: [],
      roundScore: 0,
      winnerSeat: null,
      version: 0,
    });
  });

  it('should reject an unauthenticated request with 401', async () => {
    const app = createApp();
    const response = await request(app).post('/games').send({ targetScore: 100, mode: 'human' });
    expect(response.status).toBe(401);
  });

  it('should abandon the previous in-progress game when creating a new one (§7)', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'zoe');
    const first = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    const second = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const firstFetched = await authedGet(app, `/games/${first.body.id}`, session);
    expect(firstFetched.body.status).toBe('abandoned');
  });
});

describe('GET /games/:id', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should return the game to its owner', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'carol');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    const response = await authedGet(app, `/games/${created.body.id}`, session);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
  });

  it('should reject a non-owner with 403 FORBIDDEN', async () => {
    const app = createApp();
    const owner = await registerTestUser(app, 'dave');
    const other = await registerTestUser(app, 'erin');
    const created = await authedPost(app, '/games', owner).send({
      targetScore: 100,
      mode: 'human',
    });

    const response = await authedGet(app, `/games/${created.body.id}`, other);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('should return 404 GAME_NOT_FOUND for an unknown id', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'frank');

    const response = await authedGet(app, '/games/does-not-exist', session);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('GAME_NOT_FOUND');
  });
});

describe('POST /games/:id/roll and /games/:id/hold', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('should play a roll then a hold, advancing the version each time', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'grace');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    const rolled = await authedPost(app, `/games/${created.body.id}/roll`, session).send({
      expectedVersion: created.body.version,
    });
    expect(rolled.status).toBe(200);
    expect(rolled.body.version).toBe(created.body.version + 1);
    expect(rolled.body.lastMove.kind).toBe('roll');

    const held = await authedPost(app, `/games/${created.body.id}/hold`, session).send({
      expectedVersion: rolled.body.version,
    });
    expect(held.status).toBe(200);
    expect(held.body.version).toBe(rolled.body.version + 1);
    expect(held.body.roundScore).toBe(0);
  });

  it('should reject a stale expectedVersion with 409 VERSION_CONFLICT', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'heidi');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'human',
    });

    const response = await authedPost(app, `/games/${created.body.id}/roll`, session).send({
      expectedVersion: created.body.version + 1,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('should reject a manual roll on the AI seat with 409 AI_TURN_REQUIRED', async () => {
    const app = createApp();
    const session = await registerTestUser(app, 'ivan');
    const created = await authedPost(app, '/games', session).send({
      targetScore: 100,
      mode: 'ai',
      aiSeat: 1,
    });

    const response = await authedPost(app, `/games/${created.body.id}/roll`, session).send({
      expectedVersion: created.body.version,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('AI_TURN_REQUIRED');
  });
});
