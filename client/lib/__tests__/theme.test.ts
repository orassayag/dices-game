import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  getSystemTheme,
  persistTheme,
  resolveInitialTheme,
} from '../theme';

function mockMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches } as MediaQueryList),
  );
}

describe('theme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getSystemTheme', () => {
    it('should return dark when the system prefers dark', () => {
      mockMatchMedia(true);
      expect(getSystemTheme()).toBe('dark');
    });

    it('should return light when the system does not prefer dark', () => {
      mockMatchMedia(false);
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('getStoredTheme', () => {
    it('should return the stored theme when valid', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      expect(getStoredTheme()).toBe('dark');
    });

    it('should return null when nothing is stored', () => {
      expect(getStoredTheme()).toBeNull();
    });

    it('should return null when the stored value is invalid', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
      expect(getStoredTheme()).toBeNull();
    });
  });

  describe('resolveInitialTheme', () => {
    it('should prefer the stored theme over the system theme', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      mockMatchMedia(true);
      expect(resolveInitialTheme()).toBe('light');
    });

    it('should fall back to the system theme when nothing is stored', () => {
      mockMatchMedia(true);
      expect(resolveInitialTheme()).toBe('dark');
    });
  });

  describe('applyTheme', () => {
    it('should add the dark class for the dark theme', () => {
      applyTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should remove the dark class for the light theme', () => {
      document.documentElement.classList.add('dark');
      applyTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('persistTheme', () => {
    it('should write the theme to localStorage', () => {
      persistTheme('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });
  });
});
