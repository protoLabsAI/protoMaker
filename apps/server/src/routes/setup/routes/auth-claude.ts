/**
 * POST /auth-claude endpoint - Auth Claude
 */

import type { Request, Response } from 'express';
import { getErrorMessage, logError } from '../common.js';
import * as fs from 'fs';
import * as path from 'path';

export function createAuthClaudeHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      // Remove the disconnected marker file to reconnect the app to the CLI
      const markerPath = path.join(process.cwd(), '.automaker', '.claude-disconnected');
      if (fs.existsSync(markerPath)) {
        fs.unlinkSync(markerPath);
      }

      // Check if CLI is already authenticated by checking auth indicators
      const { getClaudeAuthIndicators } = await import('@automaker/platform');
      const indicators = await getClaudeAuthIndicators();
      const isAlreadyAuthenticated =
        indicators.hasStatsCacheWithActivity ||
        (indicators.hasSettingsFile && indicators.hasProjectsSessions) ||
        indicators.hasCredentialsFile;

      if (isAlreadyAuthenticated) {
        // CLI is already authenticated, just reconnect
        res.json({
          success: true,
          message: 'Claude CLI is now linked with the app',
          wasAlreadyAuthenticated: true,
        });
      } else {
        // CLI needs authentication - but we can't run claude login here
        // because it requires browser OAuth. Just reconnect and let the user authenticate if needed.
        res.json({
          success: true,
          message:
            'Claude CLI is now linked with the app. If prompted, please authenticate with "claude login" in your terminal.',
          requiresManualAuth: true,
        });
      }
    } catch (error) {
      logError(error, 'Auth Claude failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
        message: 'Failed to link Claude CLI with the app',
      });
    }
  };
}
