// @vitest-environment node
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('createApp', () => {
  it('should expose a health endpoint', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('should respond with a ROUTE_NOT_FOUND envelope for an unknown route', async () => {
    const response = await request(createApp()).get('/definitely-not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('should reject a malformed JSON body with INVALID_INPUT', async () => {
    const response = await request(createApp())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not valid json');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });
});
