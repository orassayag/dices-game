import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent } from 'react';
import { ApiError } from '../../api/apiClient';
import * as authApi from '../../api/authApi';
import { useAuthForm } from '../useAuthForm';

function submitEvent(): FormEvent<HTMLFormElement> {
  return { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;
}

describe('useAuthForm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should require a username and password', async () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(result.current.fieldErrors.username).toBe('Username is required.');
    expect(result.current.fieldErrors.password).toBe('Password is required.');
    expect(result.current.usernameShakeKey).toBe(1);
    expect(result.current.passwordShakeKey).toBe(1);
  });

  it('should reject a too-short username', async () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('ab');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(result.current.fieldErrors.username).toMatch(/at least 3 characters/);
  });

  it('should enforce password rules only in register mode', async () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => result.current.switchMode());
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('short');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(result.current.fieldErrors.password).toMatch(/at least 8 characters/);
  });

  it('should require a letter and a number in register mode', async () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => result.current.switchMode());
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('allletters');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(result.current.fieldErrors.password).toMatch(/one letter and one number/);
  });

  it('should log in a valid user', async () => {
    const onAuthenticated = vi.fn();
    vi.spyOn(authApi, 'login').mockResolvedValue({ user: { id: '1', username: 'alice' } });
    const { result } = renderHook(() => useAuthForm({ onAuthenticated }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(onAuthenticated).toHaveBeenCalledWith({ id: '1', username: 'alice' });
  });

  it('should register a valid user after switching modes', async () => {
    const registerSpy = vi
      .spyOn(authApi, 'register')
      .mockResolvedValue({ user: { id: '2', username: 'bob' } });
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => result.current.switchMode());
    act(() => {
      result.current.handleUsernameChange('bob');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(registerSpy).toHaveBeenCalled();
  });

  it('should map INVALID_CREDENTIALS to a friendly message', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'nope', 401),
    );
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Invalid username or password.'),
    );
  });

  it('should map RATE_LIMITED to a friendly message', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError('RATE_LIMITED', 'slow', 429));
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    await waitFor(() =>
      expect(result.current.errorMessage).toMatch(/Too many attempts/),
    );
  });

  it('should pass through other ApiError messages', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError('FORBIDDEN', 'denied', 403));
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    await waitFor(() => expect(result.current.errorMessage).toBe('denied'));
  });

  it('should show a generic message for non-ApiError failures', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Something went wrong. Please try again.'),
    );
  });

  it('should toggle password visibility and reset it on mode switch', () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => result.current.toggleShowPassword());
    expect(result.current.showPassword).toBe(true);

    act(() => result.current.switchMode());
    expect(result.current.showPassword).toBe(false);
    expect(result.current.mode).toBe('register');
  });

  it('should clear a submit error message when switching mode', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('INVALID_CREDENTIALS', 'nope', 401),
    );
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('alice');
      result.current.handlePasswordChange('password123');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    await waitFor(() =>
      expect(result.current.errorMessage).toBe('Invalid username or password.'),
    );

    act(() => result.current.switchMode());

    expect(result.current.errorMessage).toBeNull();
  });

  it('should clear field errors when switching mode', async () => {
    const { result } = renderHook(() => useAuthForm({ onAuthenticated: vi.fn() }));
    act(() => {
      result.current.handleUsernameChange('ab');
    });
    await act(async () => {
      await result.current.handleSubmit(submitEvent());
    });
    expect(result.current.fieldErrors.username).toMatch(/at least 3 characters/);

    act(() => result.current.switchMode());

    expect(result.current.fieldErrors.username).toBeUndefined();
  });
});
