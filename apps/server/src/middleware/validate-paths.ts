/**
 * Middleware for validating path parameters against ALLOWED_ROOT_DIRECTORY
 * Provides a clean, reusable way to validate paths without repeating the same
 * try-catch block in every route handler
 */

import type { Request, Response, NextFunction } from 'express';
import { validatePath, PathNotAllowedError } from '@automaker/platform';

/**
 * Regex for valid slug characters: letters, numbers, hyphens, underscores
 * No path separators, no dots (prevents ../), no special characters
 */
const VALID_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Error thrown when a slug is invalid (contains path traversal or invalid characters)
 */
export class InvalidSlugError extends Error {
  constructor(
    public slug: string,
    public paramName: string
  ) {
    super(
      `Invalid ${paramName}: "${slug}" contains invalid characters or path traversal sequences`
    );
    this.name = 'InvalidSlugError';
  }
}

/**
 * Validates a slug to prevent path traversal attacks
 * @param slug - The slug to validate
 * @param paramName - Name of the parameter (for error messages)
 * @throws InvalidSlugError if slug contains invalid characters
 */
export function validateSlug(slug: string, paramName: string): void {
  if (!slug || typeof slug !== 'string') {
    return; // Let route handlers deal with missing required params
  }

  // Check for path traversal sequences
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new InvalidSlugError(slug, paramName);
  }

  // Check against allowed pattern
  if (!VALID_SLUG_PATTERN.test(slug)) {
    throw new InvalidSlugError(slug, paramName);
  }
}

/**
 * Helper to get parameter value from request (checks body first, then query)
 */
function getParamValue(req: Request, paramName: string): unknown {
  // Check body first (for POST/PUT/PATCH requests)
  if (req.body && req.body[paramName] !== undefined) {
    return req.body[paramName];
  }
  // Fall back to query params (for GET requests)
  if (req.query && req.query[paramName] !== undefined) {
    return req.query[paramName];
  }
  return undefined;
}

/**
 * Creates a middleware that validates specified path parameters in req.body or req.query
 * @param paramNames - Names of parameters to validate (e.g., 'projectPath', 'worktreePath')
 * @example
 * router.post('/create', validatePathParams('projectPath'), handler);
 * router.post('/delete', validatePathParams('projectPath', 'worktreePath'), handler);
 * router.post('/send', validatePathParams('workingDirectory?', 'imagePaths[]'), handler);
 * router.get('/logs', validatePathParams('worktreePath'), handler); // Works with query params too
 *
 * Special syntax:
 * - 'paramName?' - Optional parameter (only validated if present)
 * - 'paramName[]' - Array parameter (validates each element)
 */
export function validatePathParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const paramName of paramNames) {
        // Handle optional parameters (paramName?)
        if (paramName.endsWith('?')) {
          const actualName = paramName.slice(0, -1);
          const value = getParamValue(req, actualName);
          if (value && typeof value === 'string') {
            validatePath(value);
          }
          continue;
        }

        // Handle array parameters (paramName[])
        if (paramName.endsWith('[]')) {
          const actualName = paramName.slice(0, -2);
          const values = getParamValue(req, actualName);
          if (Array.isArray(values) && values.length > 0) {
            for (const value of values) {
              if (typeof value === 'string') {
                validatePath(value);
              }
            }
          }
          continue;
        }

        // Handle regular parameters
        const value = getParamValue(req, paramName);
        if (value && typeof value === 'string') {
          validatePath(value);
        }
      }

      next();
    } catch (error) {
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Re-throw unexpected errors
      throw error;
    }
  };
}

/**
 * Creates a middleware that validates slug parameters to prevent path traversal
 * @param paramNames - Names of slug parameters to validate (e.g., 'projectSlug', 'slug')
 * @example
 * router.post('/get', validateSlugs('projectSlug'), handler);
 * router.post('/update', validateSlugs('projectSlug', 'milestoneSlug'), handler);
 *
 * Special syntax:
 * - 'paramName?' - Optional parameter (only validated if present)
 */
export function validateSlugs(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const paramName of paramNames) {
        // Handle optional parameters (paramName?)
        const isOptional = paramName.endsWith('?');
        const actualName = isOptional ? paramName.slice(0, -1) : paramName;

        const value = getParamValue(req, actualName);

        if (value && typeof value === 'string') {
          validateSlug(value, actualName);
        }
      }

      next();
    } catch (error) {
      if (error instanceof InvalidSlugError) {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }

      // Re-throw unexpected errors
      throw error;
    }
  };
}
