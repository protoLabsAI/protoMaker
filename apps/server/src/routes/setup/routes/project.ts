import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createLogger } from '@automaker/utils';
import { ensureAutomakerDir } from '@automaker/platform';
import { SettingsService } from '../../../services/settings-service.js';

const logger = createLogger('setup:project');

interface ProjectSetupRequest {
  projectPath: string;
}

interface ProjectSetupResponse {
  success: boolean;
  filesCreated: string[];
  projectAdded: boolean;
  error?: string;
}

/**
 * POST /api/setup/project
 * Initialize Automaker for a new repository
 */
export function createSetupProjectHandler(
  settingsService: SettingsService
): RequestHandler<unknown, ProjectSetupResponse, ProjectSetupRequest> {
  return async (req, res) => {
    try {
      const { projectPath } = req.body;

      if (!projectPath) {
        res.status(400).json({
          success: false,
          filesCreated: [],
          projectAdded: false,
          error: 'projectPath is required',
        });
        return;
      }

      // Resolve absolute path
      const absolutePath = path.resolve(projectPath);

      // Validate path exists and is a directory
      let stats;
      try {
        stats = await fs.stat(absolutePath);
      } catch (error) {
        res.status(400).json({
          success: false,
          filesCreated: [],
          projectAdded: false,
          error: `Path does not exist or is not accessible: ${absolutePath}`,
        });
        return;
      }

      if (!stats.isDirectory()) {
        res.status(400).json({
          success: false,
          filesCreated: [],
          projectAdded: false,
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
            filesCreated: [],
            projectAdded: false,
            error: 'Access denied: path is outside allowed directory',
          });
          return;
        }
      }

      logger.info('Setting up project', { projectPath: realPath });

      const filesCreated: string[] = [];

      // 1. Create .automaker/ directory structure
      const automakerDir = path.join(realPath, '.automaker');
      await ensureAutomakerDir(realPath);
      filesCreated.push('.automaker/');

      // Create subdirectories
      const subdirs = ['features', 'context', 'memory', '.backups'];
      for (const subdir of subdirs) {
        const dirPath = path.join(automakerDir, subdir);
        await fs.mkdir(dirPath, { recursive: true });
        filesCreated.push(`.automaker/${subdir}/`);
      }

      // 2. Generate protolab.config with sensible defaults
      const protolabConfig = {
        name: path.basename(realPath),
        version: '0.1.0',
        protolab: {
          enabled: true,
        },
        settings: {
          // Placeholder for future settings
        },
      };

      const configPath = path.join(realPath, 'protolab.config');
      try {
        await fs.access(configPath);
        filesCreated.push('protolab.config (already exists)');
      } catch {
        // File doesn't exist, create it
        await fs.writeFile(configPath, JSON.stringify(protolabConfig, null, 2), 'utf-8');
        filesCreated.push('protolab.config');
      }

      // 3. Create initial CLAUDE.md with project context
      const projectName = path.basename(realPath);
      const claudeMd = `# ${projectName}

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

${projectName} is a project managed with Automaker ProtoLab.

## Important Guidelines

- Follow coding standards and best practices for this project
- Document significant architectural decisions
- Keep code clean, tested, and maintainable

## Common Commands

\`\`\`bash
# Add your common commands here
\`\`\`

## Architecture

Describe your project architecture here.

## Development Workflow

Describe your development workflow here.
`;

      const claudeMdPath = path.join(automakerDir, 'context', 'CLAUDE.md');
      try {
        await fs.access(claudeMdPath);
        filesCreated.push('.automaker/context/CLAUDE.md (already exists)');
      } catch {
        // File doesn't exist, create it
        await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
        filesCreated.push('.automaker/context/CLAUDE.md');
      }

      // 4. Add project to Automaker settings if not already present
      let projectAdded = false;

      try {
        // Check if project already exists
        const existingSettings = await settingsService.getGlobalSettings();
        const projectExists = existingSettings.projects?.some((p) => p.path === realPath);

        if (!projectExists) {
          // Add project to settings
          await settingsService.updateGlobalSettings({
            projects: [
              ...(existingSettings.projects || []),
              {
                id: crypto.randomUUID(),
                path: realPath,
                name: projectName,
                lastOpened: new Date().toISOString(),
              },
            ],
          });
          projectAdded = true;
          logger.info('Added project to settings', { projectPath: realPath });
        } else {
          logger.info('Project already exists in settings', { projectPath: realPath });
        }
      } catch (error) {
        logger.warn('Failed to add project to settings', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the whole operation if we can't add to settings
      }

      logger.info('Project setup complete', { projectPath: realPath, filesCreated });

      res.json({
        success: true,
        filesCreated,
        projectAdded,
      });
    } catch (error) {
      logger.error('Project setup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        success: false,
        filesCreated: [],
        projectAdded: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
