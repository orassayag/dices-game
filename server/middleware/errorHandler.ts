import { ZodError } from 'zod';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ERROR_CODE_STATUS, type ErrorCode } from '../../shared/index.js';
import { AppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('error-handler');

// A malformed-JSON body: express.json() rejects it before any route runs, throwing a
// SyntaxError tagged with `type: 'entity.parse.failed'` and a `body` property (I5).
// Caught here, before the generic err.status fallback, so broken JSON produces a
// union error code instead of an out-of-union body-parser response.
function isBodyParserSyntaxError(err: unknown): err is SyntaxError & { status?: number } {
  return err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed';
}

function sendError(res: Response, statusCode: number, code: ErrorCode, message: string): void {
  res.status(statusCode).json({ error: { code, message } });
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    sendError(res, ERROR_CODE_STATUS[err.errorCode], err.errorCode, err.message);
    return;
  }
  if (err instanceof ZodError) {
    sendError(res, ERROR_CODE_STATUS.INVALID_INPUT, 'INVALID_INPUT', 'Request validation failed.');
    return;
  }
  if (isBodyParserSyntaxError(err)) {
    sendError(res, ERROR_CODE_STATUS.INVALID_INPUT, 'INVALID_INPUT', 'Malformed JSON body.');
    return;
  }
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 404) {
    sendError(res, 404, 'ROUTE_NOT_FOUND', 'Route not found.');
    return;
  }
  logger.error('Unhandled error reached the error middleware', {
    error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  sendError(res, 500, 'DATABASE_CONSTRAINT', 'Internal server error.');
};

export function routeNotFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No route matches ${req.method} ${req.path}.`);
}
