import { z } from 'zod';

// Single source of truth for every error this API can emit (plan_v6.md §1). Both the
// server's error middleware and the frontend's error discriminator import this file
// instead of hand-rolling their own copy of the status table.
export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'INVALID_CREDENTIALS',
  'UNAUTHORIZED',
  'CSRF_INVALID',
  'FORBIDDEN',
  'GAME_NOT_FOUND',
  'ROUTE_NOT_FOUND',
  'VERSION_CONFLICT',
  'GAME_ABANDONED',
  'GAME_FINISHED',
  'GAME_CONFLICT',
  'AI_TURN_REQUIRED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'DATABASE_CONSTRAINT',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

// Every code maps to exactly one HTTP status — see plan_v6.md §1 for what each means.
export const ERROR_CODE_STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  CSRF_INVALID: 403,
  FORBIDDEN: 403,
  GAME_NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  GAME_ABANDONED: 409,
  GAME_FINISHED: 409,
  GAME_CONFLICT: 409,
  AI_TURN_REQUIRED: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  DATABASE_CONSTRAINT: 500,
};

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
