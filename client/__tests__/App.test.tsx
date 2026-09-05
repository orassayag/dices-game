import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import * as useCurrentUserSessionModule from '../hooks/useCurrentUserSession';

vi.mock('../components/theme-toggle/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('../pages/game-page/GamePage', () => ({
  GamePage: (props: { onSessionExpired: () => void; onLogout: () => void }) => (
    <div data-testid="game-page">
      <button type="button" onClick={props.onSessionExpired}>
        expire
      </button>
      <button type="button" onClick={props.onLogout}>
        logout
      </button>
    </div>
  ),
}));

vi.mock('../pages/login-page/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page" />,
}));

function mockSession(
  value: ReturnType<typeof useCurrentUserSessionModule.useCurrentUserSession>,
): void {
  vi.spyOn(useCurrentUserSessionModule, 'useCurrentUserSession').mockReturnValue(value);
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should show a loading state while the session is being checked', () => {
    mockSession({ user: null, checkingSession: true, setUser: vi.fn() });
    render(<App />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('should render the login page when there is no user', () => {
    mockSession({ user: null, checkingSession: false, setUser: vi.fn() });
    render(<App />);
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('should render the game page when a user is authenticated', () => {
    mockSession({
      user: { id: '1', username: 'alice' },
      checkingSession: false,
      setUser: vi.fn(),
    });
    render(<App />);
    expect(screen.getByTestId('game-page')).toBeInTheDocument();
  });

  it('should clear the user when the game page reports session expiry or logout', async () => {
    const setUser = vi.fn();
    mockSession({ user: { id: '1', username: 'alice' }, checkingSession: false, setUser });
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'expire' }));
    await user.click(screen.getByRole('button', { name: 'logout' }));

    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser).toHaveBeenCalledWith(null);
  });
});
