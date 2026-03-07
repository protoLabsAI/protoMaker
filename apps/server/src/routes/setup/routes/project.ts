import type { RequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import { ensureAutomakerDir, writeProtoConfig, type ProtoConfig } from '@protolabsai/platform';
import { SettingsService } from '../../../services/settings-service.js';
import type { RepoResearchResult } from '@protolabsai/types';

const logger = createLogger('setup:project');

interface ProjectSetupRequest {
  projectPath: string;
  research?: RepoResearchResult;
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
      const { projectPath, research } = req.body;

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
      } catch (_error) {
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

      // 3. Create initial CLAUDE.md with project context (research-aware)
      const projectName = path.basename(realPath);
      const claudeMd = generateClaudeMd(projectName, research);

      const claudeMdPath = path.join(automakerDir, 'context', 'CLAUDE.md');
      try {
        await fs.access(claudeMdPath);
        filesCreated.push('.automaker/context/CLAUDE.md (already exists)');
      } catch {
        await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
        filesCreated.push('.automaker/context/CLAUDE.md');
      }

      // 3b. Create coding-rules.md if research detected linting/formatting tools
      if (research) {
        const codingRules = generateCodingRules(research);
        if (codingRules) {
          const rulesPath = path.join(automakerDir, 'context', 'coding-rules.md');
          try {
            await fs.access(rulesPath);
            filesCreated.push('.automaker/context/coding-rules.md (already exists)');
          } catch {
            await fs.writeFile(rulesPath, codingRules, 'utf-8');
            filesCreated.push('.automaker/context/coding-rules.md');
          }
        }
      }

      // 3c. Generate proto.config.yaml from research results
      const protoConfigPath = path.join(realPath, 'proto.config.yaml');
      try {
        await fs.access(protoConfigPath);
        filesCreated.push('proto.config.yaml (already exists)');
      } catch {
        // File doesn't exist — generate from research
        const protoConfig = buildProtoConfig(projectName, research);
        await writeProtoConfig(realPath, protoConfig);
        filesCreated.push('proto.config.yaml');
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

/**
 * Generate a CLAUDE.md file tailored to the detected tech stack.
 */
function generateClaudeMd(projectName: string, research?: RepoResearchResult): string {
  if (!research) {
    // Fallback to generic template
    return `# ${projectName}

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

${projectName} is a project managed with Automaker ProtoLab.

## Important Guidelines

- Follow coding standards and best practices for this project
- Document significant architectural decisions
- Keep code clean, tested, and maintainable
`;
  }

  const sections: string[] = [`# ${projectName}\n`];
  sections.push(
    'This file provides guidance to Claude Code when working with code in this repository.\n'
  );

  // Tech stack overview
  const stack: string[] = [];
  if (research.codeQuality.hasTypeScript)
    stack.push(`TypeScript ${research.codeQuality.tsVersion ?? ''}`);
  if (research.frontend.framework && research.frontend.framework !== 'none')
    stack.push(research.frontend.framework);
  if (research.frontend.metaFramework && research.frontend.metaFramework !== 'none')
    stack.push(
      `${research.frontend.metaFramework} ${research.frontend.metaFrameworkVersion ?? ''}`
    );
  if (research.backend.hasExpress) stack.push('Express');
  if (research.backend.hasFastAPI) stack.push('FastAPI');
  if (research.backend.hasPayload)
    stack.push(`Payload CMS ${research.backend.payloadVersion ?? ''}`);
  if (research.backend.database && research.backend.database !== 'none')
    stack.push(research.backend.database);

  if (stack.length > 0) {
    sections.push(`## Tech Stack\n\n${stack.map((s) => `- ${s.trim()}`).join('\n')}\n`);
  }

  // Monorepo info
  if (research.monorepo.isMonorepo) {
    const lines = [`## Monorepo Structure\n`];
    lines.push(`- **Package manager**: ${research.monorepo.packageManager}`);
    if (research.monorepo.tool) lines.push(`- **Build tool**: ${research.monorepo.tool}`);
    if (research.monorepo.packages.length > 0) {
      lines.push('\n### Packages\n');
      for (const pkg of research.monorepo.packages) {
        lines.push(`- \`${pkg.path}\` — ${pkg.name} (${pkg.type})`);
      }
    }
    sections.push(lines.join('\n') + '\n');
  }

  // Common commands
  const commands: string[] = [];
  if (research.monorepo.packageManager === 'pnpm') {
    commands.push('pnpm install        # Install dependencies');
    commands.push('pnpm build          # Build all packages');
    commands.push('pnpm test           # Run tests');
    commands.push('pnpm dev            # Start dev server');
  } else if (research.monorepo.packageManager === 'bun') {
    commands.push('bun install          # Install dependencies');
    commands.push('bun run build        # Build all packages');
    commands.push('bun test             # Run tests');
    commands.push('bun dev              # Start dev server');
  } else {
    commands.push('npm install          # Install dependencies');
    commands.push('npm run build        # Build all packages');
    commands.push('npm test             # Run tests');
    commands.push('npm run dev          # Start dev server');
  }
  if (research.codeQuality.hasPrettier) commands.push('npm run format       # Format code');
  if (research.codeQuality.hasESLint) commands.push('npm run lint         # Lint code');

  sections.push(`## Common Commands\n\n\`\`\`bash\n${commands.join('\n')}\n\`\`\`\n`);

  // Testing
  if (research.testing.hasVitest || research.testing.hasJest || research.testing.hasPlaywright) {
    const lines = [`## Testing\n`];
    if (research.testing.hasVitest) lines.push(`- **Unit/integration**: Vitest`);
    if (research.testing.hasJest) lines.push(`- **Unit/integration**: Jest`);
    if (research.testing.hasPlaywright) lines.push(`- **E2E**: Playwright`);
    if (research.testing.hasPytest) lines.push(`- **Python**: pytest`);
    if (research.testing.testDirs.length > 0) {
      lines.push(`- **Test directories**: ${research.testing.testDirs.join(', ')}`);
    }
    sections.push(lines.join('\n') + '\n');
  }

  // Import patterns
  if (research.monorepo.isMonorepo && research.monorepo.packages.length > 0) {
    const pkgNames = research.monorepo.packages.map((p) => p.name).filter((n) => n.startsWith('@'));
    if (pkgNames.length > 0) {
      sections.push(
        `## Import Conventions\n\nAlways import from workspace packages:\n\n\`\`\`typescript\n${pkgNames
          .slice(0, 5)
          .map((n) => `import { ... } from '${n}';`)
          .join('\n')}\n\`\`\`\n`
      );
    }
  }

  return sections.join('\n');
}

/**
 * Generate coding-rules.md from detected code quality tools.
 * Returns null if no relevant tools are detected.
 */
function generateCodingRules(research: RepoResearchResult): string | null {
  const { codeQuality, testing, python } = research;

  if (
    !codeQuality.hasPrettier &&
    !codeQuality.hasESLint &&
    !codeQuality.hasTypeScript &&
    !python.hasRuff
  ) {
    return null;
  }

  const sections: string[] = ['# Coding Rules\n'];
  sections.push('Rules for AI agents working on this codebase.\n');

  if (codeQuality.hasTypeScript) {
    const lines = ['## TypeScript\n'];
    if (codeQuality.tsStrict) {
      lines.push('- Strict mode is enabled — no `any` types, handle all null cases');
    }
    lines.push('- All new code must be written in TypeScript');
    if (codeQuality.hasCompositeConfig) {
      lines.push('- Uses composite project references — run `tsc --build` for incremental builds');
    }
    sections.push(lines.join('\n') + '\n');
  }

  if (codeQuality.hasPrettier) {
    sections.push(
      '## Formatting\n\n- Prettier is configured — run `npm run format` before committing\n- Do NOT manually format code; let Prettier handle it\n'
    );
  }

  if (codeQuality.hasESLint) {
    const version = codeQuality.eslintVersion;
    const isV9 = version && parseInt(version, 10) >= 9;
    sections.push(
      `## Linting\n\n- ESLint ${isV9 ? 'v9+ (flat config)' : ''} is configured — fix all lint warnings\n- Run \`npm run lint\` to check\n`
    );
  }

  if (codeQuality.hasHusky || codeQuality.hasLintStaged) {
    sections.push(
      '## Pre-commit Hooks\n\n- Husky + lint-staged runs on commit — ensure code passes before committing\n'
    );
  }

  if (testing.hasVitest || testing.hasJest || testing.hasPlaywright) {
    const lines = ['## Testing\n'];
    lines.push('- Write tests for all new functionality');
    if (testing.hasVitest) lines.push('- Use Vitest for unit and integration tests');
    if (testing.hasJest) lines.push('- Use Jest for unit tests');
    if (testing.hasPlaywright) lines.push('- Use Playwright for end-to-end tests');
    sections.push(lines.join('\n') + '\n');
  }

  if (python.hasRuff) {
    sections.push(
      '## Python\n\n- Ruff is configured for linting and formatting\n- Run `ruff check .` and `ruff format .` before committing Python code\n'
    );
  }

  return sections.join('\n');
}

/**
 * Build a ProtoConfig object from research results.
 * Maps detected tech stack, package.json scripts, and git config into the schema.
 */
function buildProtoConfig(projectName: string, research?: RepoResearchResult): ProtoConfig {
  const config: ProtoConfig = {
    name: projectName,
  };

  if (!research) return config;

  // Tech stack from detection
  const techStack: Record<string, unknown> = {
    packageManager: research.monorepo.packageManager,
  };

  if (research.codeQuality.hasTypeScript) {
    techStack.language = 'typescript';
    if (research.codeQuality.tsVersion) {
      techStack.typescriptVersion = research.codeQuality.tsVersion;
    }
  }

  if (research.frontend.framework && research.frontend.framework !== 'none') {
    techStack.framework = research.frontend.framework;
    if (research.frontend.reactVersion) {
      techStack.reactVersion = research.frontend.reactVersion;
    }
  }

  if (research.frontend.metaFramework && research.frontend.metaFramework !== 'none') {
    techStack.metaFramework = research.frontend.metaFramework;
    if (research.frontend.metaFrameworkVersion) {
      techStack.metaFrameworkVersion = research.frontend.metaFrameworkVersion;
    }
  }

  if (research.backend.database && research.backend.database !== 'none') {
    techStack.database = research.backend.database;
  }

  if (research.monorepo.isMonorepo && research.monorepo.tool) {
    techStack.monorepoTool = research.monorepo.tool;
  }

  config['techStack'] = techStack;

  // Commands from package.json scripts
  const scripts = research.scripts ?? {};
  const commands: Record<string, unknown> = {};
  if (scripts['build']) commands['build'] = scripts['build'];
  if (scripts['test']) commands['test'] = scripts['test'];
  if (scripts['dev']) commands['dev'] = scripts['dev'];
  if (scripts['start']) commands['start'] = scripts['start'];
  if (scripts['lint']) commands['lint'] = scripts['lint'];
  if (scripts['format']) commands['format'] = scripts['format'];

  if (Object.keys(commands).length > 0) {
    config['commands'] = commands;
  }

  // Git section from detected branch strategy
  if (research.git.isRepo) {
    const git: Record<string, unknown> = {};
    if (research.git.defaultBranch) git['defaultBranch'] = research.git.defaultBranch;
    if (research.git.provider) git['provider'] = research.git.provider;
    if (research.git.remoteUrl) git['remoteUrl'] = research.git.remoteUrl;
    if (Object.keys(git).length > 0) {
      config['git'] = git;
    }
  }

  return config;
}
