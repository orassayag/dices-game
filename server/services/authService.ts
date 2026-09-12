import { Prisma } from '@prisma/client';
import prisma from '../db.js';
import {
  DUMMY_BCRYPT_HASH,
  hashPassword,
  normalizeUsernameKey,
  signAuthToken,
  verifyPassword,
} from '../lib/authCrypto.js';
import { InvalidInputError, UnauthorizedError } from '../lib/errors.js';

const UNIQUE_CONSTRAINT_VIOLATION_CODE: string = 'P2002';

export interface AuthenticatedUser {
  id: string;
  username: string;
  authToken: string;
}

// A collision on the unique index is caught here rather than pre-checked, closing the
// check-then-insert race.
export async function registerUser(username: string, password: string): Promise<AuthenticatedUser> {
  const usernameKey = normalizeUsernameKey(username);
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({ data: { username, usernameKey, passwordHash } });
    return {
      id: user.id,
      username: user.username,
      authToken: signAuthToken({ sub: user.id, tokenVersion: user.tokenVersion }),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION_CODE
    ) {
      throw new InvalidInputError('Username is already taken.', { error });
    }
    throw error;
  }
}

// Always runs exactly one bcrypt compare, even when the username doesn't exist, against
// the fixed DUMMY_BCRYPT_HASH — so present and absent usernames take comparable time.
export async function loginUser(username: string, password: string): Promise<AuthenticatedUser> {
  const usernameKey = normalizeUsernameKey(username);
  const user = await prisma.user.findUnique({ where: { usernameKey } });
  const passwordHash = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const passwordMatches = await verifyPassword(password, passwordHash);

  if (!user || !passwordMatches) {
    throw new UnauthorizedError('Invalid username or password.', {
      errorCode: 'INVALID_CREDENTIALS',
    });
  }

  return {
    id: user.id,
    username: user.username,
    authToken: signAuthToken({ sub: user.id, tokenVersion: user.tokenVersion }),
  };
}

// Bumps tokenVersion so every token already issued for this user (the one in the cookie
// being cleared, plus any other live session) fails the requireAuth version check on its
// next request — clearing the cookie alone leaves a captured token valid until expiry.
export async function revokeUserSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// UNAUTHORIZED, not 404 — matches how requireAuth treats a deleted account for a token
// that's technically still valid.
export async function getAuthenticatedUser(
  userId: string,
): Promise<{ id: string; username: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new UnauthorizedError('Session user no longer exists.', { errorCode: 'UNAUTHORIZED' });
  }
  return user;
}
