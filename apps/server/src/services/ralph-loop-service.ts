/**
 * Ralph Loop Service - Persistent retry loop until external verification passes
 *
 * Inspired by the Ralph Wiggum "never give up" philosophy:
 * - External Verification: Tests/validation must pass (not agent declaration)
 * - Iteration Logging: Each attempt logged with learnings and context
 * - Context Accumulation: Failures feed into next iteration's context
 * - Progress Tracking: Progress file documents each iteration
 *
 * Key differences from standard auto-mode:
 * - Continues until verifiable completion (external criteria)
 * - Builds context from previous failures for next attempt
 * - Configurable max iterations and completion criteria
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { ensureAutomakerDir } from '@automaker/platform';
import * as secureFs from '../lib/secure-fs.js';
import type { EventEmitter } from '../lib/events.js';
import type { Feature } from '@automaker/types';

const execAsync = promisify(exec);
const logger = createLogger('RalphLoop');

// ============================================================================
// Types
// ============================================================================

/**
 * Completion criterion types for verifying feature completion
 */
export type CompletionCriterion =
  | { type: 'tests_pass'; command: string }
  | { type: 'build_succeeds'; command: string }
  | { type: 'lint_clean'; command: string }
  | { type: 'file_exists'; path: string }
  | { type: 'file_contains'; path: string; pattern: string }
  | { type: 'custom_script'; command: string; successExitCode?: number };

/**
 * Configuration for Ralph mode execution
 */
export interface RalphModeConfig {
  enabled: boolean;
  maxIterations: number;
  completionCriteria: CompletionCriterion[];
  iterationDelay: number; // ms between iterations
  preserveContext: boolean; // Feed failures to next attempt
  progressFile: string; // Path to iteration log (relative to .automaker)
}

/**
 * Result of checking a single completion criterion
 */
export interface CriterionResult {
  criterion: CompletionCriterion;
  passed: boolean;
  output: string;
  duration: number;
  error?: string;
}

/**
 * Result of verifying all completion criteria
 */
export interface VerificationResult {
  allPassed: boolean;
  results: CriterionResult[];
  summary: string;
  timestamp: string;
}

/**
 * Log entry for a single iteration
 */
export interface IterationLog {
  iteration: number;
  startedAt: string;
  duration: number; // ms
  verification: VerificationResult | null;
  error: string | null;
  context?: string; // Context provided to the agent
}

/**
 * Result of executing a Ralph loop
 */
export interface RalphLoopResult {
  success: boolean;
  iterations: number;
  progressLog: IterationLog[];
  reason?: 'max_iterations_reached' | 'criteria_passed' | 'aborted' | 'error';
  finalVerification?: VerificationResult;
  totalDuration: number;
}

/**
 * Progress file format for persistence
 */
export interface RalphProgressFile {
  featureId: string;
  featureTitle?: string;
  startedAt: string;
  lastUpdatedAt: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  config: RalphModeConfig;
  iterations: IterationLog[];
  result?: RalphLoopResult;
}

/**
 * Callback for executing an agent iteration
 * This allows the Ralph loop to be agnostic about how agents are executed
 */
export type AgentExecutor = (
  feature: Feature,
  context?: string,
  iteration?: number
) => Promise<void>;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RALPH_CONFIG: Omit<RalphModeConfig, 'completionCriteria'> = {
  enabled: true,
  maxIterations: 10,
  iterationDelay: 5000, // 5 seconds
  preserveContext: true,
  progressFile: 'ralph/progress.json',
};

// ============================================================================
// Ralph Loop Service
// ============================================================================

/**
 * RalphLoopService - Persistent retry loop with external verification
 *
 * Manages the execution of features in "Ralph mode" - a never-give-up
 * approach that continues iterating until external completion criteria
 * are verified or max iterations are reached.
 */
