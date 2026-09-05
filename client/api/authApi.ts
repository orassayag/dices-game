import {
  AuthResponseSchema,
  type AuthCredentialsInput,
  type AuthResponse,
} from '../../shared/index';
import { apiRequest } from './apiClient';

export async function register(credentials: AuthCredentialsInput): Promise<AuthResponse> {
  const body = await apiRequest('/auth/register', { method: 'POST', body: credentials });
  return AuthResponseSchema.parse(body);
}

export async function login(credentials: AuthCredentialsInput): Promise<AuthResponse> {
  const body = await apiRequest('/auth/login', { method: 'POST', body: credentials });
  return AuthResponseSchema.parse(body);
}

// Rejects with ApiError('UNAUTHORIZED', ...) when there is no valid session — the caller
// treats that as "not logged in", not as an error to surface.
export async function getCurrentUser(): Promise<AuthResponse> {
  const body = await apiRequest('/auth/me', { method: 'GET' });
  return AuthResponseSchema.parse(body);
}

export async function logout(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' });
}
