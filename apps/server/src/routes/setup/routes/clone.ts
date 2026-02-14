import type { RequestHandler } from 'express';
import { createLogger } from '@automaker/utils';
import { labsService } from '../../../services/labs-service.js';

const logger = createLogger('setup:clone');

interface CloneRequest {
  gitUrl: string;
  directoryName?: string;
  shallow?: boolean;
}

interface CloneResponse {
  success: boolean;
  path?: string;
  wasRefreshed?: boolean;
  branch?: string;
  error?: string;
}

/**
 * POST /api/setup/clone
 * Clone a git repository to the ./labs directory
 */
export function createCloneHandler(): RequestHandler<unknown, CloneResponse, CloneRequest> {
  return async (req, res) => {
    try {
      const { gitUrl, directoryName, shallow = true } = req.body;

      if (!gitUrl) {
        res.status(400).json({
          success: false,
          error: 'gitUrl is required',
        });
        return;
      }

      logger.info('Clone request received', {
        gitUrl: gitUrl.replace(/:\/\/[^@]+@/, '://***@'),
        directoryName,
        shallow,
      });

      const result = await labsService.cloneRepo({
        gitUrl,
        directoryName,
        shallow,
      });

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      logger.info('Clone completed successfully', {
        path: result.path,
        wasRefreshed: result.wasRefreshed,
        branch: result.branch,
      });

      res.json(result);
    } catch (error) {
      logger.error('Clone request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