export class RalphLoopService {
  private events: EventEmitter;
  private activeLoops: Map<string, { abort: () => void; promise: Promise<RalphLoopResult> }> =
    new Map();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Execute a feature in Ralph mode - persistent retry until verified
   *
   * @param feature - The feature to execute
   * @param config - Ralph mode configuration
   * @param projectPath - Absolute path to the project
   * @param agentExecutor - Function to execute the agent for each iteration
   * @param worktreePath - Optional worktree path (defaults to projectPath)
   * @returns Result of the Ralph loop execution
   */
  async executeRalphLoop(
    feature: Feature,
    config: RalphModeConfig,
    projectPath: string,
    agentExecutor: AgentExecutor,
    worktreePath?: string
  ): Promise<RalphLoopResult> {
    const loopStartTime = Date.now();
    const effectiveWorktreePath = worktreePath || projectPath;
    let aborted = false;

    // Create abort controller for this loop
    const abortController = {
      abort: () => {
        aborted = true;
      },
    };

    // Track active loop
    const loopPromise = this.runLoop(
      feature,
      config,
      projectPath,
      effectiveWorktreePath,
      agentExecutor,
      () => aborted,
      loopStartTime
    );

    this.activeLoops.set(feature.id, {
      abort: abortController.abort,
      promise: loopPromise,
    });

    try {
      const result = await loopPromise;
      return result;
    } finally {
      this.activeLoops.delete(feature.id);
    }
  }

