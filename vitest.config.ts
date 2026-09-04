import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['{client,server,shared}/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts', 'shared/**/*.ts', 'client/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**'],
      thresholds: { lines: 60, functions: 60, branches: 50 },
    },
  },
});
