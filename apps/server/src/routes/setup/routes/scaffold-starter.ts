import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '@protolabsai/utils';
import { scaffoldDocsStarter, scaffoldPortfolioStarter } from '@protolabsai/templates';

const logger = createLogger('setup:scaffold-starter');

interface ScaffoldStarterRequest {
  projectPath: string;
  kitType: 'docs' | 'portfolio';
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

      if (!kitType || (kitType !== 'docs' && kitType !== 'portfolio')) {
        res.status(400).json({
          success: false,
          outputDir: '',
          filesCreated: [],
          error: 'kitType must be "docs" or "portfolio"',
        });
        return;
      }

      const absolutePath = path.resolve(projectPath);

      // Validate path exists and is a directory
      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch (_error) {
        res.status(400).json({
          success: false,
          outputDir: absolutePath,
          filesCreated: [],
          error: `Path does not exist or is not accessible: ${absolutePath}`,
        });
        return;
      }

      if (!stats.isDirectory()) {
        res.status(400).json({
          success: false,
          outputDir: absolutePath,
          filesCreated: [],
          error: `Path is not a directory: ${absolutePath}`,
        });
        return;
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

      const result =
        kitType === 'docs'
          ? await scaffoldDocsStarter(options)
          : await scaffoldPortfolioStarter(options);

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
