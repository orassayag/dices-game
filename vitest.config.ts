import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['server/**/*.ts', 'shared/**/*.ts', 'client/**/*.{ts,tsx}'],
      exclude: [
        '**/__tests__/**',
        '**/prisma/migrations/**',
        // Process/DOM bootstrap glue: no branching logic, only exercised by a real
        // runtime (listen/process handlers, ReactDOM root mount), not unit tests.
        'server/index.ts',
        'client/main.tsx',
      ],
      thresholds: { statements: 90, lines: 90, functions: 90, branches: 90 },
      reporter: ['text'],
    },
    // Must be set at root, not per-project — Vitest resolves fileParallelism globally,
    // so setting it only inside the `api` project's block is silently ignored.
    // `singleThread` alone still lets Vitest interleave files as concurrent async tasks
    // on that one thread; the `api` project's suites share one real Postgres database
    // via truncateAll(), so files must also run one at a time or their beforeEach/test
    // bodies race on the same rows.
    fileParallelism: false,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          environmentOptions: { jsdom: { url: 'http://localhost:3000/' } },
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
