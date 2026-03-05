/**
 * User routes - HTTP API for user identity management
 *
 * Provides endpoints for:
 * - GET /api/user/identity - Get current user identity
 * - POST /api/user/identity - Set user identity
 *
 * All endpoints use handler factories that receive the UserIdentityService instance.
 * Mounted at /api/user in the main server.
 */

import { Router, type Request, type Response } from 'express';
import type { UserIdentityService } from '../services/user-identity-service.js';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('UserRoutes');

/**
 * Get error message from unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Create GET /api/user/identity handler
 *
 * Returns the current user identity with the source it was resolved from.
 *
 * Response: `{ "success": true, "userName": string, "source": string }`
 * or `{ "success": false, "error": string }` if no identity found
 *
 * @param userIdentityService - Instance of UserIdentityService
 * @returns Express request handler
 */
function createGetIdentityHandler(userIdentityService: UserIdentityService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const identity = await userIdentityService.getIdentity();

      if (!identity) {
        res.status(404).json({
          success: false,
          error: 'No user identity found',
        });
        return;
      }

      res.json({
        success: true,
        userName: identity.userName,
        source: identity.source,
      });
    } catch (error) {
      logger.error('Get user identity failed:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Create POST /api/user/identity handler
 *
 * Sets the user's name in global settings.
 *
 * Request body: `{ "userName": string }`
 * Response: `{ "success": true, "userName": string, "source": "settings" }`
 *
 * @param userIdentityService - Instance of UserIdentityService
 * @returns Express request handler
 */
function createSetIdentityHandler(userIdentityService: UserIdentityService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { userName } = req.body;

      if (!userName || typeof userName !== 'string') {
        res.status(400).json({
          success: false,
          error: 'userName is required and must be a string',
        });
        return;
      }

      await userIdentityService.setUserName(userName);

      res.json({
        success: true,
        userName,
        source: 'settings',
      });
    } catch (error) {
      logger.error('Set user identity failed:', error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}

/**
 * Create user router with all endpoints
 *
 * Registers handlers for all user-related HTTP endpoints.
 *
 * Endpoints:
 * - GET /identity - Get current user identity
 * - POST /identity - Set user name in settings
 *
 * @param userIdentityService - Instance of UserIdentityService
 * @returns Express Router configured with all user endpoints
 */
export function createUserRoutes(userIdentityService: UserIdentityService): Router {
  const router = Router();

  router.get('/identity', createGetIdentityHandler(userIdentityService));
  router.post('/identity', createSetIdentityHandler(userIdentityService));

  return router;
}
