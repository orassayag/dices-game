import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../api/authApi';
import { ApiError } from '../../api/apiClient';
import { useCurrentUserSession } from '../useCurrentUserSession';

describe('useCurrentUserSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load the current user and clear checkingSession', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      user: { id: '1', username: 'alice' },
    });
    const { result } = renderHook(() => useCurrentUserSession());

    expect(result.current.checkingSession).toBe(true);
    await waitFor(() => expect(result.current.checkingSession).toBe(false));
    expect(result.current.user).toEqual({ id: '1', username: 'alice' });
  });

  it('should set user to null when the session check fails', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockRejectedValue(
      new ApiError('UNAUTHORIZED', 'no session', 401),
    );
    const { result } = renderHook(() => useCurrentUserSession());

    await waitFor(() => expect(result.current.checkingSession).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('should let a caller replace the user via setUser', async () => {
    vi.spyOn(authApi, 'getCurrentUser').mockResolvedValue({
      user: { id: '1', username: 'alice' },
    });
    const { result } = renderHook(() => useCurrentUserSession());
    await waitFor(() => expect(result.current.checkingSession).toBe(false));

    act(() => result.current.setUser(null));
    expect(result.current.user).toBeNull();
  });
});
