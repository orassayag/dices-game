import type { ErrorCode } from '../../shared/index.js';

export interface AppErrorContext {
  errorCode: ErrorCode;
  error?: unknown;
}

// The error middleware discriminates by errorCode, not by subclass identity, so a route
// can also `throw new AppError('...', { errorCode: 'X' })` directly when nothing
// downstream needs an instanceof check.
export class AppError extends Error {
  public readonly errorCode: ErrorCode;

  constructor(message: string, context: AppErrorContext) {
    super(message, { cause: context.error });
    this.name = 'AppError';
    this.errorCode = context.errorCode;
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'INVALID_INPUT' });
    this.name = 'InvalidInputError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'FORBIDDEN' });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context: AppErrorContext) {
    super(message, context);
    this.name = 'ConflictError';
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'RATE_LIMITED' });
    this.name = 'RateLimitedError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'SERVICE_UNAVAILABLE' });
    this.name = 'ServiceUnavailableError';
  }
}

export class DatabaseConstraintError extends AppError {
  constructor(message: string, context: Omit<AppErrorContext, 'errorCode'> = {}) {
    super(message, { ...context, errorCode: 'DATABASE_CONSTRAINT' });
    this.name = 'DatabaseConstraintError';
  }
}
