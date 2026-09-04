import type { ErrorCode } from '../../shared/index.js';

export interface AppErrorContext {
  errorCode: ErrorCode;
  error?: unknown;
}

// Base for every typed error the API throws. Callers instantiate one of the named
// subclasses below (or AppError directly for a one-off code); the error middleware
// (server/middleware/errorHandler.ts) discriminates by errorCode, not by subclass
// identity, so a route can also `throw new AppError('...', { errorCode: 'X' })`
// without a dedicated class when nothing downstream needs an instanceof check.
export class AppError extends Error {
  public readonly errorCode: ErrorCode;

  constructor(message: string, context: AppErrorContext) {
    super(message, { cause: context.error });
    this.name = 'AppError';
    this.errorCode = context.errorCode;
  }
}

// 400 — Zod/body/param validation failure, incl. malformed-JSON body-parser errors (I5).
export class InvalidInputError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'INVALID_INPUT' });
    this.name = 'InvalidInputError';
  }
}

// 401 — missing/invalid/expired JWT, stale tokenVersion, or a failed login attempt
// (INVALID_CREDENTIALS / UNAUTHORIZED share this class; the caller picks the code).
export class UnauthorizedError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'UnauthorizedError';
  }
}

// 403 — CSRF_INVALID (missing/mismatched/user-unbound token, or a failed Origin check).
export class CsrfError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'CSRF_INVALID' });
    this.name = 'CsrfError';
  }
}

// 403 — authenticated but not the game owner.
export class ForbiddenError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'FORBIDDEN' });
    this.name = 'ForbiddenError';
  }
}

// 404 — GAME_NOT_FOUND / ROUTE_NOT_FOUND share this class; the caller picks the code.
export class NotFoundError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'NotFoundError';
  }
}

// 409 — VERSION_CONFLICT / GAME_ABANDONED / GAME_FINISHED / GAME_CONFLICT /
// AI_TURN_REQUIRED all share this class; the caller picks the code (§1, §11).
export class ConflictError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'ConflictError';
  }
}

// 429 — auth or gameplay rate limit exceeded (§10).
export class RateLimitedError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'RATE_LIMITED' });
    this.name = 'RateLimitedError';
  }
}

// 503 — the tokenVersion revocation-check DB read is unavailable (I8). Distinct from
// UnauthorizedError so a transient DB blip never masquerades as "you are logged out".
export class ServiceUnavailableError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'SERVICE_UNAVAILABLE' });
    this.name = 'ServiceUnavailableError';
  }
}

// 500 — any CHECK/constraint failure not mapped to a more specific code above; never
// mis-reported as GAME_FINISHED (§11 per-signal DB error mapping).
export class DatabaseConstraintError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'DATABASE_CONSTRAINT' });
    this.name = 'DatabaseConstraintError';
  }
}
