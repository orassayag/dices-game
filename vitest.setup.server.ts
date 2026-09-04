import { TEST_DATABASE_URL } from './server/__tests__/helpers/testDb.js';

// Runs before every test file in the `api` project, before any test module imports
// server/config/env.ts — env.ts validates and reads these at import time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'vitest-api-project-test-secret-at-least-32-bytes-long';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.DATABASE_URL = TEST_DATABASE_URL;
