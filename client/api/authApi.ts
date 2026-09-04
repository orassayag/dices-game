import {
  AuthResponseSchema,
  type AuthCredentialsInput,
  type AuthResponse,
} from '../../shared/index';
import { apiRequest } from './apiClient';

/**
 * Issues the pre-auth CSRF cookie (I9) — must be called, and awaited, before the first
 * register/login submission so the browser has a token to echo back in the request header.
 */
export async function fetchCsrfToken(): Promise<void> {
  await apiRequest('/auth/csrf', { method: 'GET' });
}

export async function register(credentials: AuthCredentialsInput): Promise<AuthResponse> {
  const body = await apiRequest('/auth/register', { method: 'POST', body: credentials });
  return AuthResponseSchema.parse(body);
}

export async function login(credentials: AuthCredentialsInput): Promise<AuthResponse> {
  const body = await apiRequest('/auth/login', { method: 'POST', body: credentials });
  return AuthResponseSchema.parse(body);
}

/**
 * Restores the session from the HttpOnly auth cookie alone (bug fix: a page reload was
 * logging the user out because the app never checked for an existing session). Rejects
 * with an `ApiError('UNAUTHORIZED', ...)` when there is no valid session — the caller
 * treats that as "not logged in", not as an error to surface.
 */
export async function getCurrentUser(): Promise<AuthResponse> {
  const body = await apiRequest('/auth/me', { method: 'GET' });
  return AuthResponseSchema.parse(body);
}

export async function logout(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' });
}
