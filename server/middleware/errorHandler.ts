import { ZodError } from 'zod';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ERROR_CODE_STATUS, type ErrorCode } from '../../shared/index.js';
import { AppError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('error-handler');

// 5xx means the API itself failed (a bug, a dependency outage) — ERROR level. Anything
// below that is an expected rejection (bad input, auth, conflict, rate limit): still
// worth an audit trail, but not an incident, so it's logged at WARN
// (error-handling-logging.md's log-level guidance).
const SERVER_ERROR_STATUS_THRESHOLD: number = 500;

// A malformed-JSON body: express.json() rejects it before any route runs, throwing a
// SyntaxError tagged with `type: 'entity.parse.failed'` and a `body` property (I5).
// Caught here, before the generic err.status fallback, so broken JSON produces a
// union error code instead of an out-of-union body-parser response.
function isBodyParserSyntaxError(err: unknown): err is SyntaxError & { status?: number } {
  return err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed';
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack, cause: err.cause };
  }
  return err;
}

// Single funnel point for every error the API can produce — every route/middleware
// forwards its catch here via `next(err)` (server/routes, server/middleware/*), so
// logging lives once, in this one place, instead of at each individual throw site. That
// means a new error path added later is logged automatically just by reaching here,
// rather than needing its own log call remembered at the call site.
function logAndSendError(
  req: Request,
  res: Response,
  statusCode: number,
  code: ErrorCode,
  message: string,
  err: unknown,
): void {
  const metadata = {
    method: req.method,
    path: req.path,
    statusCode,
    code,
    error: serializeError(err),
  };
  if (statusCode >= SERVER_ERROR_STATUS_THRESHOLD) {
    logger.error(message, metadata);
  } else {
    logger.warn(message, metadata);
  }
  res.status(statusCode).json({ error: { code, message } });
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    logAndSendError(req, res, ERROR_CODE_STATUS[err.errorCode], err.errorCode, err.message, err);
    return;
  }
  if (err instanceof ZodError) {
    logAndSendError(
      req,
      res,
      ERROR_CODE_STATUS.INVALID_INPUT,
      'INVALID_INPUT',
      'Request validation failed.',
      err,
    );
    return;
  }
  if (isBodyParserSyntaxError(err)) {
    logAndSendError(
      req,
      res,
      ERROR_CODE_STATUS.INVALID_INPUT,
      'INVALID_INPUT',
      'Malformed JSON body.',
      err,
    );
    return;
  }
  const status = (err as { status?: number } | undefined)?.status;
  if (status === 404) {
    logAndSendError(req, res, 404, 'ROUTE_NOT_FOUND', 'Route not found.', err);
    return;
  }
  logAndSendError(req, res, 500, 'DATABASE_CONSTRAINT', 'Internal server error.', err);
};

export function routeNotFoundHandler(req: Request, res: Response): void {
  const message = `No route matches ${req.method} ${req.path}.`;
  logger.warn(message, { method: req.method, path: req.path, statusCode: 404 });
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message } });
}
