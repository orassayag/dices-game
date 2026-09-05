import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { AutoDicePair } from '../../components/auto-dice-pair/AutoDicePair';
import { Button } from '../../components/button/Button';
import { FieldError } from '../../components/field-error/FieldError';
import { PASSWORD_MIN_LENGTH, useAuthForm, type AuthMode } from '../../hooks/useAuthForm';

interface AuthenticatedUser {
  id: string;
  username: string;
}

interface LoginPageProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
}

const MODE_TITLE: Record<AuthMode, string> = {
  login: 'Login',
  register: 'Sign In',
};

const PASSWORD_HINT_TEXT: string = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`;

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const {
    mode,
    username,
    password,
    showPassword,
    csrfReady,
    submitting,
    errorMessage,
    fieldErrors,
    usernameShakeKey,
    passwordShakeKey,
    handleUsernameChange,
    handlePasswordChange,
    toggleShowPassword,
    switchMode,
    handleSubmit,
  } = useAuthForm({ onAuthenticated });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <a href="https://roeto.co.il/" target="_blank" rel="noopener noreferrer" aria-label="Visit Roeto's website">
            <img
              src="/roeto_logo.jpeg"
              alt="Roeto logo"
              className="size-10 rounded-full object-cover sm:size-12"
            />
          </a>
          <h1 className="text-2xl font-bold sm:text-3xl">Roeto Dices Game</h1>
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
            onChange={(event) => handleUsernameChange(event.target.value)}
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

        <div className="flex flex-col gap-1">
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
                onChange={(event) => handlePasswordChange(event.target.value)}
                className={`w-full rounded-lg border px-3 py-2 placeholder:text-muted-foreground ${
                  mode === 'register' ? 'pr-10' : ''
                } ${fieldErrors.password ? 'field-shake border-danger' : 'border-border bg-surface-alt'}`}
              />
              {mode === 'register' && (
                <button
                  type="button"
                  onClick={toggleShowPassword}
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
          {mode === 'register' && !fieldErrors.password && (
            <p className="text-xs text-muted-foreground">{PASSWORD_HINT_TEXT}</p>
          )}
        </div>

        {errorMessage && <FieldError message={errorMessage} />}

        <Button
          type="submit"
          disabled={!csrfReady || submitting}
          icon={<KeyRound size={18} aria-hidden="true" />}
        >
          {mode === 'login' ? 'Log in' : 'Sign In'}
        </Button>

        <p className="text-sm text-muted-foreground">
          {mode === 'login' ? 'Not a member yet? ' : 'Have an account? '}
          <button
            type="button"
            onClick={switchMode}
            className="cursor-pointer underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            {mode === 'login' ? 'Sign In' : 'Log in'}
          </button>
        </p>
      </form>
    </main>
  );
}