  /**
   * Internal loop execution
   */
  private async runLoop(
    feature: Feature,
    config: RalphModeConfig,
    projectPath: string,
    worktreePath: string,
    agentExecutor: AgentExecutor,
    isAborted: () => boolean,
    loopStartTime: number
  ): Promise<RalphLoopResult> {
    let iteration = 0;
    const progressLog: IterationLog[] = [];

    // Initialize progress file
    const progressFilePath = await this.getProgressFilePath(projectPath, config.progressFile);
    await this.initializeProgressFile(progressFilePath, feature, config);

    logger.info(`Starting Ralph loop for feature ${feature.id} (max ${config.maxIterations} iterations)`);
    this.emitProgress(feature.id, 'started', { maxIterations: config.maxIterations });

    while (iteration < config.maxIterations) {
      // Check for abort
      if (isAborted()) {
        logger.info(`Ralph loop aborted for feature ${feature.id} at iteration ${iteration}`);
        const result: RalphLoopResult = {
          success: false,
          iterations: iteration,
          progressLog,
          reason: 'aborted',
          totalDuration: Date.now() - loopStartTime,
        };
        await this.finalizeProgressFile(progressFilePath, 'aborted', result);
        this.emitProgress(feature.id, 'aborted', { iteration });
        return result;
      }

      iteration++;
      const iterationStart = Date.now();
      const startedAt = new Date().toISOString();

      logger.info(`Ralph loop iteration ${iteration}/${config.maxIterations} for feature ${feature.id}`);
      this.emitProgress(feature.id, 'iteration_start', { iteration, maxIterations: config.maxIterations });

      // Build context from previous failures
      const context = config.preserveContext ? this.buildIterationContext(progressLog) : undefined;

      try {
        // Execute the agent
        await agentExecutor(feature, context, iteration);

        // Verify completion criteria
        const verification = await this.verifyCompletion(worktreePath, config.completionCriteria);

        const iterationLog: IterationLog = {
          iteration,
          startedAt,
          duration: Date.now() - iterationStart,
          verification,
          error: null,
          context,
        };

        progressLog.push(iterationLog);

        // Save progress file
        await this.updateProgressFile(progressFilePath, iterationLog);

        if (verification.allPassed) {
          logger.info(`Ralph loop completed successfully for feature ${feature.id} after ${iteration} iteration(s)`);
          const result: RalphLoopResult = {
            success: true,
            iterations: iteration,
            progressLog,
            reason: 'criteria_passed',
            finalVerification: verification,
            totalDuration: Date.now() - loopStartTime,
          };
          await this.finalizeProgressFile(progressFilePath, 'completed', result);
          this.emitProgress(feature.id, 'completed', {
            iteration,
            verification: verification.summary,
          });
          return result;
        }

        // Emit iteration failed progress
        this.emitProgress(feature.id, 'iteration_failed', {
          iteration,
          verification: verification.summary,
          failedCriteria: verification.results.filter((r) => !r.passed).length,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Ralph loop iteration ${iteration} failed for feature ${feature.id}:`, error);

        const iterationLog: IterationLog = {
          iteration,
          startedAt,
          duration: Date.now() - iterationStart,
          verification: null,
          error: errorMessage,
          context,
        };

        progressLog.push(iterationLog);
        await this.updateProgressFile(progressFilePath, iterationLog);

        this.emitProgress(feature.id, 'iteration_error', {
          iteration,
          error: errorMessage,
        });
      }

      // Delay before next iteration (unless this was the last one)
      if (iteration < config.maxIterations && !isAborted()) {
        logger.debug(`Waiting ${config.iterationDelay}ms before next iteration`);
        await this.sleep(config.iterationDelay);
      }
    }

    // Max iterations reached
    logger.warn(`Ralph loop reached max iterations (${config.maxIterations}) for feature ${feature.id}`);
    const result: RalphLoopResult = {
      success: false,
      iterations: iteration,
      progressLog,
      reason: 'max_iterations_reached',
      totalDuration: Date.now() - loopStartTime,
    };
    await this.finalizeProgressFile(progressFilePath, 'failed', result);
    this.emitProgress(feature.id, 'max_iterations', { iteration, maxIterations: config.maxIterations });
    return result;
  }

  /**
   * Verify all completion criteria are met
   */
  async verifyCompletion(
    workingDirectory: string,
    criteria: CompletionCriterion[]
  ): Promise<VerificationResult> {
    const results: CriterionResult[] = [];
    const timestamp = new Date().toISOString();

    for (const criterion of criteria) {
      const result = await this.checkCriterion(workingDirectory, criterion);
      results.push(result);
    }

    const allPassed = results.every((r) => r.passed);
    const passedCount = results.filter((r) => r.passed).length;
    const summary = `${passedCount}/${results.length} criteria passed`;

    return {
      allPassed,
      results,
      summary,
      timestamp,
    };
  }

  /**
   * Check a single completion criterion
   */
  async checkCriterion(
    workingDirectory: string,
    criterion: CompletionCriterion
  ): Promise<CriterionResult> {
    const startTime = Date.now();

    try {
      switch (criterion.type) {
        case 'tests_pass':
        case 'build_succeeds':
        case 'lint_clean': {
          const { stdout, stderr } = await execAsync(criterion.command, {
            cwd: workingDirectory,
            timeout: 300000, // 5 minute timeout
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          });
          return {
            criterion,
            passed: true,
            output: stdout + (stderr ? `\nStderr: ${stderr}` : ''),
            duration: Date.now() - startTime,
          };
        }

        case 'custom_script': {
          const successExitCode = criterion.successExitCode ?? 0;
          try {
            const { stdout, stderr } = await execAsync(criterion.command, {
              cwd: workingDirectory,
              timeout: 300000,
              maxBuffer: 10 * 1024 * 1024,
            });
            return {
              criterion,
              passed: true,
              output: stdout + (stderr ? `\nStderr: ${stderr}` : ''),
              duration: Date.now() - startTime,
            };
          } catch (error) {
            // Check if it's an exit code mismatch
            const execError = error as { code?: number; stdout?: string; stderr?: string };
            if (execError.code === successExitCode) {
              return {
                criterion,
                passed: true,
                output: (execError.stdout || '') + (execError.stderr ? `\nStderr: ${execError.stderr}` : ''),
                duration: Date.now() - startTime,
              };
            }
            throw error;
          }
        }

        case 'file_exists': {
          const filePath = path.isAbsolute(criterion.path)
            ? criterion.path
            : path.join(workingDirectory, criterion.path);
          try {
            await secureFs.access(filePath);
            return {
              criterion,
              passed: true,
              output: `File exists: ${criterion.path}`,
              duration: Date.now() - startTime,
            };
          } catch {
            return {
              criterion,
              passed: false,
              output: `File does not exist: ${criterion.path}`,
              duration: Date.now() - startTime,
            };
          }
        }

        case 'file_contains': {
          const filePath = path.isAbsolute(criterion.path)
            ? criterion.path
            : path.join(workingDirectory, criterion.path);
          try {
            const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
            const regex = new RegExp(criterion.pattern);
            const matches = regex.test(content);
            return {
              criterion,
              passed: matches,
              output: matches
                ? `File contains pattern: ${criterion.pattern}`
                : `File does not contain pattern: ${criterion.pattern}`,
              duration: Date.now() - startTime,
            };
          } catch (error) {
            return {
              criterion,
              passed: false,
              output: `Error reading file: ${criterion.path}`,
              duration: Date.now() - startTime,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = criterion;
          return {
            criterion: _exhaustive,
            passed: false,
            output: 'Unknown criterion type',
            duration: Date.now() - startTime,
            error: 'Unknown criterion type',
          };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const execError = error as { stdout?: string; stderr?: string };
      return {
        criterion,
        passed: false,
        output: execError.stdout || execError.stderr || errorMessage,
        duration: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Build context string from previous failures for the next iteration
   */
  buildIterationContext(logs: IterationLog[]): string {
    if (logs.length === 0) {
      return '';
    }

    const failures = logs.filter((l) => !l.verification?.allPassed);
    if (failures.length === 0) {
      return '';
    }

    const contextLines: string[] = [
      '## Previous Iteration Results',
      '',
      'The following issues were found in previous iterations. Please address them:',
      '',
    ];

    for (const log of failures) {
      contextLines.push(`### Iteration ${log.iteration}`);

      if (log.error) {
        contextLines.push(`**Error:** ${log.error}`);
      }

      if (log.verification) {
        const failedResults = log.verification.results.filter((r) => !r.passed);
        for (const result of failedResults) {
          contextLines.push(`**Failed:** ${this.formatCriterionName(result.criterion)}`);
          if (result.output) {
            // Truncate long output
            const truncatedOutput =
              result.output.length > 500 ? result.output.substring(0, 500) + '...' : result.output;
            contextLines.push('```');
            contextLines.push(truncatedOutput);
            contextLines.push('```');
          }
        }
      }

      contextLines.push('');
    }

    return contextLines.join('\n');
  }

  /**
   * Format criterion name for display
   */
  private formatCriterionName(criterion: CompletionCriterion): string {
    switch (criterion.type) {
      case 'tests_pass':
        return `Tests: ${criterion.command}`;
      case 'build_succeeds':
        return `Build: ${criterion.command}`;
      case 'lint_clean':
        return `Lint: ${criterion.command}`;
      case 'file_exists':
        return `File exists: ${criterion.path}`;
      case 'file_contains':
        return `File contains pattern: ${criterion.path}`;
      case 'custom_script':
        return `Script: ${criterion.command}`;
      default:
        return 'Unknown criterion';
    }
  }

  /**
   * Get the absolute path for the progress file
   */
  private async getProgressFilePath(projectPath: string, relativePath: string): Promise<string> {
    await ensureAutomakerDir(projectPath);
    const progressDir = path.join(projectPath, '.automaker', path.dirname(relativePath));
    await secureFs.mkdir(progressDir, { recursive: true });
    return path.join(projectPath, '.automaker', relativePath);
  }

  /**
   * Initialize the progress file
   */
  private async initializeProgressFile(
    filePath: string,
    feature: Feature,
    config: RalphModeConfig
  ): Promise<void> {
    const progressFile: RalphProgressFile = {
      featureId: feature.id,
      featureTitle: feature.title,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      status: 'running',
      config,
      iterations: [],
    };

    await atomicWriteJson(filePath, progressFile);
    logger.debug(`Initialized progress file: ${filePath}`);
  }

  /**
   * Update the progress file with a new iteration
   */
  private async updateProgressFile(filePath: string, iterationLog: IterationLog): Promise<void> {
    try {
      const { data: progressFile } = await readJsonWithRecovery<RalphProgressFile | null>(
        filePath,
        null
      );
      if (progressFile) {
        progressFile.iterations.push(iterationLog);
        progressFile.lastUpdatedAt = new Date().toISOString();
        await atomicWriteJson(filePath, progressFile);
        logger.debug(`Updated progress file with iteration ${iterationLog.iteration}`);
      }
    } catch (error) {
      logger.error('Failed to update progress file:', error);
    }
  }

  /**
   * Finalize the progress file with the result
   */
  private async finalizeProgressFile(
    filePath: string,
    status: 'completed' | 'failed' | 'aborted',
    result: RalphLoopResult
  ): Promise<void> {
    try {
      const { data: progressFile } = await readJsonWithRecovery<RalphProgressFile | null>(
        filePath,
        null
      );
      if (progressFile) {
        progressFile.status = status;
        progressFile.lastUpdatedAt = new Date().toISOString();
        progressFile.result = result;
        await atomicWriteJson(filePath, progressFile);
        logger.info(`Finalized progress file with status: ${status}`);
      }
    } catch (error) {
      logger.error('Failed to finalize progress file:', error);
    }
  }

  /**
   * Emit progress event
   * Uses 'auto-mode:event' type with ralph_loop prefix for compatibility
   */
  private emitProgress(featureId: string, type: string, data: Record<string, unknown>): void {
    this.events.emit('auto-mode:event', {
      type: `ralph_loop_${type}`,
      featureId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Abort a running Ralph loop
   */
  abortLoop(featureId: string): boolean {
    const loop = this.activeLoops.get(featureId);
    if (loop) {
      loop.abort();
      return true;
    }
    return false;
  }

  /**
   * Check if a Ralph loop is running for a feature
   */
  isLoopRunning(featureId: string): boolean {
    return this.activeLoops.has(featureId);
  }

  /**
   * Get the result promise for a running loop
   */
  getLoopPromise(featureId: string): Promise<RalphLoopResult> | null {
    return this.activeLoops.get(featureId)?.promise ?? null;
  }

  /**
   * Read progress file for a feature
   */
  async getProgress(
    projectPath: string,
    progressFilePath: string
  ): Promise<RalphProgressFile | null> {
    try {
      const fullPath = path.join(projectPath, '.automaker', progressFilePath);
      const { data } = await readJsonWithRecovery<RalphProgressFile | null>(fullPath, null);
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Generate a markdown progress report
   */
  generateProgressReport(progress: RalphProgressFile): string {
    const lines: string[] = [
      `# Ralph Loop Progress: ${progress.featureTitle || progress.featureId}`,
      '',
      `**Status:** ${progress.status}`,
      `**Started:** ${progress.startedAt}`,
      `**Last Updated:** ${progress.lastUpdatedAt}`,
      `**Max Iterations:** ${progress.config.maxIterations}`,
      '',
    ];

    for (const iteration of progress.iterations) {
      const status = iteration.verification?.allPassed ? 'SUCCESS' : 'FAILED';
      lines.push(`## Iteration ${iteration.iteration} (${iteration.startedAt})`);
      lines.push(`- Duration: ${Math.round(iteration.duration / 1000)}s`);
      lines.push(`- Status: ${status}`);

      if (iteration.verification) {
        const passedCount = iteration.verification.results.filter((r) => r.passed).length;
        const totalCount = iteration.verification.results.length;
        lines.push(`- Verification: ${passedCount}/${totalCount} criteria passed`);

        const failedResults = iteration.verification.results.filter((r) => !r.passed);
        if (failedResults.length > 0) {
          lines.push('- Failed criteria:');
          for (const result of failedResults) {
            lines.push(`  - ${this.formatCriterionName(result.criterion)}`);
            if (result.error) {
              lines.push(`    Error: ${result.error}`);
            }
          }
        }
      }

      if (iteration.error) {
        lines.push(`- Error: ${iteration.error}`);
      }

      lines.push('');
    }

    if (progress.result) {
      lines.push('## Summary');
      lines.push(`- Total iterations: ${progress.result.iterations}`);
      lines.push(`- Total duration: ${Math.round(progress.result.totalDuration / 1000)}s`);
      lines.push(`- Final status: ${progress.result.success ? 'SUCCESS' : 'FAILED'}`);
      if (progress.result.reason) {
        lines.push(`- Reason: ${progress.result.reason}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton factory
let instance: RalphLoopService | null = null;

export function getRalphLoopService(events: EventEmitter): RalphLoopService {
  if (!instance) {
    instance = new RalphLoopService(events);
  }
  return instance;
}

export function createRalphLoopService(events: EventEmitter): RalphLoopService {
  return new RalphLoopService(events);
}
