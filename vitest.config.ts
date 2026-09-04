import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two projects (plan_v6.md §12): `web` renders components under jsdom; `api` runs
// server/shared suites under real Node against a disposable PostgreSQL, serialized
// (singleThread) because every suite shares one database via truncateAll().
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts', 'shared/**/*.ts', 'client/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**', '**/prisma/migrations/**'],
      thresholds: { lines: 60, functions: 60, branches: 50 },
    },
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          globals: true,
          include: ['client/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['vitest.setup.ts'],
        },
      },
      {
        test: {
          name: 'api',
          environment: 'node',
          globals: true,
          include: ['{server,shared}/**/__tests__/**/*.{test,spec}.ts'],
          setupFiles: ['vitest.setup.server.ts'],
          globalSetup: ['server/__tests__/helpers/globalSetup.ts'],
          poolOptions: {
            threads: { singleThread: true },
          },
        },
      },
    ],
  },
});
