/**
 * Phase 3: Initialize
 *
 * Scaffolds .automaker/ directory structure and generates configuration files.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { RepoResearchResult, ProtolabConfig } from '@automaker/types';

export interface InitOptions {
  projectPath: string;
  research: RepoResearchResult;
}

export interface InitResult {
  success: boolean;
  filesCreated: string[];
  error?: string;
}

/**
 * Initialize .automaker/ directory structure and generate configuration files.
 */
export async function init(options: InitOptions): Promise<InitResult> {
  const { projectPath, research } = options;
  const filesCreated: string[] = [];

  try {
    // 1. Create .automaker/ directory structure
    const automakerDir = path.join(projectPath, '.automaker');
    await fs.mkdir(automakerDir, { recursive: true });
    filesCreated.push('.automaker/');

    // Create subdirectories
    const subdirs = ['features', 'context', 'memory', 'skills'];
    for (const subdir of subdirs) {
      const dirPath = path.join(automakerDir, subdir);
      await fs.mkdir(dirPath, { recursive: true });
      filesCreated.push(`.automaker/${subdir}/`);
    }

    // 2. Generate CLAUDE.md from templates
    const claudeMd = await generateClaudeMd(research);
    const claudeMdPath = path.join(automakerDir, 'context', 'CLAUDE.md');

    // Skip if file already exists
    if (await fileExists(claudeMdPath)) {
      filesCreated.push('.automaker/context/CLAUDE.md (already exists)');
    } else {
      await fs.writeFile(claudeMdPath, claudeMd, 'utf-8');
      filesCreated.push('.automaker/context/CLAUDE.md');
    }

    // 3. Generate coding-rules.md from templates
    const codingRules = await generateCodingRules(research);
    const codingRulesPath = path.join(automakerDir, 'context', 'coding-rules.md');

    if (await fileExists(codingRulesPath)) {
      filesCreated.push('.automaker/context/coding-rules.md (already exists)');
    } else {
      await fs.writeFile(codingRulesPath, codingRules, 'utf-8');
      filesCreated.push('.automaker/context/coding-rules.md');
    }

    // 4. Create spec.md placeholder
    const specMd = generateSpecMd(research);
    const specMdPath = path.join(automakerDir, 'context', 'spec.md');

    if (await fileExists(specMdPath)) {
      filesCreated.push('.automaker/context/spec.md (already exists)');
    } else {
      await fs.writeFile(specMdPath, specMd, 'utf-8');
      filesCreated.push('.automaker/context/spec.md');
    }

    // 5. Generate protolab.config with enriched data
    const protolabConfig = generateProtolabConfig(research);
    const configPath = path.join(projectPath, 'protolab.config');

    if (await fileExists(configPath)) {
      filesCreated.push('protolab.config (already exists)');
    } else {
      await fs.writeFile(configPath, JSON.stringify(protolabConfig, null, 2), 'utf-8');
      filesCreated.push('protolab.config');
    }

    return {
      success: true,
      filesCreated,
    };
  } catch (error) {
    return {
      success: false,
      filesCreated,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate CLAUDE.md from templates based on research.
 * Combines base.md + monorepo.md/react.md/python.md based on research.
 */
async function generateClaudeMd(research: RepoResearchResult): Promise<string> {
  const sections: string[] = [];

  // Base template
  sections.push(`# ${research.projectName}\n`);
  sections.push(
    'This file provides guidance to Claude Code when working with code in this repository.\n'
  );
  sections.push(`## Project Overview\n`);
  sections.push(`${research.projectName} is managed with Automaker ProtoLab.\n`);

  // Tech stack overview
  const stack: string[] = [];
  if (research.codeQuality.hasTypeScript) {
    stack.push(`TypeScript ${research.codeQuality.tsVersion ?? ''}`);
  }
  if (research.frontend.framework && research.frontend.framework !== 'none') {
    stack.push(research.frontend.framework);
  }
  if (research.frontend.metaFramework && research.frontend.metaFramework !== 'none') {
    stack.push(
      `${research.frontend.metaFramework} ${research.frontend.metaFrameworkVersion ?? ''}`
    );
  }
  if (research.backend.hasExpress) stack.push('Express');
  if (research.backend.hasFastAPI) stack.push('FastAPI');
  if (research.backend.hasPayload) {
    stack.push(`Payload CMS ${research.backend.payloadVersion ?? ''}`);
  }
  if (research.backend.database && research.backend.database !== 'none') {
    stack.push(research.backend.database);
  }

  if (stack.length > 0) {
    sections.push(`## Tech Stack\n\n${stack.map((s) => `- ${s.trim()}`).join('\n')}\n`);
  }

  // Monorepo template section
  if (research.monorepo.isMonorepo) {
    sections.push('## Monorepo Structure\n');
    sections.push(
      `This is a ${research.monorepo.tool ?? 'workspace'} monorepo using ${research.monorepo.packageManager}.\n`
    );

    if (research.monorepo.packages.length > 0) {
      sections.push('### Workspace Layout\n');
      sections.push('```');
      sections.push(`${research.projectName}/`);
      for (const pkg of research.monorepo.packages) {
        sections.push(`  ${pkg.path}/ — ${pkg.name} (${pkg.type})`);
      }
      sections.push('```\n');
    }

    sections.push('### Import Conventions\n');
    sections.push('Always import from workspace packages using their package name:\n');
    sections.push('```typescript');
    sections.push('// Correct');
    sections.push(`import { something } from '@org/shared';`);
    sections.push('');
    sections.push('// Wrong - never import across packages using relative paths');
    sections.push(`import { something } from '../../packages/shared/src';`);
    sections.push('```\n');
  }

  // React template section
  if (research.frontend.framework === 'react') {
    sections.push('## React Patterns\n');
    sections.push(
      `This project uses React ${research.frontend.reactVersion ?? ''} with ${research.frontend.metaFramework ?? 'Vite'}.\n`
    );
    sections.push('### Component Conventions\n');
    sections.push('- Use functional components with hooks');
    sections.push('- Prefer composition over inheritance');
    sections.push('- Co-locate tests with components');
    sections.push('- Use TypeScript for all components (`.tsx`)\n');

    if (research.frontend.hasTailwind) {
      sections.push('### Styling\n');
      sections.push('- Use Tailwind CSS utility classes');
      sections.push('- Extract repeated patterns into components, not utility functions');
      sections.push('- Use `cn()` helper for conditional classes\n');
    }

    if (research.frontend.hasShadcn) {
      sections.push('- Use shadcn/ui components as the base component library');
      sections.push('- Customize via the theme in `components.json`\n');
    }
  }

  // Python template section
  if (research.python.hasPythonServices) {
    sections.push('## Python Services\n');
    for (const service of research.python.services) {
      sections.push(
        `- \`${service.path}\` — ${service.name}${service.framework ? ` (${service.framework})` : ''}`
      );
    }
    sections.push('');
  }

  // Common commands
  const commands = extractCommands(research);
  if (commands.length > 0) {
    sections.push('## Common Commands\n');
    sections.push('```bash');
    sections.push(...commands);
    sections.push('```\n');
  }

  // Important guidelines
  sections.push('## Important Guidelines\n');
  sections.push('- Follow the coding standards defined in coding-rules.md');
  sections.push('- Write tests for new functionality');
  sections.push('- Keep code clean, typed, and maintainable');
  sections.push('- Use the established patterns in the codebase\n');

  return sections.join('\n');
}

/**
 * Generate coding-rules.md from templates based on research.
 * Combines typescript.md + react.md/python.md based on stack.
 */
async function generateCodingRules(research: RepoResearchResult): Promise<string> {
  const sections: string[] = [];

  sections.push('# Coding Rules\n');
  sections.push('Rules for AI agents working on this codebase.\n');

  // TypeScript rules
  if (research.codeQuality.hasTypeScript) {
    sections.push('## Type Safety\n');
    sections.push('- **strict mode**: Always enabled. Never use `any` without justification.');
    sections.push('- **Explicit return types**: Required for exported functions.');
    sections.push(
      '- **No non-null assertions**: Avoid `!` operator. Use proper narrowing instead.'
    );
    sections.push(
      '- **Prefer `unknown` over `any`**: When the type is truly unknown, use `unknown` and narrow.\n'
    );

    sections.push('## Import Conventions\n');
    sections.push(
      "- Use `type` imports for type-only imports: `import type { Foo } from './foo.js'`"
    );
    sections.push('- Always include `.js` extension in relative imports (ESM)');
    sections.push('- Use workspace package names for cross-package imports\n');

    sections.push('## Naming Conventions\n');
    sections.push('- **Files**: kebab-case (`my-service.ts`)');
    sections.push('- **Types/Interfaces**: PascalCase (`MyService`)');
    sections.push('- **Functions/Variables**: camelCase (`myFunction`)');
    sections.push('- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)');
    sections.push('- **Enums**: PascalCase members (`enum Status { Active, Inactive }`)\n');

    sections.push('## Error Handling\n');
    sections.push('- Use typed error classes for domain errors');
    sections.push('- Always catch specific errors, not bare `catch {}`');
    sections.push('- Log errors with context (what was being attempted)');
    sections.push('- Return `Result<T, E>` types for expected failures\n');

    sections.push('## Async Patterns\n');
    sections.push('- Use `async/await` over raw Promises');
    sections.push('- Always handle Promise rejections');
    sections.push('- Use `Promise.all` for independent parallel operations');
    sections.push('- Add timeouts to external calls\n');
  }

  // React rules
  if (research.frontend.framework === 'react') {
    sections.push('## React Components\n');
    sections.push('- One component per file (except small, tightly coupled helpers)');
    sections.push('- Name file same as component: `MyComponent.tsx`');
    sections.push("- Export component as default only if it's the route page component");
    sections.push('- Use named exports for everything else\n');

    sections.push('## React Hooks\n');
    sections.push('- Prefix custom hooks with `use`: `useMyHook`');
    sections.push('- Keep hooks focused on a single concern');
    sections.push('- Extract complex logic into custom hooks');
    sections.push("- Don't call hooks conditionally\n");

    sections.push('## React Performance\n');
    sections.push('- Use `React.memo()` only when profiling shows a bottleneck');
    sections.push('- Use `useMemo` / `useCallback` only when passing to memoized children');
    sections.push('- Avoid inline object/array creation in JSX props');
    sections.push('- Use `key` prop correctly in lists (no index keys for dynamic lists)\n');
  }

  // Python rules
  if (research.python.hasPythonServices) {
    sections.push('## Python Type Hints\n');
    sections.push('- All function signatures must have type hints');
    sections.push('- Use `from __future__ import annotations` for forward references');
    sections.push('- Use `TypedDict` for structured dictionaries');
    sections.push('- Use `Protocol` for structural typing\n');

    sections.push('## Python Naming\n');
    sections.push('- **Files/modules**: snake_case (`my_service.py`)');
    sections.push('- **Classes**: PascalCase (`MyService`)');
    sections.push('- **Functions/variables**: snake_case (`my_function`)');
    sections.push('- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)');
    sections.push('- **Private**: prefix with `_` (`_internal_helper`)\n');

    sections.push('## Python Error Handling\n');
    sections.push('- Use specific exception types');
    sections.push('- Never bare `except:` — always specify the exception');
    sections.push('- Use custom exception classes for domain errors');
    sections.push('- Log errors with context\n');

    if (research.python.hasRuff) {
      sections.push('## Python Formatting & Linting\n');
      sections.push('- Use Ruff for both linting and formatting');
      sections.push('- Line length: 100 characters');
      sections.push('- Follow PEP 8 conventions');
      sections.push('- Sort imports with isort (via Ruff)\n');
    }
  }

  // Testing rules
  if (
    research.testing.hasVitest ||
    research.testing.hasJest ||
    research.testing.hasPlaywright ||
    research.testing.hasPytest
  ) {
    sections.push('## Testing\n');
    sections.push('- Write tests for all new functionality');
    if (research.testing.hasVitest) sections.push('- Use Vitest for unit and integration tests');
    if (research.testing.hasJest) sections.push('- Use Jest for unit tests');
    if (research.testing.hasPlaywright) sections.push('- Use Playwright for end-to-end tests');
    if (research.testing.hasPytest) sections.push('- Use pytest for Python tests');
    sections.push('- Test behavior, not implementation');
    sections.push('- Aim for >80% coverage on business logic\n');
  }

  // Code quality tools
  if (research.codeQuality.hasPrettier) {
    sections.push('## Formatting\n');
    sections.push('- Prettier is configured — run `npm run format` before committing');
    sections.push('- Do NOT manually format code; let Prettier handle it\n');
  }

  if (research.codeQuality.hasESLint) {
    const version = research.codeQuality.eslintVersion;
    const isV9 = version && parseInt(version, 10) >= 9;
    sections.push('## Linting\n');
    sections.push(
      `- ESLint ${isV9 ? 'v9+ (flat config)' : ''} is configured — fix all lint warnings`
    );
    sections.push('- Run `npm run lint` to check\n');
  }

  if (research.codeQuality.hasHusky || research.codeQuality.hasLintStaged) {
    sections.push('## Pre-commit Hooks\n');
    sections.push('- Husky + lint-staged runs on commit — ensure code passes before committing\n');
  }

  return sections.join('\n');
}

/**
 * Generate spec.md placeholder with project overview.
 */
function generateSpecMd(research: RepoResearchResult): string {
  const sections: string[] = [];

  sections.push(`# ${research.projectName} — Project Specification\n`);
  sections.push('## Overview\n');
  sections.push(`${research.projectName} is managed with Automaker ProtoLab.\n`);

  sections.push('## Tech Stack\n');

  if (research.codeQuality.hasTypeScript) {
    sections.push(`- **Language**: TypeScript ${research.codeQuality.tsVersion ?? ''}`);
  }
  if (research.frontend.framework && research.frontend.framework !== 'none') {
    sections.push(
      `- **Frontend**: ${research.frontend.framework} ${research.frontend.reactVersion ?? ''}`
    );
  }
  if (research.frontend.metaFramework && research.frontend.metaFramework !== 'none') {
    sections.push(
      `- **Meta-framework**: ${research.frontend.metaFramework} ${research.frontend.metaFrameworkVersion ?? ''}`
    );
  }
  if (research.backend.hasExpress) {
    sections.push('- **Backend**: Express.js');
  }
  if (research.backend.hasFastAPI) {
    sections.push('- **Backend**: FastAPI');
  }
  if (research.backend.hasPayload) {
    sections.push(`- **CMS**: Payload ${research.backend.payloadVersion ?? ''}`);
  }
  if (research.backend.database && research.backend.database !== 'none') {
    sections.push(`- **Database**: ${research.backend.database}`);
  }

  sections.push('');

  if (research.monorepo.isMonorepo) {
    sections.push('## Monorepo Structure\n');
    sections.push(
      `This project uses a monorepo with ${research.monorepo.tool ?? 'workspace'} and ${research.monorepo.packageManager}.\n`
    );

    if (research.monorepo.packages.length > 0) {
      sections.push('**Workspace packages:**\n');
      for (const pkg of research.monorepo.packages) {
        sections.push(`- \`${pkg.path}\` — ${pkg.name} (${pkg.type})`);
      }
      sections.push('');
    }
  }

  sections.push('## Development Guidelines\n');
  sections.push('- All code must pass CI checks before merging');
  sections.push('- Use feature branches with descriptive names');
  sections.push('- Keep PRs focused and under 300 lines when possible');
  sections.push('- Write tests for new functionality\n');

  return sections.join('\n');
}

/**
 * Generate protolab.config with enriched data from research.
 */
function generateProtolabConfig(research: RepoResearchResult): ProtolabConfig {
  const { projectName, monorepo, frontend, backend, codeQuality, python } = research;

  // Determine language
  let language = 'javascript';
  if (codeQuality.hasTypeScript) {
    language = 'typescript';
  } else if (python.hasPythonServices) {
    language = 'python';
  }

  // Determine framework
  let framework = 'none';
  if (frontend.metaFramework && frontend.metaFramework !== 'none') {
    framework = frontend.metaFramework;
  } else if (frontend.framework && frontend.framework !== 'none') {
    framework = frontend.framework;
  } else if (backend.hasExpress) {
    framework = 'express';
  } else if (backend.hasFastAPI) {
    framework = 'fastapi';
  } else if (backend.hasPayload) {
    framework = 'payload';
  }

  // Extract commands from package.json scripts
  const commands = {
    build: undefined as string | undefined,
    test: undefined as string | undefined,
    format: undefined as string | undefined,
    lint: undefined as string | undefined,
    dev: undefined as string | undefined,
  };

  // Common script patterns
  const pm = monorepo.packageManager;
  const runCmd = pm === 'npm' ? 'npm run' : pm === 'bun' ? 'bun run' : pm;

  commands.build = `${runCmd} build`;
  commands.test = pm === 'bun' ? 'bun test' : `${runCmd} test`;
  commands.dev = `${runCmd} dev`;

  if (codeQuality.hasPrettier) {
    commands.format = `${runCmd} format`;
  }
  if (codeQuality.hasESLint) {
    commands.lint = `${runCmd} lint`;
  }

  return {
    name: projectName,
    version: '0.1.0',
    protolab: {
      enabled: true,
    },
    techStack: {
      language,
      framework,
      packageManager: monorepo.packageManager,
    },
    commands: {
      build: commands.build,
      test: commands.test,
      format: commands.format,
      lint: commands.lint,
      dev: commands.dev,
    },
    standard: {
      skip: [],
    },
  };
}

/**
 * Extract common commands based on package manager and research.
 */
function extractCommands(research: RepoResearchResult): string[] {
  const commands: string[] = [];
  const pm = research.monorepo.packageManager;

  if (pm === 'pnpm') {
    commands.push('# Build');
    commands.push('pnpm build');
    commands.push('');
    commands.push('# Test');
    commands.push('pnpm test');
    commands.push('');
    if (research.codeQuality.hasPrettier) {
      commands.push('# Format');
      commands.push('pnpm format');
      commands.push('');
    }
    if (research.codeQuality.hasESLint) {
      commands.push('# Lint');
      commands.push('pnpm lint');
      commands.push('');
    }
    commands.push('# Development');
    commands.push('pnpm dev');
  } else if (pm === 'bun') {
    commands.push('# Build');
    commands.push('bun run build');
    commands.push('');
    commands.push('# Test');
    commands.push('bun test');
    commands.push('');
    if (research.codeQuality.hasPrettier) {
      commands.push('# Format');
      commands.push('bun run format');
      commands.push('');
    }
    if (research.codeQuality.hasESLint) {
      commands.push('# Lint');
      commands.push('bun run lint');
      commands.push('');
    }
    commands.push('# Development');
    commands.push('bun dev');
  } else {
    // npm or yarn
    commands.push('# Build');
    commands.push('npm run build');
    commands.push('');
    commands.push('# Test');
    commands.push('npm test');
    commands.push('');
    if (research.codeQuality.hasPrettier) {
      commands.push('# Format');
      commands.push('npm run format');
      commands.push('');
    }
    if (research.codeQuality.hasESLint) {
      commands.push('# Lint');
      commands.push('npm run lint');
      commands.push('');
    }
    commands.push('# Development');
    commands.push('npm run dev');
  }

  return commands;
}
