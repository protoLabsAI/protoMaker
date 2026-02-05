/**
 * Completion Verifier Service
 *
 * Verifies completion criteria for features using various check types:
 * - tests_pass: Run test command and verify success
 * - build_succeeds: Run build command and verify success
 * - lint_clean: Run lint command and verify success
 * - file_exists: Check if a file exists at the given path
 * - file_contains: Check if a file contains a specific pattern
 * - custom_script: Run a custom script and check exit code
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@automaker/utils';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('CompletionVerifier');
const execAsync = promisify(exec);

/**
 * Default timeout for command execution (2 minutes)
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Maximum timeout allowed (10 minutes)
 */
const MAX_TIMEOUT_MS = 600_000;

/**
 * Completion criterion types
 */
export type CompletionCriterion =
  | { type: 'tests_pass'; command: string; timeout?: number }
  | { type: 'build_succeeds'; command: string; timeout?: number }
  | { type: 'lint_clean'; command: string; timeout?: number }
  | { type: 'file_exists'; path: string }
  | { type: 'file_contains'; path: string; pattern: string }
  | { type: 'custom_script'; command: string; successExitCode?: number; timeout?: number };

/**
 * Result of checking a single criterion
 */
export interface CriterionResult {
  criterion: CompletionCriterion;
  passed: boolean;
  output: string;
  error?: string;
  duration: number;
}

/**
 * Result of verifying all completion criteria
 */
export interface VerificationResult {
  allPassed: boolean;
  results: CriterionResult[];
  summary: string;
  totalDuration: number;
  timestamp: string;
}

/**
 * Options for verification
 */
export interface VerificationOptions {
  /** Working directory for commands (defaults to projectPath) */
  workDir?: string;
  /** Environment variables to add to commands */
  env?: Record<string, string>;
  /** Whether to stop on first failure */
  stopOnFirstFailure?: boolean;
}

/**
 * Service for verifying completion criteria
 */
