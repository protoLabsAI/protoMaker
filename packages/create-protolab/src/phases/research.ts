/**
 * Repo Research Phase
 *
 * Scans a target repository to detect its current tech stack, structure,
 * and configuration. Pure heuristics — no AI calls. Fast and deterministic.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '../utils.js';
import type { RepoResearchResult } from '../types.js';

const logger = createLogger('repo-research');
const execFileAsync = promisify(execFile);

/** Safely read and parse a JSON file, returning null on failure */
async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Check if a file/dir exists */
async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** List top-level directory entries */
async function listDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

/** Run a shell command, returning stdout or empty string on failure */
async function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: 10000 });
    return stdout.trim();
  } catch (error) {
    logger.warn(`Git command failed: ${cmd} ${args.join(' ')}`, { error: String(error) });
    return '';
  }
}

/** Extract a semver-ish version from a dependency value like "^5.0.0" or "~3.2.1" */
function extractVersion(depValue: string | undefined): string | undefined {
  if (!depValue) return undefined;
  return depValue.replace(/^[\^~>=<]*/g, '');
}

/** Get the dep version from package.json deps/devDeps */
function depVersion(pkg: Record<string, unknown>, name: string): string | undefined {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return extractVersion(deps[name] ?? devDeps[name]);
}

/** Check if a dependency exists in package.json */
function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  return name in deps || name in devDeps;
}

/** Search all package.json files (root + workspace packages) for a dep */
function anyPkgHasDep(pkgs: Record<string, unknown>[], name: string): boolean {
  return pkgs.some((p) => hasDep(p, name));
}

function anyPkgDepVersion(pkgs: Record<string, unknown>[], name: string): string | undefined {
  for (const p of pkgs) {
    const v = depVersion(p, name);
    if (v) return v;
  }
  return undefined;
}

