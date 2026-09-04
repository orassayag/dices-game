import { PrismaClient } from '@prisma/client';

// Single shared instance — Prisma pools connections internally, so a second
// PrismaClient per process would double the pool for no benefit (and, in dev
// with tsx watch, leak a connection on every reload without this singleton).
const prisma = new PrismaClient();

export default prisma;
