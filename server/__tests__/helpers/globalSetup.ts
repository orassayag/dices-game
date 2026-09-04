import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './testDb.js';

const DUPLICATE_DATABASE_SQLSTATE: string = '42P04';
const ADMIN_DATABASE_URL: string = 'postgresql://dices_game:dices_game@localhost:5432/dices_game';

async function ensureTestDatabaseExists(): Promise<void> {
  const admin = new PrismaClient({ datasourceUrl: ADMIN_DATABASE_URL });
  try {
    await admin.$executeRawUnsafe('CREATE DATABASE "dices_game_test";');
  } catch (error) {
    const code = (error as { code?: string; meta?: { code?: string } }).meta?.code;
    if (code !== DUPLICATE_DATABASE_SQLSTATE) {
      throw new Error(
        `Could not create the test database. Is PostgreSQL running (docker compose up -d)?`,
        { cause: error },
      );
    }
  } finally {
    await admin.$disconnect();
  }
}

// Runs once before the `api` Vitest project's suites (plan_v6.md §12): creates the
// disposable test database if it doesn't exist yet, then applies every migration —
// including the raw-SQL DB invariants — the same way a real deploy would.
export async function setup(): Promise<void> {
  await ensureTestDatabaseExists();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
