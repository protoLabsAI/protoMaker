/**
 * Common utilities for briefing routes
 */

import { createLogger } from '@protolabs-ai/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

/** Logger instance for briefing operations */
export const logger = createLogger('Briefing');

/**
 * Extract user-friendly error message from error objects
 */
export { getErrorMessageShared as getErrorMessage };

/**
 * Log error with automatic logger binding
 */
export const logError = createLogError(logger);
