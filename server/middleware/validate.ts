import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

// Generic request-body validator (plan_v6.md §5: "an Express middleware runs
// Schema.parse() on body/params per route"). A ZodError thrown here is caught by the
// error middleware and mapped to 400 INVALID_INPUT — routes never validate inline.
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
