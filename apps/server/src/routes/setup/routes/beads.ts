import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabs-ai/utils';
import type { BeadsSetupResult } from '@protolabs-ai/types';

const logger = createLogger('setup:beads');
const execFileAsync = promisify(execFile);

interface BeadsSetupRequest {
  projectPath: string;
}

interface BeadsSetupResponse {
  success: boolean;
  result?: BeadsSetupResult;
  error?: string;
}

/**
 * POST /api/setup/beads
 * Initialize Beads task tracker for a project.
 */
export function createBeadsSetupHandler(): RequestHandler<
  unknown,
  BeadsSetupResponse,
  BeadsSetupRequest
> {
  return async (req, res) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const absolutePath = path.resolve(projectPath);

      // Check if .beads already exists
      const beadsDir = path.join(absolutePath, '.beads');
      try {
        await fs.access(beadsDir);
        logger.info('Beads already initialized', { projectPath: absolutePath });
        res.json({
          success: true,
          result: { success: true, initialized: false, alreadyExists: true },
        });
        return;
      } catch {
        // .beads doesn't exist, proceed with init
      }

      // Check if bd CLI is available
      try {
        await execFileAsync('bd', ['--version'], { timeout: 5000 });
      } catch {
        logger.warn('Beads CLI (bd) not found');
        res.json({
          success: true,
          result: {
            success: false,
            initialized: false,
            alreadyExists: false,
            error: 'Beads CLI (bd) not installed. Install with: npm install -g beads',
          },
        });
        return;
      }

      // Run bd init
      try {
        await execFileAsync('bd', ['init'], { cwd: absolutePath, timeout: 10000 });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('bd init failed', { error: msg });
        res.json({
          success: true,
          result: { success: false, initialized: false, alreadyExists: false, error: msg },
        });
        return;
      }

      // Set no-daemon: true in config
      const configPath = path.join(beadsDir, 'config.yaml');
      try {
        let config = await fs.readFile(configPath, 'utf-8');
        if (!config.includes('no-daemon')) {
          config += '\nno-daemon: true\n';
          await fs.writeFile(configPath, config, 'utf-8');
        }
      } catch {
        // Config might not exist yet, create it
        await fs.writeFile(configPath, 'no-daemon: true\n', 'utf-8');
      }

      logger.info('Beads initialized', { projectPath: absolutePath });
      res.json({
        success: true,
        result: { success: true, initialized: true, alreadyExists: false },
      });
    } catch (error) {
      logger.error('Beads setup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
