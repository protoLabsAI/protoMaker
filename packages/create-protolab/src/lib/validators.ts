/**
 * Validators for create-protolab CLI
 * Performs environment checks, permission checks, and prerequisite validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ErrorCode, createError } from './error-handler.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export interface EnvironmentCheck {
  name: string;
  required: boolean;
  available: boolean;
  version?: string;
  installUrl?: string;
}

/**
 * Check if a command is available in PATH
 */
export function isCommandAvailable(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version of a command
 */
export function getCommandVersion(
  command: string,
  versionFlag: string = '--version'
): string | undefined {
  try {
    const output = execSync(`${command} ${versionFlag}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

/**
 * Validate project path exists and is accessible
 */
export function validateProjectPath(projectPath: string): ValidationResult {
  // Check if path exists
  if (!fs.existsSync(projectPath)) {
    return {
      valid: false,
      error: `Directory does not exist: ${projectPath}`,
    };
  }

  // Check if it's a directory
  const stats = fs.statSync(projectPath);
  if (!stats.isDirectory()) {
    return {
      valid: false,
      error: `Path is not a directory: ${projectPath}`,
    };
  }

  return { valid: true };
}

/**
 * Check if path has write permissions
 */
export function hasWriteAccess(projectPath: string): boolean {
  try {
    const testFile = path.join(projectPath, '.protolab-write-test');
    fs.writeFileSync(testFile, 'test', 'utf-8');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate write permissions
 */
export function validateWriteAccess(projectPath: string): ValidationResult {
  if (!hasWriteAccess(projectPath)) {
    return {
      valid: false,
      error: 'No write access to project directory',
    };
  }

  return { valid: true };
}

/**
 * Check if directory is a git repository
 */
export function isGitRepository(projectPath: string): boolean {
  const gitDir = path.join(projectPath, '.git');
  return fs.existsSync(gitDir);
}

/**
 * Validate git repository
 */
export function validateGitRepository(projectPath: string): ValidationResult {
  if (!isGitRepository(projectPath)) {
    return {
      valid: false,
      error: 'Not a git repository',
    };
  }

  return { valid: true };
}

/**
 * Check if package.json exists
 */
export function hasPackageJson(projectPath: string): boolean {
  const packageJsonPath = path.join(projectPath, 'package.json');
  return fs.existsSync(packageJsonPath);
}

/**
 * Validate package.json exists
 */
export function validatePackageJson(projectPath: string): ValidationResult {
  if (!hasPackageJson(projectPath)) {
    return {
      valid: false,
      error: 'No package.json found. Is this a Node.js project?',
    };
  }

  return { valid: true };
}

/**
 * Detect if project is a monorepo
 */
export function detectMonorepo(projectPath: string): {
  isMonorepo: boolean;
  type?: 'pnpm' | 'npm' | 'yarn' | 'lerna';
  hasWorkspaces: boolean;
} {
  // Check for pnpm-workspace.yaml
  if (fs.existsSync(path.join(projectPath, 'pnpm-workspace.yaml'))) {
    return { isMonorepo: true, type: 'pnpm', hasWorkspaces: true };
  }

  // Check for lerna.json
  if (fs.existsSync(path.join(projectPath, 'lerna.json'))) {
    return { isMonorepo: true, type: 'lerna', hasWorkspaces: true };
  }

  // Check package.json for workspaces
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      if (packageJson.workspaces) {
        // Detect type based on lockfile
        if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
          return { isMonorepo: true, type: 'pnpm', hasWorkspaces: true };
        } else if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
          return { isMonorepo: true, type: 'yarn', hasWorkspaces: true };
        } else {
          return { isMonorepo: true, type: 'npm', hasWorkspaces: true };
        }
      }
    } catch {
      // Invalid package.json, continue
    }
  }

  // Check for packages/* structure (monorepo without explicit workspace config)
  const packagesDir = path.join(projectPath, 'packages');
  if (fs.existsSync(packagesDir)) {
    const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
    const hasPackages = entries.some((entry) => entry.isDirectory());
    if (hasPackages) {
      return { isMonorepo: true, hasWorkspaces: false };
    }
  }

  return { isMonorepo: false, hasWorkspaces: false };
}

/**
 * Check if .automaker directory exists
 */
export function isAutomakerInitialized(projectPath: string): boolean {
  const automakerDir = path.join(projectPath, '.automaker');
  return fs.existsSync(automakerDir);
}

/**
 * Check if .beads directory exists
 */
export function isBeadsInitialized(projectPath: string): boolean {
  const beadsDir = path.join(projectPath, '.beads');
  return fs.existsSync(beadsDir);
}

/**
 * Check which phases are already completed
 */
export function detectCompletedPhases(projectPath: string): {
  gitInitialized: boolean;
  automakerInitialized: boolean;
  beadsInitialized: boolean;
  packageJsonExists: boolean;
} {
  return {
    gitInitialized: isGitRepository(projectPath),
    automakerInitialized: isAutomakerInitialized(projectPath),
    beadsInitialized: isBeadsInitialized(projectPath),
    packageJsonExists: hasPackageJson(projectPath),
  };
}

/**
 * Check all environment prerequisites
 */
export function checkEnvironment(): EnvironmentCheck[] {
  const checks: EnvironmentCheck[] = [
    {
      name: 'git',
      required: true,
      available: isCommandAvailable('git'),
      version: getCommandVersion('git'),
    },
    {
      name: 'node',
      required: true,
      available: isCommandAvailable('node'),
      version: getCommandVersion('node'),
    },
    {
      name: 'npm',
      required: true,
      available: isCommandAvailable('npm'),
      version: getCommandVersion('npm'),
    },
    {
      name: 'claude',
      required: true,
      available: isCommandAvailable('claude'),
      version: getCommandVersion('claude'),
      installUrl: 'https://claude.ai/code',
    },
    {
      name: 'gh',
      required: false,
      available: isCommandAvailable('gh'),
      version: getCommandVersion('gh'),
      installUrl: 'https://cli.github.com',
    },
    {
      name: 'bd',
      required: false,
      available: isCommandAvailable('bd'),
      version: getCommandVersion('bd', 'version'),
      installUrl: 'https://github.com/jlowin/beads',
    },
    {
      name: 'gt',
      required: false,
      available: isCommandAvailable('gt'),
      version: getCommandVersion('gt'),
      installUrl: 'https://graphite.dev',
    },
    {
      name: 'jq',
      required: true,
      available: isCommandAvailable('jq'),
      version: getCommandVersion('jq'),
      installUrl: 'https://stedolan.github.io/jq/',
    },
  ];

  return checks;
}

/**
 * Check if Automaker server is running
 */
export async function isAutomakerServerRunning(
  host: string = 'localhost',
  port: number = 3008
): Promise<boolean> {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Perform all fatal validation checks
 * Throws ProtolabCliError if any fatal check fails
 */
export function validateFatalRequirements(projectPath: string): void {
  // Validate project path
  const pathResult = validateProjectPath(projectPath);
  if (!pathResult.valid) {
    throw createError(ErrorCode.INVALID_PROJECT_PATH, pathResult.error);
  }

  // Validate write access
  const writeResult = validateWriteAccess(projectPath);
  if (!writeResult.valid) {
    throw createError(ErrorCode.NO_WRITE_ACCESS, writeResult.error);
  }

  // Validate git repository
  const gitResult = validateGitRepository(projectPath);
  if (!gitResult.valid) {
    throw createError(ErrorCode.NOT_GIT_REPO, gitResult.error);
  }

  // Validate package.json (if it's supposed to be a Node.js project)
  const packageJsonResult = validatePackageJson(projectPath);
  if (!packageJsonResult.valid) {
    throw createError(ErrorCode.NO_PACKAGE_JSON, packageJsonResult.error);
  }
}

/**
 * Validate all optional tools and return warnings
 */
export function validateOptionalTools(): Array<{ tool: string; error: ErrorCode }> {
  const warnings: Array<{ tool: string; error: ErrorCode }> = [];

  if (!isCommandAvailable('gh')) {
    warnings.push({ tool: 'gh', error: ErrorCode.GH_CLI_MISSING });
  }

  if (!isCommandAvailable('gt')) {
    warnings.push({ tool: 'gt', error: ErrorCode.GT_CLI_MISSING });
  }

  if (!isCommandAvailable('bd')) {
    warnings.push({ tool: 'bd', error: ErrorCode.BD_CLI_MISSING });
  }

  return warnings;
}
