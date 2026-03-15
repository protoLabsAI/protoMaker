import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@protolabsai/utils';
import {
  scaffoldDocsStarter,
  scaffoldPortfolioStarter,
  scaffoldLandingPageStarter,
  scaffoldGeneralStarter,
  scaffoldAiAgentAppStarter,
} from '@protolabsai/templates';

const logger = createLogger('setup:scaffold-starter');

interface ScaffoldStarterRequest {
  projectPath: string;
  kitType: 'docs' | 'portfolio' | 'landing-page' | 'general' | 'ai-agent-app';
  projectName?: string;
}

interface ScaffoldStarterResponse {
  success: boolean;
  outputDir: string;
  filesCreated: string[];
  error?: string;
}

/**
 * POST /api/setup/scaffold-starter
 * Scaffold a docs or portfolio starter kit into an existing project directory.
 */
export function createScaffoldStarterHandler(): RequestHandler<
  unknown,
  ScaffoldStarterResponse,
  ScaffoldStarterRequest
> {
  return async (req, res) => {
    try {
      const { projectPath, kitType, projectName } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          outputDir: '',
          filesCreated: [],
          error: 'projectPath is required',
        });
        return;
      }

      if (
        !kitType ||
        !['docs', 'portfolio', 'landing-page', 'general', 'ai-agent-app'].includes(kitType)
      ) {
        res.status(400).json({
          success: false,
          outputDir: '',
          filesCreated: [],
          error:
            'kitType must be "docs", "portfolio", "landing-page", "general", or "ai-agent-app"',
        });
        return;
      }

      const absolutePath = path.resolve(projectPath);

      // Create directory if it doesn't exist, validate if it does
      try {
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) {
          res.status(400).json({
            success: false,
            outputDir: absolutePath,
            filesCreated: [],
            error: `Path is not a directory: ${absolutePath}`,
          });
          return;
        }
      } catch {
        // Directory doesn't exist — create it
        await fs.mkdir(absolutePath, { recursive: true });
      }

      // Resolve symlinks and validate against base directory if configured
      const realPath = await fs.realpath(absolutePath);
      const allowedRoot = process.env.ALLOWED_ROOT_DIRECTORY;

      if (allowedRoot) {
        const realAllowedRoot = await fs.realpath(allowedRoot);
        if (!realPath.startsWith(realAllowedRoot + path.sep) && realPath !== realAllowedRoot) {
          logger.warn('Path traversal attempt blocked', {
            requestedPath: absolutePath,
            realPath,
            allowedRoot: realAllowedRoot,
          });
          res.status(403).json({
            success: false,
            outputDir: absolutePath,
            filesCreated: [],
            error: 'Access denied: path is outside allowed directory',
          });
          return;
        }
      }

      const resolvedProjectName = projectName ?? path.basename(realPath);
      const options = { projectName: resolvedProjectName, outputDir: realPath };

      logger.info('Scaffolding starter kit', { kitType, projectPath: realPath });

      const scaffolders = {
        docs: scaffoldDocsStarter,
        portfolio: scaffoldPortfolioStarter,
        'landing-page': scaffoldLandingPageStarter,
        general: scaffoldGeneralStarter,
        'ai-agent-app': scaffoldAiAgentAppStarter,
      };
      const result = await scaffolders[kitType](options);

      if (!result.success) {
        logger.error('Scaffold failed', { error: result.error });
        res.status(500).json(result);
        return;
      }

      logger.info('Scaffold complete', { kitType, projectPath: realPath });
      res.json(result);
    } catch (error) {
      logger.error('Scaffold starter failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        outputDir: '',
        filesCreated: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
