import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { fetchCsrfToken, login, register } from '../../api/authApi';
import { ApiError } from '../../api/apiClient';
import { Button } from '../../components/button/Button';
import { FieldError } from '../../components/field-error/FieldError';
import { AutoDicePair } from '../../components/auto-dice-pair/AutoDicePair';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface LoginScreenProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
}

type AuthMode = 'login' | 'register';

interface FieldErrors {
  username?: string;
  password?: string;
}

const USERNAME_MIN_LENGTH: number = 3;
const PASSWORD_MIN_LENGTH: number = 8;

// Register is presented as "Sign In" and login as "Login" (§2) — the show-password
// toggle only makes sense while typing a brand-new password to double-check it (§3), so
// it's gated on the same mode switch rather than a separate flag.
const MODE_TITLE: Record<AuthMode, string> = {
  login: 'Login',
  register: 'Sign In',
};

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
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [csrfReady, setCsrfReady] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Bumped whenever validateFields sets that field's error, so the input below can be
  // remounted (via key) to replay the shake animation on every failed attempt — a class
  // toggle alone wouldn't replay it while the error stays set across repeat submits.
  const [usernameShakeKey, setUsernameShakeKey] = useState<number>(0);
  const [passwordShakeKey, setPasswordShakeKey] = useState<number>(0);

  useEffect(() => {
    fetchCsrfToken()
      .then(() => setCsrfReady(true))
      .catch(() => setErrorMessage('Could not reach the server. Please refresh and try again.'));
  }, []);

  // Runs in place of the browser's native constraint validation (the form carries
  // `noValidate`) so failures render as an inline message next to the field itself, not a
  // floating browser tooltip.
  function validateFields(): boolean {
    const errors: FieldErrors = {};
    if (username.trim().length === 0) {
      errors.username = 'Username is required.';
    } else if (username.length < USERNAME_MIN_LENGTH) {
      errors.username = `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
    }
    if (password.length === 0) {
      errors.password = 'Password is required.';
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    setFieldErrors(errors);
    if (errors.username) {
      setUsernameShakeKey((key) => key + 1);
    }
    if (errors.password) {
      setPasswordShakeKey((key) => key + 1);
    }
    return Object.keys(errors).length === 0;
  }

  function clearFieldError(field: keyof FieldErrors): void {
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    if (!validateFields()) {
      return;
    }
    setSubmitting(true);
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/roeto_logo.jpeg"
            alt="Roeto logo"
            className="size-10 rounded-full object-cover sm:size-12"
          />
          <h1 className="text-2xl font-bold sm:text-3xl">Roeto Dice Game</h1>
        </div>
        <AutoDicePair />
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="flex w-(--login-panel-width) min-w-[20rem] flex-col justify-center gap-4 rounded-2xl border border-border bg-surface p-8"
      >
        <h2 className="text-xl font-semibold">{MODE_TITLE[mode]}</h2>

        <div className="flex items-center gap-2">
          <input
            key={usernameShakeKey}
            type="text"
            autoComplete="username"
            spellCheck={false}
            aria-label="Username"
            aria-invalid={Boolean(fieldErrors.username)}
            placeholder="Username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              clearFieldError('username');
            }}
            className={`min-w-0 flex-1 rounded-lg border px-3 py-2 placeholder:text-muted-foreground ${
              fieldErrors.username ? 'field-shake border-danger' : 'border-border bg-surface-alt'
            }`}
          />
          {fieldErrors.username && (
            <span role="alert" className="shrink-0 text-xs font-medium text-danger">
              {fieldErrors.username}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              key={passwordShakeKey}
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              spellCheck={false}
              aria-label="Password"
              aria-invalid={Boolean(fieldErrors.password)}
              placeholder="Password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearFieldError('password');
              }}
              className={`w-full rounded-lg border px-3 py-2 placeholder:text-muted-foreground ${
                mode === 'register' ? 'pr-10' : ''
              } ${fieldErrors.password ? 'field-shake border-danger' : 'border-border bg-surface-alt'}`}
            />
            {mode === 'register' && (
              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-2 flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            )}
          </div>
          {fieldErrors.password && (
            <span role="alert" className="shrink-0 text-xs font-medium text-danger">
              {fieldErrors.password}
            </span>
          )}
        </div>

        {errorMessage && <FieldError message={errorMessage} />}

        <Button
          type="submit"
          disabled={!csrfReady || submitting}
          icon={<KeyRound size={18} aria-hidden="true" />}
        >
          {mode === 'login' ? 'Log in' : 'Register'}
        </Button>

        <p className="text-sm text-muted-foreground">
          {mode === 'login' ? 'Not a member yet? ' : 'Have an account? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setShowPassword(false);
            }}
            className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            {mode === 'login' ? 'Sign In' : 'Log in'}
          </button>
        </p>
      </form>
    </main>
  );
}
