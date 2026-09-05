import type { Express } from 'express';
import request from 'supertest';
import { env } from '../../config/env.js';

export interface TestSession {
  userId: string;
  cookieHeader: string;
}

// supertest types `set-cookie` as `string | string[] | undefined`.
export function extractSetCookieHeaders(response: request.Response): string[] {
  const raw: unknown = response.headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  return [];
}

export function extractCookieValue(setCookieHeaders: string[], cookieName: string): string {
  const pair = setCookieHeaders
    .map((header) => header.split(';')[0] ?? '')
    .find((candidate) => candidate.startsWith(`${cookieName}=`));
  if (pair === undefined) {
    throw new Error(`Expected a "${cookieName}" cookie among the response's Set-Cookie headers.`);
  }
  return pair.slice(cookieName.length + 1);
}

export async function registerTestUser(app: Express, username: string): Promise<TestSession> {
  const response = await request(app).post('/auth/register').send({
    username,
    password: 'correct horse battery staple',
  });
  const authToken = extractCookieValue(extractSetCookieHeaders(response), env.cookie.authCookieName);
  return {
    userId: (response.body as { user: { id: string } }).user.id,
    cookieHeader: `${env.cookie.authCookieName}=${authToken}`,
  };
}

export function authedGet(app: Express, path: string, session: TestSession): request.Test {
  return request(app).get(path).set('Cookie', session.cookieHeader);
}

export function authedPost(app: Express, path: string, session: TestSession): request.Test {
  return request(app).post(path).set('Cookie', session.cookieHeader);
}
