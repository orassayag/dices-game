// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  DatabaseConstraintError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../errors.js';

describe('AppError classes', () => {
  it('should carry the error code and cause on the base AppError', () => {
    const cause = new Error('root');
    const error = new AppError('boom', { errorCode: 'VERSION_CONFLICT', error: cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.errorCode).toBe('VERSION_CONFLICT');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('AppError');
  });

  it('should default InvalidInputError to the INVALID_INPUT code', () => {
    const error = new InvalidInputError('bad field');
    expect(error.errorCode).toBe('INVALID_INPUT');
    expect(error.name).toBe('InvalidInputError');
  });

  it('should default ForbiddenError to the FORBIDDEN code', () => {
    expect(new ForbiddenError('no').errorCode).toBe('FORBIDDEN');
  });

  it('should default RateLimitedError to the RATE_LIMITED code', () => {
    expect(new RateLimitedError('slow').errorCode).toBe('RATE_LIMITED');
  });

  it('should default ServiceUnavailableError to the SERVICE_UNAVAILABLE code', () => {
    expect(new ServiceUnavailableError('down').errorCode).toBe('SERVICE_UNAVAILABLE');
  });

  it('should default DatabaseConstraintError to the DATABASE_CONSTRAINT code', () => {
    const error = new DatabaseConstraintError('constraint', { error: new Error('pg') });
    expect(error.errorCode).toBe('DATABASE_CONSTRAINT');
    expect(error.name).toBe('DatabaseConstraintError');
  });

  it('should construct code-defaulting classes without an explicit context', () => {
    expect(new DatabaseConstraintError('x').errorCode).toBe('DATABASE_CONSTRAINT');
    expect(new InvalidInputError('x').errorCode).toBe('INVALID_INPUT');
    expect(new ForbiddenError('x').errorCode).toBe('FORBIDDEN');
    expect(new RateLimitedError('x').errorCode).toBe('RATE_LIMITED');
    expect(new ServiceUnavailableError('x').errorCode).toBe('SERVICE_UNAVAILABLE');
  });

  it('should carry the passed error code on the discriminating classes', () => {
    expect(new UnauthorizedError('x', { errorCode: 'UNAUTHORIZED' }).errorCode).toBe('UNAUTHORIZED');
    expect(new NotFoundError('x', { errorCode: 'GAME_NOT_FOUND' }).errorCode).toBe('GAME_NOT_FOUND');
    expect(new ConflictError('x', { errorCode: 'VERSION_CONFLICT' }).errorCode).toBe(
      'VERSION_CONFLICT',
    );
  });
});
