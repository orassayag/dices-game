import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../LoginPage';
import { ApiError } from '../../../api/apiClient';
import * as authApi from '../../../api/authApi';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.spyOn(authApi, 'fetchCsrfToken').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should disable the submit button until the pre-auth CSRF token is ready', async () => {
    render(<LoginPage onAuthenticated={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());
  });

  it('should call login and report the authenticated user on submit', async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    vi.spyOn(authApi, 'login').mockResolvedValue({ user: { id: '1', username: 'alice' } });
    render(<LoginPage onAuthenticated={onAuthenticated} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());

    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(onAuthenticated).toHaveBeenCalledWith({ id: '1', username: 'alice' }),
    );
  });

  it('should call register instead of login after switching modes', async () => {
    const user = userEvent.setup();
    const registerSpy = vi
      .spyOn(authApi, 'register')
      .mockResolvedValue({ user: { id: '2', username: 'bob' } });
    render(<LoginPage onAuthenticated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    await user.type(screen.getByLabelText('Username'), 'bob');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(registerSpy).toHaveBeenCalledWith({ username: 'bob', password: 'password123' }),
    );
  });

  it('should show a friendly message on invalid credentials', async () => {
    const user = userEvent.setup();
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 'nope', 401));
    render(<LoginPage onAuthenticated={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());

    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  });
});
