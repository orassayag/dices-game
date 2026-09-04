export type Theme = 'light' | 'dark';

// Must match the inline anti-flash script in client/index.html — that script runs
// before React mounts and can't import this module, so the key is duplicated there.
export const THEME_STORAGE_KEY: string = 'dices-game-theme';

const DARK_CLASS_NAME: string = 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

export function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : null;
}

export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS_NAME, theme === 'dark');
}

export function persistTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
