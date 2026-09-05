import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../LoginPage';
import { ApiError } from '../../../api/apiClient';
import * as authApi from '../../../api/authApi';

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call login and report the authenticated user on submit', async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    vi.spyOn(authApi, 'login').mockResolvedValue({ user: { id: '1', username: 'alice' } });
    render(<LoginPage onAuthenticated={onAuthenticated} />);

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

    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
  });

  it('should show inline field errors when submitting an empty form', async () => {
    const user = userEvent.setup();
    render(<LoginPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((node) => node.textContent === 'Username is required.')).toBe(true);
    expect(alerts.some((node) => node.textContent === 'Password is required.')).toBe(true);
  });

  it('should reveal the password-strength hint and toggle visibility in register mode', async () => {
    const user = userEvent.setup();
    render(<LoginPage onAuthenticated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByText(/At least 8 characters/)).toBeInTheDocument();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(passwordInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
