import type { Express } from 'express';
import request from 'supertest';

// Matches vitest.setup.server.ts's FRONTEND_URL — the Origin every CSRF-guarded test
// request must present to pass csrfProtection's allowlist check (server/middleware/csrf.ts).
export const TEST_FRONTEND_ORIGIN: string = 'http://localhost:5173';
export const CSRF_HEADER_NAME: string = 'X-CSRF-Token';

// Outside production env.cookie.csrfCookieName is the plain 'csrfToken' name (the
// `__Host-` prefix only applies when NODE_ENV=production — see server/config/env.ts);
// tests run with NODE_ENV=test, so this matches what the server actually sets.
const CSRF_COOKIE_NAME: string = 'csrfToken';

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

export interface CsrfContext {
  token: string;
  cookieHeader: string;
}

// Fetches a pre-auth CSRF token the way a real client would before submitting
// login/register (I9, plan_v6.md §5/§10) — every CSRF-guarded pre-auth request in tests
// needs this pairing plus a matching Origin header (see withCsrfHeaders below).
export async function fetchPreAuthCsrf(app: Express): Promise<CsrfContext> {
  const response = await request(app).get('/auth/csrf');
  const token = extractCookieValue(extractSetCookieHeaders(response), CSRF_COOKIE_NAME);
  return { token, cookieHeader: `${CSRF_COOKIE_NAME}=${token}` };
}

// Attaches the Origin + X-CSRF-Token header + cookie a CSRF-guarded request needs.
// `extraCookieHeader` lets a caller also attach the auth cookie (e.g. for logout),
// since supertest's `.set('Cookie', ...)` replaces rather than merges.
export function withCsrfHeaders(
  req: request.Test,
  csrf: CsrfContext,
  extraCookieHeader?: string,
): request.Test {
  const cookieHeader = extraCookieHeader
    ? `${extraCookieHeader}; ${csrf.cookieHeader}`
    : csrf.cookieHeader;
  return req
    .set('Origin', TEST_FRONTEND_ORIGIN)
    .set(CSRF_HEADER_NAME, csrf.token)
    .set('Cookie', cookieHeader);
}
