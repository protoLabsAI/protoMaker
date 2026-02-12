/**
 * Common utilities for agent management routes
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('AgentManagementAPI');

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function logError(error: unknown, context: string): void {
  logger.error(`${context}:`, error);
}
