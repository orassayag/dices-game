import { z } from 'zod';

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
