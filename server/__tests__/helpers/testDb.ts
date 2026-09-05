import { PrismaClient } from '@prisma/client';

// Same Postgres instance as dev, separate database so tests never touch dev data.
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
