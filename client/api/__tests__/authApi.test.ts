import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '../apiClient';
import { getCurrentUser, login, logout, register } from '../authApi';

describe('authApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST credentials to /auth/register and parse the response', async () => {
    const spy = vi
      .spyOn(apiClient, 'apiRequest')
      .mockResolvedValue({ user: { id: '1', username: 'alice' } });

    const result = await register({ username: 'alice', password: 'password123' });

    expect(spy).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { username: 'alice', password: 'password123' },
    });
    expect(result).toEqual({ user: { id: '1', username: 'alice' } });
  });

  it('should POST credentials to /auth/login and parse the response', async () => {
    const spy = vi
      .spyOn(apiClient, 'apiRequest')
      .mockResolvedValue({ user: { id: '2', username: 'bob' } });

    const result = await login({ username: 'bob', password: 'password123' });

    expect(spy).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { username: 'bob', password: 'password123' },
    });
    expect(result.user.username).toBe('bob');
  });

  it('should GET /auth/me and parse the current user', async () => {
    const spy = vi
      .spyOn(apiClient, 'apiRequest')
      .mockResolvedValue({ user: { id: '3', username: 'carol' } });

    const result = await getCurrentUser();

    expect(spy).toHaveBeenCalledWith('/auth/me', { method: 'GET' });
    expect(result.user.id).toBe('3');
  });

  it('should POST /auth/logout', async () => {
    const spy = vi.spyOn(apiClient, 'apiRequest').mockResolvedValue(undefined);

    await logout();

    expect(spy).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
  });
});
