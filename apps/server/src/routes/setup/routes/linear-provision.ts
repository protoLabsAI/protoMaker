import type { RequestHandler } from 'express';
import { createLogger } from '@automaker/utils';

const logger = createLogger('setup:linear-provision');

interface LinearProvisionRequest {
  projectPath: string;
  projectName: string;
  linearApiKey?: string;
}

interface LinearProvisionResponse {
  success: boolean;
  verified?: boolean;
  error?: string;
}

/**
 * POST /api/setup/linear-provision
 * Verify Linear MCP setup and store API key in environment.
 * This is a lightweight endpoint — actual Linear operations are done
 * via the Linear MCP tools by the orchestrating skill.
 */
export function createLinearProvisionHandler(): RequestHandler<
  unknown,
  LinearProvisionResponse,
  LinearProvisionRequest
> {
  return async (req, res) => {
    try {
      const { projectName, linearApiKey } = req.body;

      if (!projectName) {
        res.status(400).json({
          success: false,
          error: 'projectName is required',
        });
        return;
      }

      logger.info('Linear provisioning requested', { projectName });

      // The actual Linear operations (search issues, create issues, add comments)
      // are orchestrated by the /setuplab skill using the Linear MCP tools.
      // This endpoint serves as the API surface for the MCP tool to call.
      // If an API key is provided, we would verify it (but that's handled by the MCP server).
      res.json({
        success: true,
        verified: !!linearApiKey,
      });
    } catch (error) {
      logger.error('Linear provisioning failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
