import '@testing-library/jest-dom/vitest';

// jsdom under this Vitest/Node combination does not expose a working localStorage
// (Node prints "localStorage is not available because --localstorage-file was not
// provided"). The app treats localStorage as a normal browser API, so provide a
// minimal in-memory implementation for the web test project.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
}
