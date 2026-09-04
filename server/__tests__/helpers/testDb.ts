import { PrismaClient } from '@prisma/client';

// Disposable database for the `api` Vitest project (plan_v6.md §12) — same Postgres
// instance as dev (docker-compose.yml), separate database so tests never touch dev data.
export const TEST_DATABASE_URL: string =
  'postgresql://dices_game:dices_game@localhost:5432/dices_game_test';

let testPrisma: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  testPrisma ??= new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  return testPrisma;
}

// Clears every table between tests while keeping the schema (RESTART IDENTITY resets
// any serial sequences; CASCADE follows FKs so table order doesn't matter).
export async function truncateAll(): Promise<void> {
  const prisma = getTestPrisma();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Move", "Game", "User" RESTART IDENTITY CASCADE;');
}
