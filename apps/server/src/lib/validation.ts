/**
 * Shared Zod schemas and validateBody middleware for Express route input validation
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Validates a non-empty absolute path string
 */
export const projectPathSchema = z
  .string()
  .min(1, 'projectPath must not be empty')
  .refine((val) => val.startsWith('/'), { message: 'projectPath must be an absolute path' });

/**
 * Validates a non-empty feature ID string
 */
export const featureIdSchema = z.string().min(1, 'featureId must not be empty');

/**
 * Common pagination query parameters
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Express middleware that validates req.body against a Zod schema.
 * Returns 400 with Zod error details when validation fails.
 * On success, replaces req.body with the parsed (typed) value.
 *
 * @example
 * const schema = z.object({ projectPath: projectPathSchema });
 * router.post('/list', validateBody(schema), handler);
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
