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

      // 3b. Create coding-rules.md (always — useful even without research)
      const detectedConfig = await detectProjectConfig(realPath, research);
      const codingRules = generateCodingRules(research, detectedConfig);
      const rulesPath = path.join(automakerDir, 'context', 'coding-rules.md');
      try {
        await fs.access(rulesPath);
        filesCreated.push('.automaker/context/coding-rules.md (already exists)');
      } catch {
        await fs.writeFile(rulesPath, codingRules, 'utf-8');
        filesCreated.push('.automaker/context/coding-rules.md');
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
 * Detected project configuration sourced from actual config files on disk.
 */
interface DetectedProjectConfig {
  /** Parsed Prettier config object (from .prettierrc, .prettierrc.json, etc.) */
  prettier?: Record<string, unknown>;
  /** Detected ESLint configuration metadata */
  eslint?: {
    extendsConfigs?: string[];
    plugins?: string[];
    isV9FlatConfig?: boolean;
  };
  /** tsconfig compilerOptions.paths — used to derive import conventions */
  tsconfigPaths?: Record<string, string[]>;
  /** Exact test run command from package.json scripts */
  testCommand?: string;
  /** Exact format run command from package.json scripts */
  formatCommand?: string;
  /** Exact lint run command from package.json scripts */
  lintCommand?: string;
}

/**
 * Read actual config files from disk to enrich coding-rules.md with concrete values.
 * Failures are silently swallowed — this is best-effort enrichment.
 */
async function detectProjectConfig(
  projectPath: string,
  research?: RepoResearchResult
): Promise<DetectedProjectConfig> {
  const config: DetectedProjectConfig = {};

  // --- Prettier config ---
  const prettierFiles = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    'prettier.config.json',
  ];
  for (const file of prettierFiles) {
    try {
      const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
      config.prettier = JSON.parse(content) as Record<string, unknown>;
      break;
    } catch {
      // try next candidate
    }
  }

  // --- ESLint config ---
  // Check for v9 flat config first
  const eslintV9Files = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'];
  for (const file of eslintV9Files) {
    try {
      await fs.access(path.join(projectPath, file));
      config.eslint = { isV9FlatConfig: true };
      break;
    } catch {
      // try next
    }
  }

  // Fall back to legacy .eslintrc.*
  if (!config.eslint) {
    const eslintLegacyFiles = ['.eslintrc.json', '.eslintrc', '.eslintrc.yaml', '.eslintrc.yml'];
    for (const file of eslintLegacyFiles) {
      try {
        const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const extendsRaw = parsed['extends'];
        config.eslint = {
          extendsConfigs: Array.isArray(extendsRaw)
            ? (extendsRaw as string[])
            : extendsRaw
              ? [String(extendsRaw)]
              : [],
          plugins: Array.isArray(parsed['plugins']) ? (parsed['plugins'] as string[]) : [],
          isV9FlatConfig: false,
        };
        break;
      } catch {
        // try next
      }
    }
  }

  // --- tsconfig paths ---
  const tsconfigCandidates = ['tsconfig.json', 'tsconfig.base.json'];
  for (const file of tsconfigCandidates) {
    try {
      const raw = await fs.readFile(path.join(projectPath, file), 'utf-8');
      // Strip single-line and multi-line comments before parsing (tsconfig uses JSONC)
      const stripped = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      const compilerOptions = parsed['compilerOptions'] as Record<string, unknown> | undefined;
      if (compilerOptions?.['paths']) {
        config.tsconfigPaths = compilerOptions['paths'] as Record<string, string[]>;
        break;
      }
    } catch {
      // try next
    }
  }

  // --- Commands from research scripts ---
  const scripts = research?.scripts ?? {};
  if (scripts['test']) config.testCommand = scripts['test'];
  if (scripts['format']) config.formatCommand = scripts['format'];
  if (scripts['lint']) config.lintCommand = scripts['lint'];

  return config;
}

/**
 * Generate coding-rules.md from detected code quality tools and actual config files.
 * Always returns a non-empty string — even minimal projects get a useful starter template.
 */
