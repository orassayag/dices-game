// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getTestPrisma, truncateAll } from '../../__tests__/helpers/testDb.js';

const FINISHED_GAME_UPDATE_SQLSTATE = 'PIGF1';
const CHECK_VIOLATION_SQLSTATE = '23514';
const UNIQUE_VIOLATION_SQLSTATE = '23505';

let prisma: PrismaClient;
let ownerUserId: string;

function pgErrorCode(error: unknown): string | undefined {
  return (error as Prisma.PrismaClientKnownRequestError).meta?.code as string | undefined;
}

// Inserts a Game row via raw SQL (not prisma.game.create) so tests can attempt values
// Prisma's own generated types would refuse to construct — e.g. an out-of-range enum
// or a negative score — proving the DATABASE itself rejects them, not just the client.
async function insertGameRaw(overrides: Record<string, string> = {}): Promise<void> {
  const columns: Record<string, string> = {
    id: `'${crypto.randomUUID()}'`,
    ownerUserId: `'${ownerUserId}'`,
    mode: `'human'`,
    aiSeat: 'NULL',
    aiMoveCount: '0',
    targetScore: '100',
    status: `'in_progress'`,
    currentSeat: '1',
    p1Score: '0',
    p2Score: '0',
    roundScore: '0',
    lastDice: 'ARRAY[]::integer[]',
    winnerSeat: 'NULL',
    version: '0',
    updatedAt: 'CURRENT_TIMESTAMP', // no DB default — Prisma sets it client-side normally
    ...overrides,
  };
  const columnNames = Object.keys(columns)
    .map((name) => `"${name}"`)
    .join(', ');
  const values = Object.values(columns).join(', ');
  await prisma.$executeRawUnsafe(`INSERT INTO "Game" (${columnNames}) VALUES (${values});`);
}

describe('DB-level invariants (raw-SQL migration)', () => {
  beforeEach(async () => {
    prisma = getTestPrisma();
    await truncateAll();
    const user = await prisma.user.create({
      data: { username: 'alice', usernameKey: 'alice', passwordHash: 'x' },
    });
    ownerUserId = user.id;
  });

  it('should reject updating a finished game, with the finished-game SQLSTATE', async () => {
    await insertGameRaw({ status: `'finished'`, winnerSeat: '1', p1Score: '100' });
    const error = await prisma
      .$executeRawUnsafe(
        `UPDATE "Game" SET "roundScore" = 5 WHERE "ownerUserId" = '${ownerUserId}';`,
      )
      .catch((caught: unknown) => caught);
    expect(pgErrorCode(error)).toBe(FINISHED_GAME_UPDATE_SQLSTATE);
  });

  it('should reject status=finished with a null winnerSeat', async () => {
    const error = await insertGameRaw({ status: `'finished'`, winnerSeat: 'NULL' }).catch(
      (caught: unknown) => caught,
    );
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject mode=human with a non-null aiSeat', async () => {
    const error = await insertGameRaw({ mode: `'human'`, aiSeat: '1' }).catch(
      (caught: unknown) => caught,
    );
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject mode=ai with a null aiSeat', async () => {
    const error = await insertGameRaw({ mode: `'ai'`, aiSeat: 'NULL' }).catch(
      (caught: unknown) => caught,
    );
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject a second in_progress game for the same owner', async () => {
    await insertGameRaw({ status: `'in_progress'` });
    const error = await insertGameRaw({ status: `'in_progress'` }).catch(
      (caught: unknown) => caught,
    );
    expect(pgErrorCode(error)).toBe(UNIQUE_VIOLATION_SQLSTATE);
  });

  it.each([
    ['targetScore below the minimum', { targetScore: '5' }],
    ['targetScore above the maximum', { targetScore: '5000' }],
    ['lastDice with an out-of-range die', { lastDice: 'ARRAY[99]' }],
    ['lastDice with the wrong cardinality', { lastDice: 'ARRAY[1,2,3]' }],
    ['aiMoveCount over the hard cap', { aiMoveCount: '51' }],
  ])('should reject %s', async (_label, overrides) => {
    const error = await insertGameRaw(overrides).catch((caught: unknown) => caught);
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject status=finished, winnerSeat=1 with p1Score below targetScore (I7)', async () => {
    const error = await insertGameRaw({
      status: `'finished'`,
      winnerSeat: '1',
      p1Score: '0',
      targetScore: '100',
    }).catch((caught: unknown) => caught);
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject status=finished, winnerSeat=2 with p2Score below targetScore (I7)', async () => {
    const error = await insertGameRaw({
      status: `'finished'`,
      winnerSeat: '2',
      p2Score: '0',
      targetScore: '100',
    }).catch((caught: unknown) => caught);
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });

  it('should reject an in_progress row already at or over the target score (I7)', async () => {
    const error = await insertGameRaw({
      status: `'in_progress'`,
      p1Score: '100',
      targetScore: '100',
      winnerSeat: 'NULL',
    }).catch((caught: unknown) => caught);
    expect(pgErrorCode(error)).toBe(CHECK_VIOLATION_SQLSTATE);
  });
});
