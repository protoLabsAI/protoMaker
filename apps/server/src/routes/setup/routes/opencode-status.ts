/**
 * GET /opencode-status endpoint - Get OpenCode CLI installation and auth status
 */

import type { Request, Response } from 'express';
import { OpencodeProvider } from '../../../providers/opencode-provider.js';
import { getErrorMessage, logError } from '../common.js';

/**
 * Creates handler for GET /api/setup/opencode-status
 * Returns OpenCode CLI installation and authentication status
 */
export function createOpencodeStatusHandler() {
  const installCommand = 'curl -fsSL https://opencode.ai/install | bash';
  const loginCommand = 'opencode auth login';

  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = new OpencodeProvider();
      const status = await provider.detectInstallation();

      res.json({
        success: true,
        installed: status.installed,
        version: status.version || null,
        path: status.path || null,
        auth: {
          authenticated: status.authenticated || false,
          method: status.authMethod || 'none',
          hasApiKey: status.hasApiKey || false,
          hasEnvApiKey: status.hasEnvApiKey || false,
          hasOAuthToken: status.hasOAuthToken || false,
        },
        recommendation: status.installed
          ? undefined
          : 'Install OpenCode CLI to use multi-provider AI models.',
        installCommand,
        loginCommand,
        installCommands: {
          macos: installCommand,
          linux: installCommand,
          npm: 'npm install -g opencode-ai',
        },
      });
    } catch (error) {
      logError(error, 'Get OpenCode status failed');
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  };
}
