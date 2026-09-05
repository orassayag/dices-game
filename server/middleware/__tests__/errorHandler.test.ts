// @vitest-environment node
import type { Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler, routeNotFoundHandler } from '../errorHandler.js';
import { AppError, DatabaseConstraintError } from '../../lib/errors.js';

function fakeReqRes() {
  const req = { method: 'POST', path: '/games' } as Request;
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { req, res, status, json };
}

function callErrorHandler(err: unknown) {
  const ctx = fakeReqRes();
  errorHandler(err, ctx.req, ctx.res, vi.fn());
  return ctx;
}

describe('errorHandler', () => {
  it('should map an AppError to its error code and status', () => {
    const { status, json } = callErrorHandler(
      new DatabaseConstraintError('db failed', { error: new Error('pg') }),
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'DATABASE_CONSTRAINT', message: 'db failed' },
    });
  });

  it('should map a ZodError to INVALID_INPUT', () => {
    let zodError: ZodError;
    try {
      z.object({ id: z.string() }).parse({});
      throw new Error('unreachable');
    } catch (error) {
      zodError = error as ZodError;
    }
    const { json } = callErrorHandler(zodError!);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INVALID_INPUT', message: 'Request validation failed.' },
    });
  });

  it('should map a body-parser syntax error to INVALID_INPUT', () => {
    const syntaxError = new SyntaxError('Unexpected token') as SyntaxError & { type: string };
    syntaxError.type = 'entity.parse.failed';
    const { status, json } = callErrorHandler(syntaxError);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INVALID_INPUT', message: 'Malformed JSON body.' },
    });
  });

  it('should map an error carrying a 404 status to ROUTE_NOT_FOUND', () => {
    const { status, json } = callErrorHandler({ status: 404 });
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' },
    });
  });

  it('should map an unknown Error to a 500 DATABASE_CONSTRAINT', () => {
    const { status, json } = callErrorHandler(new Error('surprise'));
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'DATABASE_CONSTRAINT', message: 'Internal server error.' },
    });
  });

  it('should handle a non-Error thrown value', () => {
    const { status } = callErrorHandler('a string error');
    expect(status).toHaveBeenCalledWith(500);
  });

  it('should still emit a generic AppError thrown directly', () => {
    const { status, json } = callErrorHandler(
      new AppError('conflict', { errorCode: 'VERSION_CONFLICT' }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VERSION_CONFLICT', message: 'conflict' },
    });
  });
});

describe('routeNotFoundHandler', () => {
  it('should respond with a 404 ROUTE_NOT_FOUND envelope', () => {
    const { req, res, status, json } = fakeReqRes();
    routeNotFoundHandler(req, res);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'ROUTE_NOT_FOUND', message: 'No route matches POST /games.' },
    });
  });
});
