import { z } from 'zod';

const DieSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const TARGET_SCORE_MIN: number = 10;
const TARGET_SCORE_MAX: number = 1000;

// The top-level `busted` field on GameStateSchema is derived from this via `.transform`
// below — there is no separately stored `busted` flag.
const LastMoveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('roll'),
    dice: z.tuple([DieSchema, DieSchema]).describe('The two dice rolled this turn.'),
    busted: z.boolean().describe('True when the roll was 6 & 6 (round score lost, turn passed).'),
  }),
  z.object({ kind: z.literal('hold') }).describe('The player held, banking the round score.'),
  z
    .object({
      kind: z.literal('forfeit'),
    })
    .describe(
      'AI move-count cap hand-back — the sole channel signalling the cap (I4). Not an error.',
    ),
]);

export const GameStateSchema = z
  .object({
    id: z.string(),
    mode: z.enum(['human', 'ai']),
    aiSeat: z
      .union([z.literal(1), z.literal(2)])
      .nullable()
      .describe('Which seat the AI plays. null when mode is "human".'),
    targetScore: z.number().int().min(TARGET_SCORE_MIN).max(TARGET_SCORE_MAX),
    status: z.enum(['in_progress', 'finished', 'abandoned']),
    currentSeat: z.union([z.literal(1), z.literal(2)]),
    p1Score: z.number().int().nonnegative(),
    p2Score: z.number().int().nonnegative(),
    roundScore: z.number().int().nonnegative(),
    lastDice: z
      .union([z.tuple([]), z.tuple([DieSchema, DieSchema])])
      .describe('Empty before the first roll of a turn, or on a freshly created game.'),
    winnerSeat: z.union([z.literal(1), z.literal(2)]).nullable(),
    version: z
      .number()
      .int()
      .nonnegative()
      .describe(
        'Optimistic-concurrency row version; echoed back as expectedVersion on the next action.',
      ),
    lastMove: LastMoveSchema.nullable().describe('null only on a freshly created game.'),
  })
  .transform((state) => ({
    ...state,
    busted: state.lastMove?.kind === 'roll' ? state.lastMove.busted : false,
  }));

export type GameStateDto = z.infer<typeof GameStateSchema>;

// The mode/aiSeat cross-field rule mirrors the DB CHECKs in server/prisma/schema.prisma.
export const CreateGameInputSchema = z
  .object({
    targetScore: z.number().int().min(TARGET_SCORE_MIN).max(TARGET_SCORE_MAX),
    mode: z.enum(['human', 'ai']),
    aiSeat: z
      .union([z.literal(1), z.literal(2)])
      .optional()
      .describe('Required (1 or 2) when mode is "ai"; must be omitted when mode is "human".'),
  })
  .strict()
  .refine(
    (input) =>
      input.mode === 'ai' ? input.aiSeat === 1 || input.aiSeat === 2 : input.aiSeat == null,
    {
      message: 'aiSeat is required when mode is "ai" and must be omitted when mode is "human"',
      path: ['aiSeat'],
    },
  );

export type CreateGameInput = z.infer<typeof CreateGameInputSchema>;

export const ExpectedVersionSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

export type ExpectedVersionInput = z.infer<typeof ExpectedVersionSchema>;

const LIST_GAMES_DEFAULT_LIMIT: number = 10;
const LIST_GAMES_MAX_LIMIT: number = 50;

export const ListGamesQuerySchema = z
  .object({
    status: z.literal('in_progress'),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(LIST_GAMES_MAX_LIMIT)
      .default(LIST_GAMES_DEFAULT_LIMIT)
      .describe(`Bounds the response length; defaults to ${LIST_GAMES_DEFAULT_LIMIT}.`),
  })
  .strict();

export type ListGamesQuery = z.infer<typeof ListGamesQuerySchema>;

const USERNAME_MIN_LENGTH: number = 3;
const USERNAME_MAX_LENGTH: number = 30;
const PASSWORD_MIN_LENGTH: number = 8;
const PASSWORD_MAX_BYTE_LENGTH: number = 72;

const UsernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .describe('Normalized server-side (trim + NFKC + lowercase) before length/uniqueness checks.');

// Byte length, not JS string length — bcrypt truncates past 72 bytes, and those can differ.
function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .refine((password) => utf8ByteLength(password) <= PASSWORD_MAX_BYTE_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_BYTE_LENGTH} UTF-8 bytes (bcrypt's limit)`,
  })
  .describe(
    `At least ${PASSWORD_MIN_LENGTH} characters and at most ${PASSWORD_MAX_BYTE_LENGTH} UTF-8 bytes.`,
  );

export const AuthCredentialsInputSchema = z
  .object({
    username: UsernameSchema,
    password: PasswordSchema,
  })
  .strict();

export type AuthCredentialsInput = z.infer<typeof AuthCredentialsInputSchema>;

// No `{ token }` field — the JWT is set as an HttpOnly cookie, never returned in the body.
export const AuthResponseSchema = z
  .object({
    user: z.object({
      id: z.string(),
      username: z.string(),
    }),
  })
  .strict();

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