export class CompletionVerifierService {
  /**
   * Verify all completion criteria are met
   */
  async verifyCompletion(
    projectPath: string,
    criteria: CompletionCriterion[],
    options: VerificationOptions = {}
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const results: CriterionResult[] = [];
    let allPassed = true;

    const workDir = options.workDir ?? projectPath;

    logger.info(`Starting verification of ${criteria.length} criteria in ${workDir}`);

    for (const criterion of criteria) {
      const result = await this.checkCriterion(criterion, workDir, options.env);
      results.push(result);

      if (!result.passed) {
        allPassed = false;
        logger.warn(`Criterion failed: ${this.getCriterionDescription(criterion)}`);

        if (options.stopOnFirstFailure) {
          logger.info('Stopping verification on first failure');
          break;
        }
      } else {
        logger.debug(`Criterion passed: ${this.getCriterionDescription(criterion)}`);
      }
    }

    const totalDuration = Date.now() - startTime;
    const summary = this.buildSummary(results, allPassed, totalDuration);

    const verificationResult: VerificationResult = {
      allPassed,
      results,
      summary,
      totalDuration,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Verification complete: ${allPassed ? 'PASSED' : 'FAILED'} (${totalDuration}ms)`);

    return verificationResult;
  }

  /**
   * Check a single completion criterion
   */
  async checkCriterion(
    criterion: CompletionCriterion,
    workDir: string,
    env?: Record<string, string>
  ): Promise<CriterionResult> {
    const startTime = Date.now();

    try {
      switch (criterion.type) {
        case 'tests_pass':
          return await this.checkCommand(criterion, criterion.command, workDir, env, startTime);

        case 'build_succeeds':
          return await this.checkCommand(criterion, criterion.command, workDir, env, startTime);

        case 'lint_clean':
          return await this.checkCommand(criterion, criterion.command, workDir, env, startTime);

        case 'file_exists':
          return await this.checkFileExists(criterion, workDir, startTime);

        case 'file_contains':
          return await this.checkFileContains(criterion, workDir, startTime);

        case 'custom_script':
          return await this.checkCustomScript(criterion, workDir, env, startTime);

        default:
          // Type exhaustiveness check
          const exhaustiveCheck: never = criterion;
          throw new Error(`Unknown criterion type: ${(exhaustiveCheck as CompletionCriterion).type}`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Error checking criterion:`, error);

      return {
        criterion,
        passed: false,
        output: '',
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Run a command and check if it succeeds (exit code 0)
   */
  private async checkCommand(
    criterion: CompletionCriterion & { command: string; timeout?: number },
    command: string,
    workDir: string,
    env?: Record<string, string>,
    startTime: number = Date.now()
  ): Promise<CriterionResult> {
    const timeout = this.getTimeout(criterion.timeout);

    logger.debug(`Running command: ${command} (timeout: ${timeout}ms)`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout,
        env: {
          ...process.env,
          ...env,
          // Enable color output for better logs
          FORCE_COLOR: '1',
        },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const output = this.combineOutput(stdout, stderr);
      const duration = Date.now() - startTime;

      return {
        criterion,
        passed: true,
        output,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const execError = error as { stdout?: string; stderr?: string; message: string; killed?: boolean; signal?: string };

      // Check if this was a timeout
      if (execError.killed && execError.signal === 'SIGTERM') {
        return {
          criterion,
          passed: false,
          output: this.combineOutput(execError.stdout, execError.stderr),
          error: `Command timed out after ${timeout}ms`,
          duration,
        };
      }

      return {
        criterion,
        passed: false,
        output: this.combineOutput(execError.stdout, execError.stderr),
        error: execError.message,
        duration,
      };
    }
  }

  /**
   * Check if a file exists
   */
  private async checkFileExists(
    criterion: { type: 'file_exists'; path: string },
    workDir: string,
    startTime: number
  ): Promise<CriterionResult> {
    const filePath = this.resolvePath(criterion.path, workDir);

    logger.debug(`Checking file exists: ${filePath}`);

    try {
      await secureFs.access(filePath);
      const duration = Date.now() - startTime;

      return {
        criterion,
        passed: true,
        output: `File exists: ${filePath}`,
        duration,
      };
    } catch {
      const duration = Date.now() - startTime;

      return {
        criterion,
        passed: false,
        output: '',
        error: `File does not exist: ${filePath}`,
        duration,
      };
    }
  }

  /**
   * Check if a file contains a specific pattern
   */
  private async checkFileContains(
    criterion: { type: 'file_contains'; path: string; pattern: string },
    workDir: string,
    startTime: number
  ): Promise<CriterionResult> {
    const filePath = this.resolvePath(criterion.path, workDir);

    logger.debug(`Checking file contains pattern: ${filePath} -> ${criterion.pattern}`);

    try {
      // First check if file exists
      await secureFs.access(filePath);

      // Read file content
      const content = await secureFs.readFile(filePath, 'utf-8');

      // Check if pattern is found (supports regex)
      const regex = new RegExp(criterion.pattern);
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      const found = regex.test(contentStr);

      const duration = Date.now() - startTime;

      if (found) {
        return {
          criterion,
          passed: true,
          output: `Pattern "${criterion.pattern}" found in ${filePath}`,
          duration,
        };
      } else {
        return {
          criterion,
          passed: false,
          output: '',
          error: `Pattern "${criterion.pattern}" not found in ${filePath}`,
          duration,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        criterion,
        passed: false,
        output: '',
        error: `Error checking file: ${errorMessage}`,
        duration,
      };
    }
  }

  /**
   * Run a custom script and check its exit code
   */
  private async checkCustomScript(
    criterion: { type: 'custom_script'; command: string; successExitCode?: number; timeout?: number },
    workDir: string,
    env?: Record<string, string>,
    startTime: number = Date.now()
  ): Promise<CriterionResult> {
    const timeout = this.getTimeout(criterion.timeout);
    const expectedExitCode = criterion.successExitCode ?? 0;

    logger.debug(`Running custom script: ${criterion.command} (expected exit: ${expectedExitCode})`);

    try {
      const { stdout, stderr } = await execAsync(criterion.command, {
        cwd: workDir,
        timeout,
        env: {
          ...process.env,
          ...env,
        },
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = this.combineOutput(stdout, stderr);
      const duration = Date.now() - startTime;

      // Command succeeded with exit code 0
      if (expectedExitCode === 0) {
        return {
          criterion,
          passed: true,
          output,
          duration,
        };
      } else {
        // Command succeeded but we expected a non-zero exit code
        return {
          criterion,
          passed: false,
          output,
          error: `Expected exit code ${expectedExitCode} but got 0`,
          duration,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const execError = error as { stdout?: string; stderr?: string; message: string; code?: number; killed?: boolean; signal?: string };

      // Check if this was a timeout
      if (execError.killed && execError.signal === 'SIGTERM') {
        return {
          criterion,
          passed: false,
          output: this.combineOutput(execError.stdout, execError.stderr),
          error: `Script timed out after ${timeout}ms`,
          duration,
        };
      }

      // Check if the exit code matches what we expected
      if (execError.code === expectedExitCode) {
        return {
          criterion,
          passed: true,
          output: this.combineOutput(execError.stdout, execError.stderr),
          duration,
        };
      }

      return {
        criterion,
        passed: false,
        output: this.combineOutput(execError.stdout, execError.stderr),
        error: execError.message,
        duration,
      };
    }
  }

  /**
   * Get timeout value, clamped to allowed range
   */
  private getTimeout(timeout?: number): number {
    if (timeout === undefined) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);
  }

  /**
   * Resolve a path relative to working directory
   */
  private resolvePath(path: string, workDir: string): string {
    if (path.startsWith('/')) {
      return path;
    }
    return `${workDir}/${path}`;
  }

  /**
   * Combine stdout and stderr into a single output string
   */
  private combineOutput(stdout?: string, stderr?: string): string {
    const parts: string[] = [];
    if (stdout?.trim()) {
      parts.push(stdout.trim());
    }
    if (stderr?.trim()) {
      parts.push(stderr.trim());
    }
    return parts.join('\n');
  }

  /**
   * Get human-readable description of a criterion
   */
  private getCriterionDescription(criterion: CompletionCriterion): string {
    switch (criterion.type) {
      case 'tests_pass':
        return `Tests pass: ${criterion.command}`;
      case 'build_succeeds':
        return `Build succeeds: ${criterion.command}`;
      case 'lint_clean':
        return `Lint clean: ${criterion.command}`;
      case 'file_exists':
        return `File exists: ${criterion.path}`;
      case 'file_contains':
        return `File contains "${criterion.pattern}": ${criterion.path}`;
      case 'custom_script':
        return `Custom script: ${criterion.command}`;
      default:
        return `Unknown criterion`;
    }
  }

  /**
   * Build a summary of the verification results
   */
  private buildSummary(results: CriterionResult[], allPassed: boolean, totalDuration: number): string {
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    const lines: string[] = [
      `Verification ${allPassed ? 'PASSED' : 'FAILED'}: ${passedCount}/${totalCount} criteria met`,
      `Total duration: ${totalDuration}ms`,
      '',
    ];

    for (const result of results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      const description = this.getCriterionDescription(result.criterion);
      lines.push(`[${status}] ${description} (${result.duration}ms)`);

      if (!result.passed && result.error) {
        lines.push(`       Error: ${result.error}`);
      }
    }

    return lines.join('\n');
  }
}

// Singleton instance
let verifierInstance: CompletionVerifierService | null = null;

/**
 * Get the singleton CompletionVerifierService instance
 */
export function getCompletionVerifierService(): CompletionVerifierService {
  if (!verifierInstance) {
    verifierInstance = new CompletionVerifierService();
  }
  return verifierInstance;
}
