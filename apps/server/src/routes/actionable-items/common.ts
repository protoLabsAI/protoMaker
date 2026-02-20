/**
 * Common utilities for actionable-items routes
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

export const logger = createLogger('ActionableItems');

export { getErrorMessageShared as getErrorMessage };

export const logError = createLogError(logger);
