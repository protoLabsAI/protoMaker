/**
 * Middleware for validating request body against a Zod schema.
 * Returns 400 with a structured error message if validation fails.
 * On success, sets req.body to the parsed (validated) value and calls next().
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      res.status(400).json({ success: false, error: message });
      return;
    }
    req.body = result.data;
    next();
  };
}
