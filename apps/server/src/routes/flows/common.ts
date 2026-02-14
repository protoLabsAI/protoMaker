/**
 * Common utilities for flows routes
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('FlowsRoutes');

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Log error with context
 */
export function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}