export async function researchRepo(projectPath: string): Promise<RepoResearchResult> {
  const absolutePath = path.resolve(projectPath);
  const projectName = path.basename(absolutePath);

  logger.info('Starting repo research', { projectPath: absolutePath });

  // Collect all package.json files (root + workspaces)
  const rootPkg = await readJson(path.join(absolutePath, 'package.json'));
  const allPkgs: Record<string, unknown>[] = rootPkg ? [rootPkg] : [];

  // ---- Git ----
  const gitDir = await exists(path.join(absolutePath, '.git'));
  const remoteUrl = gitDir
    ? await runCmd('git', ['remote', 'get-url', 'origin'], absolutePath)
    : '';
  const defaultBranch = gitDir
    ? await runCmd('git', ['symbolic-ref', '--short', 'HEAD'], absolutePath)
    : undefined;

  let provider: 'github' | 'gitlab' | 'bitbucket' | undefined;
  if (remoteUrl.includes('github.com')) provider = 'github';
  else if (remoteUrl.includes('gitlab.com')) provider = 'gitlab';
  else if (remoteUrl.includes('bitbucket.org')) provider = 'bitbucket';

  const git: RepoResearchResult['git'] = {
    isRepo: gitDir,
    remoteUrl: remoteUrl || undefined,
    defaultBranch,
    provider,
  };

  // ---- Monorepo & Package Manager ----
  const hasPnpmLock = await exists(path.join(absolutePath, 'pnpm-lock.yaml'));
  const hasYarnLock = await exists(path.join(absolutePath, 'yarn.lock'));
  const hasBunLock = await exists(path.join(absolutePath, 'bun.lockb'));
  const hasNpmLock = await exists(path.join(absolutePath, 'package-lock.json'));

  let packageManager: RepoResearchResult['monorepo']['packageManager'] = 'unknown';
  if (hasPnpmLock) packageManager = 'pnpm';
  else if (hasYarnLock) packageManager = 'yarn';
  else if (hasBunLock) packageManager = 'bun';
  else if (hasNpmLock || rootPkg) packageManager = 'npm';

  const hasTurbo = await exists(path.join(absolutePath, 'turbo.json'));
  const hasNx = await exists(path.join(absolutePath, 'nx.json'));
  const hasLernaJson = await exists(path.join(absolutePath, 'lerna.json'));
  const hasPnpmWorkspaces = await exists(path.join(absolutePath, 'pnpm-workspace.yaml'));

  // Detect workspace globs
  let workspaceGlobs: string[] | undefined;
  const rootWorkspaces = rootPkg?.workspaces;
  if (Array.isArray(rootWorkspaces)) {
    workspaceGlobs = rootWorkspaces as string[];
  } else if (rootWorkspaces && typeof rootWorkspaces === 'object') {
    workspaceGlobs = (rootWorkspaces as { packages?: string[] }).packages;
  }

  // pnpm-workspace.yaml
  if (!workspaceGlobs && hasPnpmWorkspaces) {
    try {
      const content = await fs.readFile(path.join(absolutePath, 'pnpm-workspace.yaml'), 'utf-8');
      const match = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (match) {
        workspaceGlobs = match[1]
          .split('\n')
          .map((l) => l.replace(/^\s*-\s*['"]?|['"]?\s*$/g, ''))
          .filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }

  const isMonorepo = !!(workspaceGlobs?.length || hasTurbo || hasNx || hasLernaJson);

  let monorepoTool: RepoResearchResult['monorepo']['tool'];
  if (hasTurbo) monorepoTool = 'turbo';
  else if (hasNx) monorepoTool = 'nx';
  else if (hasLernaJson) monorepoTool = 'lerna';
  else if (hasPnpmWorkspaces) monorepoTool = 'pnpm-workspaces';
  else if (workspaceGlobs) monorepoTool = 'npm-workspaces';

  // Discover workspace packages
  const packages: RepoResearchResult['monorepo']['packages'] = [];
  if (workspaceGlobs) {
    for (const glob of workspaceGlobs) {
      const baseGlob = glob.replace(/\/\*$/, '').replace(/\*$/, '');
      if (!baseGlob) continue;
      const basePath = path.join(absolutePath, baseGlob);
      const entries = await listDir(basePath);
      for (const entry of entries) {
        const pkgJsonPath = path.join(basePath, entry, 'package.json');
        const pkgJson = await readJson(pkgJsonPath);
        if (pkgJson) {
          allPkgs.push(pkgJson);
          const isApp = baseGlob.includes('app');
          packages.push({
            name: (pkgJson.name as string) || entry,
            path: path.join(baseGlob, entry),
            type: isApp ? 'app' : 'package',
          });
        }
      }
    }
  }

  const monorepo: RepoResearchResult['monorepo'] = {
    isMonorepo,
    tool: monorepoTool,
    packageManager,
    workspaceGlobs,
    packages,
  };

  // ---- Frontend ----
  let framework: RepoResearchResult['frontend']['framework'];
  if (anyPkgHasDep(allPkgs, 'react')) framework = 'react';
  else if (anyPkgHasDep(allPkgs, 'vue')) framework = 'vue';
  else if (anyPkgHasDep(allPkgs, 'svelte')) framework = 'svelte';
  else framework = 'none';

  let metaFramework: RepoResearchResult['frontend']['metaFramework'] = 'none';
  if (anyPkgHasDep(allPkgs, 'next')) metaFramework = 'nextjs';
  else if (anyPkgHasDep(allPkgs, '@remix-run/react')) metaFramework = 'remix';
  else if (anyPkgHasDep(allPkgs, 'vite')) metaFramework = 'vite';

  const hasShadcn = await exists(path.join(absolutePath, 'components.json'));
  const hasStorybook =
    anyPkgHasDep(allPkgs, '@storybook/react') || anyPkgHasDep(allPkgs, 'storybook');
  const hasTailwind =
    anyPkgHasDep(allPkgs, 'tailwindcss') ||
    (await exists(path.join(absolutePath, 'tailwind.config.js'))) ||
    (await exists(path.join(absolutePath, 'tailwind.config.ts')));
  const hasRadix =
    anyPkgHasDep(allPkgs, '@radix-ui/react-dialog') || anyPkgHasDep(allPkgs, '@radix-ui/themes');

  const frontend: RepoResearchResult['frontend'] = {
    framework,
    reactVersion: anyPkgDepVersion(allPkgs, 'react'),
    metaFramework,
    metaFrameworkVersion: anyPkgDepVersion(allPkgs, 'next') || anyPkgDepVersion(allPkgs, 'vite'),
    hasShadcn,
    hasStorybook,
    storybookVersion:
      anyPkgDepVersion(allPkgs, 'storybook') || anyPkgDepVersion(allPkgs, '@storybook/react'),
    hasTailwind,
    tailwindVersion: anyPkgDepVersion(allPkgs, 'tailwindcss'),
    hasRadix,
  };

  // ---- Backend ----
  const hasPayload = anyPkgHasDep(allPkgs, 'payload');
  let database: RepoResearchResult['backend']['database'] = 'none';
  if (
    anyPkgHasDep(allPkgs, 'pg') ||
    anyPkgHasDep(allPkgs, '@neondatabase/serverless') ||
    anyPkgHasDep(allPkgs, '@vercel/postgres')
  )
    database = 'postgres';
  else if (anyPkgHasDep(allPkgs, 'neo4j-driver')) database = 'neo4j';
  else if (anyPkgHasDep(allPkgs, 'better-sqlite3') || anyPkgHasDep(allPkgs, 'sqlite3'))
    database = 'sqlite';
  else if (anyPkgHasDep(allPkgs, 'mongodb') || anyPkgHasDep(allPkgs, 'mongoose'))
    database = 'mongodb';

  const backend: RepoResearchResult['backend'] = {
    hasPayload,
    payloadVersion: anyPkgDepVersion(allPkgs, 'payload'),
    database,
    hasExpress: anyPkgHasDep(allPkgs, 'express'),
    hasFastAPI: false, // checked in python section
  };

  // ---- Agents ----
  const mcpPackages: string[] = [];
  for (const pkg of allPkgs) {
    const deps = {
      ...((pkg.dependencies || {}) as Record<string, string>),
      ...((pkg.devDependencies || {}) as Record<string, string>),
    };
    for (const dep of Object.keys(deps)) {
      if (dep.includes('mcp') || dep.includes('model-context-protocol')) {
        mcpPackages.push(dep);
      }
    }
  }

  const agents: RepoResearchResult['agents'] = {
    hasMCPServers:
      mcpPackages.length > 0 || (await exists(path.join(absolutePath, 'packages', 'mcp-server'))),
    mcpPackages: [...new Set(mcpPackages)],
    hasLangGraph: anyPkgHasDep(allPkgs, '@langchain/langgraph'),
    hasClaudeSDK:
      anyPkgHasDep(allPkgs, '@anthropic-ai/sdk') ||
      anyPkgHasDep(allPkgs, '@anthropic-ai/claude-code'),
    hasAgentFolder:
      (await exists(path.join(absolutePath, 'agents'))) ||
      (await exists(path.join(absolutePath, 'packages', 'agents'))),
  };

  // ---- Testing ----
  const testDirs: string[] = [];
  for (const d of ['tests', 'test', '__tests__', 'e2e', 'playwright']) {
    if (await exists(path.join(absolutePath, d))) testDirs.push(d);
  }

  const testing: RepoResearchResult['testing'] = {
    hasVitest: anyPkgHasDep(allPkgs, 'vitest'),
    vitestVersion: anyPkgDepVersion(allPkgs, 'vitest'),
    hasPlaywright: anyPkgHasDep(allPkgs, '@playwright/test') || anyPkgHasDep(allPkgs, 'playwright'),
    playwrightVersion:
      anyPkgDepVersion(allPkgs, '@playwright/test') || anyPkgDepVersion(allPkgs, 'playwright'),
    hasJest: anyPkgHasDep(allPkgs, 'jest'),
    hasPytest: false, // checked in python section
    testDirs,
  };

  // ---- Code Quality ----
  const hasESLint = anyPkgHasDep(allPkgs, 'eslint');
  const eslintVersion = anyPkgDepVersion(allPkgs, 'eslint');
  const hasPrettier = anyPkgHasDep(allPkgs, 'prettier');
  const hasTypeScript = anyPkgHasDep(allPkgs, 'typescript');

  // Check for strict mode in tsconfig.json
  const rootTsConfig = await readJson(path.join(absolutePath, 'tsconfig.json'));
  const tsStrict = !!(rootTsConfig?.compilerOptions as Record<string, unknown> | undefined)?.strict;
  const hasCompositeConfig =
    !!(rootTsConfig?.compilerOptions as Record<string, unknown> | undefined)?.composite ||
    !!rootTsConfig?.references;

  const codeQuality: RepoResearchResult['codeQuality'] = {
    hasESLint,
    eslintVersion,
    hasPrettier,
    hasTypeScript,
    tsVersion: anyPkgDepVersion(allPkgs, 'typescript'),
    tsStrict,
    hasCompositeConfig,
    hasHusky: anyPkgHasDep(allPkgs, 'husky') || (await exists(path.join(absolutePath, '.husky'))),
    hasLintStaged: anyPkgHasDep(allPkgs, 'lint-staged'),
  };

  // ---- CI/CD ----
  const ghWorkflowDir = path.join(absolutePath, '.github', 'workflows');
  const hasGhActions = await exists(ghWorkflowDir);
  const hasGitlabCI = await exists(path.join(absolutePath, '.gitlab-ci.yml'));
  const hasCircleCI = await exists(path.join(absolutePath, '.circleci'));

  let ciProvider: RepoResearchResult['ci']['provider'];
  if (hasGhActions) ciProvider = 'github-actions';
  else if (hasGitlabCI) ciProvider = 'gitlab-ci';
  else if (hasCircleCI) ciProvider = 'circleci';

  let workflows: string[] = [];
  if (hasGhActions) {
    const wfFiles = await listDir(ghWorkflowDir);
    workflows = wfFiles.filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  }

  // Check workflow file contents for specific checks
  let hasBuildCheck = false;
  let hasTestCheck = false;
  let hasFormatCheck = false;
  let hasSecurityAudit = false;
  for (const wf of workflows) {
    try {
      const content = await fs.readFile(path.join(ghWorkflowDir, wf), 'utf-8');
      const lower = content.toLowerCase();
      if (lower.includes('build') && (lower.includes('run:') || lower.includes('uses:')))
        hasBuildCheck = true;
      if (lower.includes('test') && (lower.includes('run:') || lower.includes('uses:')))
        hasTestCheck = true;
      if (lower.includes('prettier') || lower.includes('format')) hasFormatCheck = true;
      if (lower.includes('audit') || lower.includes('security') || lower.includes('snyk'))
        hasSecurityAudit = true;
    } catch {
      /* ignore */
    }
  }

  const hasCodeRabbit =
    (await exists(path.join(absolutePath, '.coderabbit.yaml'))) ||
    (await exists(path.join(absolutePath, '.coderabbit.yml')));

  // Check branch protection via gh CLI (non-blocking)
  // Checks both legacy branch protection and modern rulesets
  let hasBranchProtection = false;
  if (provider === 'github' && gitDir) {
    const bpResult = await runCmd(
      'gh',
      ['api', 'repos/{owner}/{repo}/branches/main/protection', '--jq', '.required_status_checks'],
      absolutePath
    );
    hasBranchProtection = bpResult.length > 0 && !bpResult.includes('Not Found');

    // Fallback: check rulesets (modern GitHub branch protection)
    if (!hasBranchProtection) {
      const rulesetsResult = await runCmd(
        'gh',
        ['api', 'repos/{owner}/{repo}/rulesets', '--jq', 'length'],
        absolutePath
      );
      const rulesetCount = parseInt(rulesetsResult.trim(), 10);
      hasBranchProtection = !isNaN(rulesetCount) && rulesetCount > 0;
    }
  }

  const ci: RepoResearchResult['ci'] = {
    hasCI: !!ciProvider,
    provider: ciProvider,
    workflows,
    hasBuildCheck,
    hasTestCheck,
    hasFormatCheck,
    hasSecurityAudit,
    hasCodeRabbit,
    hasBranchProtection,
  };

  // ---- Automation ----
  const automation: RepoResearchResult['automation'] = {
    hasAutomaker: await exists(path.join(absolutePath, '.automaker')),
    hasDiscordIntegration: false, // Would need to check protolab.config
    hasProtolabConfig: await exists(path.join(absolutePath, 'protolab.config')),
    hasAnalytics: false,
    analyticsProvider: undefined,
  };

  // Check protolab.config for discord
  if (automation.hasProtolabConfig) {
    const config = await readJson(path.join(absolutePath, 'protolab.config'));
    if (config?.discord) automation.hasDiscordIntegration = true;
  }

  // Detect analytics provider
  if (anyPkgHasDep(allPkgs, '@umami/node') || anyPkgHasDep(allPkgs, 'umami')) {
    automation.hasAnalytics = true;
    automation.analyticsProvider = 'umami';
  } else if (anyPkgHasDep(allPkgs, 'plausible-tracker')) {
    automation.hasAnalytics = true;
    automation.analyticsProvider = 'plausible';
  } else if (anyPkgHasDep(allPkgs, 'react-ga4')) {
    automation.hasAnalytics = true;
    automation.analyticsProvider = 'google-analytics';
  }

  // Check for Umami via env vars or script references if not found via deps
  if (!automation.hasAnalytics) {
    for (const envFile of ['.env', '.env.example', '.env.local']) {
      const envPath = path.join(absolutePath, envFile);
      if (await exists(envPath)) {
        try {
          const envContent = await fs.readFile(envPath, 'utf-8');
          if (envContent.includes('UMAMI') || envContent.includes('umami')) {
            automation.hasAnalytics = true;
            automation.analyticsProvider = 'umami';
            break;
          } else if (envContent.includes('PLAUSIBLE')) {
            automation.hasAnalytics = true;
            automation.analyticsProvider = 'plausible';
            break;
          } else if (
            envContent.includes('GA_MEASUREMENT_ID') ||
            envContent.includes('GA_TRACKING_ID') ||
            envContent.includes('NEXT_PUBLIC_GA_ID') ||
            envContent.includes('GOOGLE_ANALYTICS')
          ) {
            automation.hasAnalytics = true;
            automation.analyticsProvider = 'google-analytics';
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ---- Python ----
  const pythonServices: RepoResearchResult['python']['services'] = [];
  const hasPyproject = await exists(path.join(absolutePath, 'pyproject.toml'));
  const hasRequirements = await exists(path.join(absolutePath, 'requirements.txt'));

  // Check for Python service directories (e.g., services/ with pyproject.toml or requirements.txt)
  for (const dir of ['services', 'python', 'ml', 'ai']) {
    const dirPath = path.join(absolutePath, dir);
    if (await exists(dirPath)) {
      const entries = await listDir(dirPath);
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        try {
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            const hasPy =
              (await exists(path.join(entryPath, 'pyproject.toml'))) ||
              (await exists(path.join(entryPath, 'requirements.txt'))) ||
              (await exists(path.join(entryPath, 'setup.py')));
            if (hasPy) {
              let fw: string | undefined;
              const reqs = await fs
                .readFile(path.join(entryPath, 'requirements.txt'), 'utf-8')
                .catch(() => '');
              if (reqs.includes('fastapi')) fw = 'fastapi';
              else if (reqs.includes('flask')) fw = 'flask';
              else if (reqs.includes('django')) fw = 'django';
              pythonServices.push({ name: entry, path: path.join(dir, entry), framework: fw });
            }
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Root-level Python project
  if ((hasPyproject || hasRequirements) && pythonServices.length === 0) {
    let fw: string | undefined;
    try {
      const content = await fs.readFile(
        path.join(absolutePath, hasPyproject ? 'pyproject.toml' : 'requirements.txt'),
        'utf-8'
      );
      if (content.includes('fastapi')) fw = 'fastapi';
      else if (content.includes('flask')) fw = 'flask';
      else if (content.includes('django')) fw = 'django';
    } catch {
      /* ignore */
    }
    if (fw) {
      pythonServices.push({ name: projectName, path: '.', framework: fw });
      backend.hasFastAPI = fw === 'fastapi';
    }
  }

  const hasRuff =
    (await exists(path.join(absolutePath, 'ruff.toml'))) ||
    (await exists(path.join(absolutePath, '.ruff.toml')));
  const hasBlack = (await exists(path.join(absolutePath, 'pyproject.toml')))
    ? (
        await fs.readFile(path.join(absolutePath, 'pyproject.toml'), 'utf-8').catch(() => '')
      ).includes('[tool.black]')
    : false;
  const hasPytest = hasPyproject
    ? (
        await fs.readFile(path.join(absolutePath, 'pyproject.toml'), 'utf-8').catch(() => '')
      ).includes('pytest')
    : await exists(path.join(absolutePath, 'pytest.ini'));

  testing.hasPytest = hasPytest;

  const python: RepoResearchResult['python'] = {
    hasPythonServices: pythonServices.length > 0 || hasPyproject,
    services: pythonServices,
    hasRuff,
    hasBlack,
    hasPytest,
    hasPoetry:
      anyPkgHasDep(allPkgs, 'poetry') ||
      (hasPyproject &&
        (
          await fs.readFile(path.join(absolutePath, 'pyproject.toml'), 'utf-8').catch(() => '')
        ).includes('[tool.poetry]')),
    hasPyproject,
  };

  // ---- Structure ----
  const topEntries = await listDir(absolutePath);
  const topDirs: string[] = [];
  const configFiles: string[] = [];
  const entryPoints: string[] = [];

  for (const entry of topEntries) {
    if (entry.startsWith('.')) {
      // Track important dotfiles/dirs
      if (['.github', '.automaker', '.husky', '.storybook'].includes(entry)) {
        topDirs.push(entry);
      }
      if (
        [
          '.eslintrc.js',
          '.eslintrc.json',
          '.prettierrc',
          '.prettierrc.json',
          '.env',
          '.env.local',
        ].includes(entry)
      ) {
        configFiles.push(entry);
      }
      continue;
    }
    try {
      const stat = await fs.stat(path.join(absolutePath, entry));
      if (stat.isDirectory()) {
        topDirs.push(entry);
      } else {
        // Config & entry point files
        if (
          /\.(json|ya?ml|toml|config\.(js|ts|mjs))$/.test(entry) ||
          ['Dockerfile', 'Makefile', 'docker-compose.yml'].includes(entry)
        ) {
          configFiles.push(entry);
        }
        if (
          [
            'index.ts',
            'index.js',
            'main.ts',
            'main.js',
            'app.ts',
            'app.js',
            'server.ts',
            'server.js',
          ].includes(entry)
        ) {
          entryPoints.push(entry);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Also check for flat eslint config
  if (
    (await exists(path.join(absolutePath, 'eslint.config.js'))) ||
    (await exists(path.join(absolutePath, 'eslint.config.mjs')))
  ) {
    configFiles.push('eslint.config.js');
  }

  const structure: RepoResearchResult['structure'] = {
    topDirs,
    configFiles,
    entryPoints,
  };

  logger.info('Repo research complete', {
    projectPath: absolutePath,
    isMonorepo,
    framework,
    packageManager,
  });

  return {
    projectPath: absolutePath,
    projectName,
    git,
    monorepo,
    frontend,
    backend,
    agents,
    testing,
    codeQuality,
    ci,
    automation,
    python,
    structure,
  };
}
