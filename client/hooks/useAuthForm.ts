import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/apiClient';
import { login, register } from '../api/authApi';

export type AuthMode = 'login' | 'register';

interface FieldErrors {
  username?: string;
  password?: string;
}

interface AuthenticatedUser {
  id: string;
  username: string;
}

const USERNAME_MIN_LENGTH: number = 3;
export const PASSWORD_MIN_LENGTH: number = 8;
// Checked only on registration — an existing account's password was never required to
// match this, so re-checking it on login could lock someone out.
const PASSWORD_STYLE_REGEX: RegExp = /^(?=.*[A-Za-z])(?=.*\d)/;

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

interface UseAuthFormOptions {
  onAuthenticated: (user: AuthenticatedUser) => void;
}

interface UseAuthFormResult {
  mode: AuthMode;
  username: string;
  password: string;
  showPassword: boolean;
  submitting: boolean;
  errorMessage: string | null;
  fieldErrors: FieldErrors;
  usernameShakeKey: number;
  passwordShakeKey: number;
  handleUsernameChange: (value: string) => void;
  handlePasswordChange: (value: string) => void;
  toggleShowPassword: () => void;
  switchMode: () => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function useAuthForm({ onAuthenticated }: UseAuthFormOptions): UseAuthFormResult {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Bumped on each validation failure so the input can be remounted (via key) to replay
  // the shake animation even when the error stays set across repeat submits.
  const [usernameShakeKey, setUsernameShakeKey] = useState<number>(0);
  const [passwordShakeKey, setPasswordShakeKey] = useState<number>(0);

  function validateFields(): boolean {
    const errors: FieldErrors = {};
    if (username.trim().length === 0) {
      errors.username = 'Username is required.';
    } else if (username.length < USERNAME_MIN_LENGTH) {
      errors.username = `Must be at least ${USERNAME_MIN_LENGTH} characters.`;
    }
    if (password.length === 0) {
      errors.password = 'Password is required.';
    } else if (mode === 'register' && password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    } else if (mode === 'register' && !PASSWORD_STYLE_REGEX.test(password)) {
      errors.password = 'Needs a letter and a number.';
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

  function handleUsernameChange(value: string): void {
    setUsername(value);
    clearFieldError('username');
  }

  function handlePasswordChange(value: string): void {
    setPassword(value);
    clearFieldError('password');
  }

  function toggleShowPassword(): void {
    setShowPassword((previous) => !previous);
  }

  function switchMode(): void {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setShowPassword(false);
    setErrorMessage(null);
    setFieldErrors({});
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

  return {
    mode,
    username,
    password,
    showPassword,
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
  };
}
