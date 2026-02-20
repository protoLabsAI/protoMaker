/**
 * Common utilities for HITL form routes
 */

import { createLogger } from '@automaker/utils';
import { getErrorMessage as getErrorMessageShared, createLogError } from '../common.js';

export const logger = createLogger('HITLForms');

export { getErrorMessageShared as getErrorMessage };

export const logError = createLogError(logger);
