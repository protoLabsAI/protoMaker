/**
 * POST /auth-codex endpoint - Authenticate Codex CLI
 */

import type { Request, Response } from 'express';
import { logError, getErrorMessage } from '../common.js';
import * as fs from 'fs';
import * as path from 'path';

export function createAuthCodexHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Remove the disconnected marker file to reconnect the app to the CLI
      const markerPath = path.join(process.cwd(), '.automaker', '.codex-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      // Use the same detection logic as the Codex provider
      const { getCodexAuthIndicators } = await import('@protolabs-ai/platform');
      const indicators = await getCodexAuthIndicators();

      const isAlreadyAuthenticated =
        indicators.hasApiKey || indicators.hasAuthFile || indicators.hasOAuthToken;

      if (isAlreadyAuthenticated) {
        // Already has authentication, just reconnect
        res.json({
          success: true,
          message: 'Codex CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        res.json({
          success: true,
          message:
            'Codex CLI is now linked with the app. If prompted, please authenticate with "codex login" in your terminal.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth Codex failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link Codex CLI with the app',
      });
    }
  };
}
