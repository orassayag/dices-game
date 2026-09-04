import { useEffect, useState, type FormEvent } from 'react';
import { fetchCsrfToken, login, register } from '../../api/authApi';
import { ApiError } from '../../api/apiClient';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface LoginScreenProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
}

type AuthMode = 'login' | 'register';

const USERNAME_MIN_LENGTH: number = 3;
const PASSWORD_MIN_LENGTH: number = 8;

function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errorCode === 'INVALID_CREDENTIALS') {
      return 'Invalid username or password.';
    }
    if (error.errorCode === 'RATE_LIMITED') {
      return 'Too many attempts. Please wait and try again.';
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [csrfReady, setCsrfReady] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchCsrfToken()
      .then(() => setCsrfReady(true))
      .catch(() => setErrorMessage('Could not reach the server. Please refresh and try again.'));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const credentials = { username, password };
      const response = mode === 'login' ? await login(credentials) : await register(credentials);
      onAuthenticated(response.user);
    } catch (error) {
      setErrorMessage(friendlyErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-slate-900 p-8"
      >
        <h1 className="text-xl font-semibold">
          Dice Game — {mode === 'login' ? 'Log in' : 'Register'}
        </h1>

        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={USERNAME_MIN_LENGTH}
            required
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            required
            className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
          />
        </label>

        {errorMessage && (
          <p role="alert" className="text-sm text-red-400">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={!csrfReady || submitting}
          className="rounded bg-indigo-600 px-3 py-2 font-medium disabled:opacity-50"
        >
          {mode === 'login' ? 'Log in' : 'Register'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="text-sm text-slate-400 underline"
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
      </form>
    </main>
  );
}
