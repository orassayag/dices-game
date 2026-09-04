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

// Register a new user (plan_v6.md §5, §10). `usernameKey` is the normalized uniqueness
// key; `username` keeps the caller's original display form. A collision on the unique
// index is caught here rather than pre-checked, closing the check-then-insert race.
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

// Constant-time login (I-nothing but explicitly called out in §1/§10): always runs
// exactly one bcrypt compare, even when the username doesn't exist, against the fixed
// DUMMY_BCRYPT_HASH — so present and absent usernames take comparable time and the
// generic INVALID_CREDENTIALS response never leaks which case occurred.
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