function generateCodingRules(
  research: RepoResearchResult | undefined,
  detectedConfig: DetectedProjectConfig
): string {
  const sections: string[] = ['# Coding Rules\n'];
  sections.push(
    'Rules and conventions for AI agents working on this codebase. Sourced from detected config files.\n'
  );

  const codeQuality = research?.codeQuality;
  const testing = research?.testing;
  const python = research?.python;
  const pm = research?.monorepo?.packageManager ?? 'npm';
  const runPrefix =
    pm === 'pnpm' ? 'pnpm' : pm === 'bun' ? 'bun' : pm === 'yarn' ? 'yarn' : 'npm run';

  // --- TypeScript ---
  if (codeQuality?.hasTypeScript) {
    const lines = ['## TypeScript\n'];
    lines.push('- All new code must be written in TypeScript');
    if (codeQuality.tsStrict) {
      lines.push('- Strict mode is enabled — no `any` types, handle all null/undefined cases');
    }
    if (codeQuality.tsVersion) {
      lines.push(`- TypeScript version: ${codeQuality.tsVersion}`);
    }
    if (codeQuality.hasCompositeConfig) {
      lines.push('- Uses composite project references — run `tsc --build` for incremental builds');
    }

    // Import conventions from tsconfig paths
    if (detectedConfig.tsconfigPaths && Object.keys(detectedConfig.tsconfigPaths).length > 0) {
      lines.push('\n### Import Conventions\n');
      lines.push('Use path aliases instead of deep relative imports:\n');
      lines.push('```typescript');
      for (const [alias, targets] of Object.entries(detectedConfig.tsconfigPaths).slice(0, 8)) {
        const cleanAlias = alias.replace(/\/\*$/, '');
        const cleanTarget = (targets[0] ?? '').replace(/\/\*$/, '');
        lines.push(`import { ... } from '${cleanAlias}'; // → ${cleanTarget}`);
      }
      lines.push('```');
    }

    sections.push(lines.join('\n') + '\n');
  }

  // --- Formatting ---
  if (codeQuality?.hasPrettier) {
    const lines = ['## Formatting\n'];
    lines.push('- Prettier is configured — **always run the formatter before committing**');
    lines.push('- Do NOT manually format code; let Prettier handle it');

    if (detectedConfig.prettier && Object.keys(detectedConfig.prettier).length > 0) {
      lines.push('\n**Prettier config:**\n');
      lines.push('```json');
      lines.push(JSON.stringify(detectedConfig.prettier, null, 2));
      lines.push('```');
    }

    const formatCmd = detectedConfig.formatCommand ? `${runPrefix} format` : `${runPrefix} format`;
    lines.push(`\nRun: \`${formatCmd}\``);
    sections.push(lines.join('\n') + '\n');
  }

  // --- Linting ---
  if (codeQuality?.hasESLint) {
    const version = codeQuality.eslintVersion;
    const isV9 =
      detectedConfig.eslint?.isV9FlatConfig ?? (version ? parseInt(version, 10) >= 9 : false);
    const lines = ['## Linting\n'];
    lines.push(
      `- ESLint ${isV9 ? 'v9+ (flat config — `eslint.config.*`)' : ''} is configured — fix all warnings before submitting code`.trim()
    );

    if (detectedConfig.eslint?.extendsConfigs?.length) {
      lines.push(`- Extends: \`${detectedConfig.eslint.extendsConfigs.join('`, `')}\``);
    }
    if (detectedConfig.eslint?.plugins?.length) {
      lines.push(`- Plugins: \`${detectedConfig.eslint.plugins.join('`, `')}\``);
    }

    const lintCmd = detectedConfig.lintCommand ? `${runPrefix} lint` : `${runPrefix} lint`;
    lines.push(`\nRun: \`${lintCmd}\``);
    sections.push(lines.join('\n') + '\n');
  }

  // --- Pre-commit hooks ---
  if (codeQuality?.hasHusky || codeQuality?.hasLintStaged) {
    sections.push(
      '## Pre-commit Hooks\n\n- Husky + lint-staged is configured — code is linted/formatted automatically on commit\n- Ensure your code passes lint and format checks before committing\n'
    );
  }

  // --- Testing ---
  const hasTestFramework =
    testing?.hasVitest || testing?.hasJest || testing?.hasPlaywright || testing?.hasPytest;
  if (hasTestFramework) {
    const lines = ['## Testing\n'];
    lines.push('- Write tests for all new functionality');

    if (testing?.hasVitest) {
      lines.push('- **Framework**: Vitest (unit + integration)');
      const cmd = detectedConfig.testCommand ?? `${runPrefix} test`;
      lines.push(`- **Run**: \`${cmd}\``);
      if (testing.vitestVersion) lines.push(`- **Version**: ${testing.vitestVersion}`);
    }
    if (testing?.hasJest) {
      lines.push('- **Framework**: Jest (unit + integration)');
      const cmd = detectedConfig.testCommand ?? `${runPrefix} test`;
      lines.push(`- **Run**: \`${cmd}\``);
    }
    if (testing?.hasPlaywright) {
      lines.push('- **E2E Framework**: Playwright');
      lines.push('- **Run**: `npx playwright test`');
      if (testing.playwrightVersion) lines.push(`- **Version**: ${testing.playwrightVersion}`);
    }
    if (testing?.hasPytest) {
      lines.push('- **Python**: pytest');
      lines.push('- **Run**: `pytest`');
    }
    if (testing?.testDirs && testing.testDirs.length > 0) {
      lines.push(`- **Test locations**: \`${testing.testDirs.join('`, `')}\``);
    }

    sections.push(lines.join('\n') + '\n');
  }

  // --- Python ---
  if (python?.hasRuff) {
    sections.push(
      '## Python\n\n- Ruff is configured for linting and formatting\n- Run `ruff check .` and `ruff format .` before committing Python code\n'
    );
  }

  // Fallback for projects with no detected tooling
  if (sections.length === 2) {
    sections.push(
      "## General Guidelines\n\n- Follow the existing code style of this project\n- Write tests for all new functionality\n- Keep functions small and focused\n- Document complex logic with comments\n- Run the project's lint and format commands before committing\n"
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
