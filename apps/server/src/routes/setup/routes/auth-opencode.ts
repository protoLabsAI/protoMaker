/**
 * POST /auth-opencode endpoint - Authenticate OpenCode CLI
 */

import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';
import * as fs from 'fs';
import * as path from 'path';

export function createAuthOpencodeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Remove the disconnected marker file to reconnect the app to the CLI
      const markerPath = path.join(process.cwd(), '.automaker', '.opencode-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      // Check if OpenCode is already authenticated
      // For OpenCode, check if there's an auth token or API key
      const hasApiKey = !!process.env.OPENCODE_API_KEY;

      if (hasApiKey) {
        // Already has authentication, just reconnect
        res.json({
          success: true,
          message: 'OpenCode CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'OpenCode CLI is now linked with the app. If prompted, please authenticate with OpenCode.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth OpenCode failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link OpenCode CLI with the app',
      });
    }
  };
}
