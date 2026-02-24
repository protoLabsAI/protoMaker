/**
 * Ralph Loop Service - Persistent retry loops with external verification
 *
 * Ralph Mode is a "never give up" execution mode where the agent keeps retrying
 * until the feature is externally verified as complete. This service orchestrates
 * the retry loop, verification, and failure analysis.
 */

import type { EventEmitter } from '../lib/events.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { SettingsService } from './settings-service.js';
import { FeatureLoader } from './feature-loader.js';
import type {
  Feature,
  RalphLoopConfig,
  RalphLoopState,
  RalphIteration,
  CompletionCriterion,
  CriterionCheckResult,
  VerificationResult,
  RalphFailureAnalysis,
  RalphEventPayload,
  EventType,
} from '@protolabs-ai/types';
import type { RalphFailureCategory } from '@protolabs-ai/types';
import { DEFAULT_RALPH_CONFIG } from '@protolabs-ai/types';
import { atomicWriteJson, readJsonWithRecovery } from '@protolabs-ai/utils';
import { getFeatureDir, getRalphDir } from '@protolabs-ai/platform';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';

const execAsync = promisify(exec);

/**
 * Running Ralph loop state
 */
interface RunningRalphLoop {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  abortController: AbortController;
  state: RalphLoopState;
  startTime: number;
}

export class RalphLoopService {
  private events: EventEmitter;
  private autoModeService: AutoModeService;
  private settingsService: SettingsService | null;
  private featureLoader = new FeatureLoader();
  private runningLoops = new Map<string, RunningRalphLoop>();

  constructor(
    events: EventEmitter,
    autoModeService: AutoModeService,
    settingsService?: SettingsService
  ) {
    this.events = events;
    this.autoModeService = autoModeService;
    this.settingsService = settingsService ?? null;
  }

  /**
   * Emit a Ralph event
   */
  private emitRalphEvent(
    eventType: EventType,
    payload: Omit<RalphEventPayload, 'eventType'>
  ): void {
    this.events.emit(eventType, {
      ...payload,
      eventType: eventType as RalphEventPayload['eventType'],
    });
  }

  /**
   * Get the path to store Ralph loop state
   */
  private getRalphStatePath(projectPath: string, featureId: string): string {
    const ralphDir = getRalphDir(projectPath, featureId);
    return path.join(ralphDir, 'ralph-state.json');
  }

  /**
   * Get the path to store Ralph loop progress log
   */
  private getRalphProgressPath(projectPath: string, featureId: string): string {
    const ralphDir = getRalphDir(projectPath, featureId);
    return path.join(ralphDir, 'ralph-progress.md');
  }

  /**
   * Save Ralph loop state to disk
   */
  private async saveState(
    projectPath: string,
    featureId: string,
    state: RalphLoopState
  ): Promise<void> {
    const statePath = this.getRalphStatePath(projectPath, featureId);
    await secureFs.mkdir(path.dirname(statePath), { recursive: true });
    await atomicWriteJson(statePath, state, { backupCount: 3 });
  }

  /**
   * Load Ralph loop state from disk
   */
  private async loadState(projectPath: string, featureId: string): Promise<RalphLoopState | null> {
    const statePath = this.getRalphStatePath(projectPath, featureId);
    try {
      const result = await readJsonWithRecovery<RalphLoopState>(statePath, null);
      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Append to the progress log markdown file
   */
  private async appendProgressLog(
    projectPath: string,
    featureId: string,
    content: string
  ): Promise<void> {
    const progressPath = this.getRalphProgressPath(projectPath, featureId);
    await secureFs.mkdir(path.dirname(progressPath), { recursive: true });
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n\n${content}\n`;
    try {
      await secureFs.appendFile(progressPath, entry);
    } catch {
      // File doesn't exist, create with header
      const header = `# Ralph Loop Progress: ${featureId}\n\nThis file tracks the progress of the Ralph loop for this feature.\n`;
      await secureFs.writeFile(progressPath, header + entry);
    }
  }

  /**
   * Load a feature
   */
  private async loadFeature(projectPath: string, featureId: string): Promise<Feature | null> {
    const featurePath = path.join(getFeatureDir(projectPath, featureId), 'feature.json');
    try {
      const result = await readJsonWithRecovery<Feature>(featurePath, null);
      return result.data;
    } catch {
      return null;
    }
  }

  /**
   * Get the worktree path for a feature
   */
  private getWorktreePath(projectPath: string, featureId: string): string {
    const sanitizedFeatureId = featureId.replace(/[^a-zA-Z0-9_-]/g, '-');
    return path.join(projectPath, '.worktrees', sanitizedFeatureId);
  }

  /**
   * Check if a worktree exists
   */
  private async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      await secureFs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a single completion criterion check
   */
  private async checkCriterion(
    criterion: CompletionCriterion,
    workDir: string
  ): Promise<CriterionCheckResult> {
    const startTime = Date.now();
    let passed = false;
    let details = '';

    try {
      switch (criterion.type) {
        case 'lint_passes': {
          const { stdout, stderr } = await execAsync('npm run lint', {
            cwd: workDir,
            timeout: criterion.config?.timeout || 120000,
          });
          passed = true;
          details = stdout || stderr || 'Lint passed with no output';
          break;
        }

        case 'typecheck_passes': {
          const { stdout, stderr } = await execAsync('npm run typecheck', {
            cwd: workDir,
            timeout: criterion.config?.timeout || 120000,
          });
          passed = true;
          details = stdout || stderr || 'Type check passed with no output';
          break;
        }

        case 'tests_pass': {
          const { stdout, stderr } = await execAsync('npm test', {
            cwd: workDir,
            timeout: criterion.config?.timeout || 300000, // Tests may take longer
          });
          passed = true;
          details = stdout || stderr || 'Tests passed with no output';
          break;
        }

        case 'build_succeeds': {
          const { stdout, stderr } = await execAsync('npm run build', {
            cwd: workDir,
            timeout: criterion.config?.timeout || 300000,
          });
          passed = true;
          details = stdout || stderr || 'Build succeeded with no output';
          break;
        }

        case 'file_exists': {
          const filePath = criterion.config?.filePath;
          if (!filePath) {
            throw new Error('file_exists criterion requires filePath config');
          }
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workDir, filePath);
          await secureFs.access(fullPath);
          passed = true;
          details = `File exists: ${filePath}`;
          break;
        }

        case 'file_contains': {
          const filePath = criterion.config?.filePath;
          const searchPattern = criterion.config?.searchPattern;
          if (!filePath || !searchPattern) {
            throw new Error('file_contains criterion requires filePath and searchPattern config');
          }
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(workDir, filePath);
          const content = (await secureFs.readFile(fullPath, 'utf-8')) as string;
          const regex = new RegExp(searchPattern);
          passed = regex.test(content);
          details = passed
            ? `File contains pattern: ${searchPattern}`
            : `File does not contain pattern: ${searchPattern}`;
          break;
        }

        case 'command_succeeds': {
          const command = criterion.config?.command;
          if (!command) {
            throw new Error('command_succeeds criterion requires command config');
          }
          const cwd = criterion.config?.cwd || workDir;
          const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout: criterion.config?.timeout || 120000,
          });
          passed = true;
          details = stdout || stderr || 'Command succeeded with no output';
          break;
        }

        case 'http_endpoint': {
          const url = criterion.config?.url;
          if (!url) {
            throw new Error('http_endpoint criterion requires url config');
          }
          const response = await fetch(url);
          const expectedStatus = criterion.config?.expectedStatus || 200;
          passed = response.status === expectedStatus;

          if (criterion.config?.expectedBodyContains) {
            const body = await response.text();
            passed = passed && body.includes(criterion.config.expectedBodyContains);
          }

          details = passed
            ? `Endpoint ${url} returned expected response`
            : `Endpoint ${url} returned status ${response.status}, expected ${expectedStatus}`;
          break;
        }

        case 'all_criteria':
          // This is a meta-type handled at the verification level
          passed = true;
          details = 'Meta criterion - all individual criteria must pass';
          break;

        default:
          throw new Error(`Unknown criterion type: ${criterion.type}`);
      }
    } catch (error) {
      passed = false;
      details = error instanceof Error ? error.message : String(error);
    }

    return {
      criterion,
      passed,
      details,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Run all verification checks
   */
  private async runVerification(
    criteria: CompletionCriterion[],
    workDir: string
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const results: CriterionCheckResult[] = [];
    let allPassed = true;

    for (const criterion of criteria) {
      if (criterion.type === 'all_criteria') {
        continue; // Skip meta-type
      }

      const result = await this.checkCriterion(criterion, workDir);
      results.push(result);

      if (!result.passed && criterion.required !== false) {
        allPassed = false;
        // Stop on first required failure
        break;
      }
    }

    return {
      allPassed,
      results,
      totalDurationMs: Date.now() - startTime,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyze a verification failure to help the agent improve
   */
  private analyzeFailure(verification: VerificationResult): RalphFailureAnalysis {
    const failedResult = verification.results.find((r) => !r.passed);
    if (!failedResult) {
      return {
        category: 'unknown',
        summary: 'No failure found',
        details: 'Verification passed but analysis was requested',
        suggestedActions: [],
      };
    }

    const criterion = failedResult.criterion;
    const details = failedResult.details;
    let category: RalphFailureCategory = 'unknown';
    let summary = '';
    const suggestedActions: string[] = [];
    const relevantFiles: string[] = [];

    // Categorize based on criterion type and error details
    switch (criterion.type) {
      case 'tests_pass':
        category = 'test_failure';
        summary = 'Test suite failed';
        suggestedActions.push(
          'Review the failing test output to understand what assertion failed',
          'Check if the implementation matches the expected behavior in the tests',
          'Consider if the test expectations are correct for the new implementation'
        );
        break;

      case 'build_succeeds':
        category = 'build_error';
        summary = 'Build process failed';
        suggestedActions.push(
          'Check for syntax errors in the modified files',
          'Ensure all imports are correctly specified',
          'Verify that all required dependencies are installed'
        );
        break;

      case 'lint_passes':
        category = 'lint_error';
        summary = 'Linting failed';
        suggestedActions.push(
          'Fix the linting errors shown in the output',
          'Check for common issues: unused variables, missing semicolons, formatting'
        );
        break;

      case 'typecheck_passes':
        category = 'type_error';
        summary = 'TypeScript type checking failed';
        suggestedActions.push(
          'Review the type errors shown in the output',
          'Ensure function signatures match their implementations',
          'Check for missing or incorrect type annotations'
        );
        break;

      case 'file_exists':
        category = 'missing_file';
        summary = `Required file not found: ${criterion.config?.filePath}`;
        suggestedActions.push(
          `Create the file: ${criterion.config?.filePath}`,
          'Check if the file was created in the correct location'
        );
        if (criterion.config?.filePath) {
          relevantFiles.push(criterion.config.filePath);
        }
        break;

      case 'file_contains':
        category = 'content_mismatch';
        summary = `File does not contain expected content: ${criterion.config?.searchPattern}`;
        suggestedActions.push(
          `Add the expected content to: ${criterion.config?.filePath}`,
          'Verify the file content matches the specification'
        );
        if (criterion.config?.filePath) {
          relevantFiles.push(criterion.config.filePath);
        }
        break;

      case 'command_succeeds':
        if (details.includes('timeout')) {
          category = 'timeout';
          summary = 'Command timed out';
        } else {
          category = 'runtime_error';
          summary = `Command failed: ${criterion.config?.command}`;
        }
        suggestedActions.push(
          'Review the command output for error messages',
          'Check if all dependencies and preconditions are met'
        );
        break;

      case 'http_endpoint':
        category = 'network_error';
        summary = `HTTP endpoint check failed: ${criterion.config?.url}`;
        suggestedActions.push(
          'Ensure the server is running',
          'Check that the endpoint URL is correct',
          'Verify the expected response format'
        );
        break;

      default:
        summary = 'Unknown failure';
        suggestedActions.push('Review the error details and try to identify the issue');
    }

    return {
      category,
      summary,
      details,
      suggestedActions,
      relevantFiles: relevantFiles.length > 0 ? relevantFiles : undefined,
    };
  }

  /**
   * Build the prompt addition for Ralph mode context
   */
  private buildRalphContextPrompt(state: RalphLoopState, config: RalphLoopConfig): string {
    const parts: string[] = [];

    parts.push(`
## Ralph Mode Active

You are in Ralph Mode - a persistent retry loop. Your goal is to implement the feature
and ensure all verification criteria pass. Never give up until verified!

**Current iteration:** ${state.currentIteration} of ${config.maxIterations || 10}
**Status:** ${state.status}
`);

    // Add completion criteria
    parts.push('\n### Completion Criteria\n');
    parts.push('Your implementation must pass ALL of these checks:\n');
    for (const criterion of config.completionCriteria) {
      const required = criterion.required !== false ? '(required)' : '(optional)';
      parts.push(`- **${criterion.name}** ${required}: ${criterion.type}`);
    }

    // Add previous iteration context if enabled
    if (config.includePreviousIterationsInContext !== false && state.iterations.length > 0) {
      const maxPrevious = config.maxPreviousIterationsInContext || 3;
      const recentIterations = state.iterations.slice(-maxPrevious);

      parts.push('\n### Previous Iterations\n');
      for (const iter of recentIterations) {
        parts.push(`#### Iteration ${iter.iterationNumber}`);
        if (iter.agentSummary) {
          parts.push(`**Summary:** ${iter.agentSummary}`);
        }
        if (iter.verification && !iter.verification.allPassed) {
          parts.push(
            `**Failed verification:** ${iter.verification.results.find((r) => !r.passed)?.criterion.name || 'Unknown'}`
          );
        }
        if (iter.failureAnalysis && config.includeFailureAnalysisInContext !== false) {
          parts.push(`**Failure:** ${iter.failureAnalysis.summary}`);
          parts.push('**Suggested actions:**');
          for (const action of iter.failureAnalysis.suggestedActions) {
            parts.push(`  - ${action}`);
          }
        }
        parts.push('');
      }
    }

    // Add custom prompt additions
    if (config.customPromptAdditions) {
      parts.push('\n### Additional Instructions\n');
      parts.push(config.customPromptAdditions);
    }

    return parts.join('\n');
  }

  /**
   * Start a Ralph loop for a feature
   */
  async startLoop(
    projectPath: string,
    featureId: string,
    config?: Partial<RalphLoopConfig>
  ): Promise<RalphLoopState> {
    // Check if already running
    if (this.runningLoops.has(featureId)) {
      throw new Error(`Ralph loop already running for feature ${featureId}`);
    }

    // Load the feature
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Merge config with defaults
    const fullConfig: RalphLoopConfig = {
      ...DEFAULT_RALPH_CONFIG,
      ...config,
      completionCriteria: config?.completionCriteria || DEFAULT_RALPH_CONFIG.completionCriteria,
    };

    // Initialize state
    const state: RalphLoopState = {
      featureId,
      projectPath,
      status: 'running',
      config: fullConfig,
      iterations: [],
      currentIteration: 0,
      startedAt: new Date().toISOString(),
    };

    // Determine work directory
    const worktreePath = this.getWorktreePath(projectPath, featureId);
    const worktreeExists = await this.worktreeExists(worktreePath);
    const workDir = worktreeExists ? worktreePath : projectPath;

    // Create abort controller
    const abortController = new AbortController();

    // Track this loop
    const runningLoop: RunningRalphLoop = {
      featureId,
      projectPath,
      worktreePath: worktreeExists ? worktreePath : null,
      abortController,
      state,
      startTime: Date.now(),
    };
    this.runningLoops.set(featureId, runningLoop);

    // Save initial state
    await this.saveState(projectPath, featureId, state);
    await this.appendProgressLog(
      projectPath,
      featureId,
      `Ralph loop started with config:\n\`\`\`json\n${JSON.stringify(fullConfig, null, 2)}\n\`\`\``
    );

    // Emit start event
    this.emitRalphEvent('ralph:started', {
      featureId,
      projectPath,
      loopState: state,
      message: 'Ralph loop started',
    });

    // Start the loop in background
    this.runLoopAsync(runningLoop, workDir, feature);

    return state;
  }

  /**
   * Run the loop asynchronously
   */
  private async runLoopAsync(
    loop: RunningRalphLoop,
    workDir: string,
    _feature: Feature
  ): Promise<void> {
    const { featureId, projectPath, state, abortController } = loop;
    const config = state.config;
    const maxIterations = config.maxIterations || 10;

    try {
      while (
        state.currentIteration < maxIterations &&
        state.status === 'running' &&
        !abortController.signal.aborted
      ) {
        state.currentIteration++;
        const iteration: RalphIteration = {
          iterationNumber: state.currentIteration,
          startedAt: new Date().toISOString(),
        };
        state.iterations.push(iteration);

        // Emit iteration started
        this.emitRalphEvent('ralph:iteration_started', {
          featureId,
          projectPath,
          loopState: state,
          currentIteration: iteration,
          message: `Starting iteration ${state.currentIteration}`,
        });

        await this.appendProgressLog(
          projectPath,
          featureId,
          `### Iteration ${state.currentIteration} started`
        );

        // Build Ralph context prompt
        const _ralphContext = this.buildRalphContextPrompt(state, config);

        // Execute the agent via auto-mode service
        // The agent will receive the Ralph context as additional prompt
        try {
          // Run the feature using auto-mode service
          // Note: This is a simplified approach - we're leveraging existing infrastructure
          await this.autoModeService.executeFeature(
            projectPath,
            featureId,
            true, // useWorktrees
            false // isAutoMode - we're managing the loop ourselves
          );

          // Agent completed - check if aborted
          if (abortController.signal.aborted) {
            break;
          }

          iteration.endedAt = new Date().toISOString();
          iteration.durationMs = Date.now() - new Date(iteration.startedAt).getTime();

          // Emit iteration completed
          this.emitRalphEvent('ralph:iteration_completed', {
            featureId,
            projectPath,
            loopState: state,
            currentIteration: iteration,
            message: `Iteration ${state.currentIteration} agent completed`,
          });
        } catch (error) {
          // Agent failed - record error but continue to verification
          iteration.endedAt = new Date().toISOString();
          iteration.durationMs = Date.now() - new Date(iteration.startedAt).getTime();

          const errorMessage = error instanceof Error ? error.message : String(error);
          await this.appendProgressLog(projectPath, featureId, `Agent error: ${errorMessage}`);
        }

        // Run verification
        state.status = 'verifying';
        await this.saveState(projectPath, featureId, state);

        this.emitRalphEvent('ralph:verification_started', {
          featureId,
          projectPath,
          loopState: state,
          message: 'Running verification checks',
        });

        const verification = await this.runVerification(config.completionCriteria, workDir);
        iteration.verification = verification;

        this.emitRalphEvent('ralph:verification_completed', {
          featureId,
          projectPath,
          loopState: state,
          currentIteration: iteration,
          verificationResult: verification,
          message: verification.allPassed
            ? 'All verification checks passed!'
            : `Verification failed: ${verification.results.find((r) => !r.passed)?.criterion.name}`,
        });

        await this.appendProgressLog(
          projectPath,
          featureId,
          `Verification result: ${verification.allPassed ? 'PASSED' : 'FAILED'}\n${JSON.stringify(
            verification.results.map((r) => ({ name: r.criterion.name, passed: r.passed })),
            null,
            2
          )}`
        );

        // Check if verified
        if (verification.allPassed) {
          state.status = 'verified';
          state.endedAt = new Date().toISOString();
          state.totalDurationMs = Date.now() - loop.startTime;

          await this.saveState(projectPath, featureId, state);
          await this.appendProgressLog(
            projectPath,
            featureId,
            `## SUCCESS - Feature verified after ${state.currentIteration} iteration(s)!`
          );

          this.emitRalphEvent('ralph:verified', {
            featureId,
            projectPath,
            loopState: state,
            message: `Feature verified after ${state.currentIteration} iteration(s)!`,
          });

          // Clean up
          this.runningLoops.delete(featureId);
          return;
        }

        // Analyze failure for next iteration
        const failureAnalysis = this.analyzeFailure(verification);
        iteration.failureAnalysis = failureAnalysis;
        state.status = 'running'; // Back to running for next iteration

        await this.saveState(projectPath, featureId, state);
        await this.appendProgressLog(
          projectPath,
          featureId,
          `Failure analysis:\n- Category: ${failureAnalysis.category}\n- Summary: ${failureAnalysis.summary}\n- Suggested actions:\n${failureAnalysis.suggestedActions.map((a) => `  - ${a}`).join('\n')}`
        );

        // Wait before next iteration
        if (config.iterationDelayMs && config.iterationDelayMs > 0) {
          await this.sleep(config.iterationDelayMs);
        }
      }

      // Loop ended without success
      if (state.currentIteration >= maxIterations) {
        state.status = 'max_iterations_reached';
        state.endedAt = new Date().toISOString();
        state.totalDurationMs = Date.now() - loop.startTime;

        await this.saveState(projectPath, featureId, state);
        await this.appendProgressLog(
          projectPath,
          featureId,
          `## MAX ITERATIONS REACHED - Loop ended after ${maxIterations} iterations without success`
        );

        this.emitRalphEvent('ralph:max_iterations', {
          featureId,
          projectPath,
          loopState: state,
          message: `Max iterations (${maxIterations}) reached without verification success`,
        });
      }
    } catch (error) {
      state.status = 'error';
      state.lastError = error instanceof Error ? error.message : String(error);
      state.endedAt = new Date().toISOString();
      state.totalDurationMs = Date.now() - loop.startTime;

      await this.saveState(projectPath, featureId, state);
      await this.appendProgressLog(
        projectPath,
        featureId,
        `## ERROR - Loop terminated: ${state.lastError}`
      );

      this.emitRalphEvent('ralph:error', {
        featureId,
        projectPath,
        loopState: state,
        message: `Error: ${state.lastError}`,
      });
    } finally {
      this.runningLoops.delete(featureId);
    }
  }

  /**
   * Stop a running Ralph loop
   */
  async stopLoop(featureId: string): Promise<RalphLoopState | null> {
    const loop = this.runningLoops.get(featureId);
    if (!loop) {
      return null;
    }

    // Abort the loop
    loop.abortController.abort();
    loop.state.status = 'stopped';
    loop.state.endedAt = new Date().toISOString();
    loop.state.totalDurationMs = Date.now() - loop.startTime;

    await this.saveState(loop.projectPath, featureId, loop.state);
    await this.appendProgressLog(loop.projectPath, featureId, '## STOPPED - Loop manually stopped');

    this.emitRalphEvent('ralph:stopped', {
      featureId,
      projectPath: loop.projectPath,
      loopState: loop.state,
      message: 'Ralph loop stopped by user',
    });

    this.runningLoops.delete(featureId);
    return loop.state;
  }

  /**
   * Pause a running Ralph loop
   */
  async pauseLoop(featureId: string): Promise<RalphLoopState | null> {
    const loop = this.runningLoops.get(featureId);
    if (!loop) {
      return null;
    }

    loop.state.status = 'paused';
    await this.saveState(loop.projectPath, featureId, loop.state);
    await this.appendProgressLog(loop.projectPath, featureId, '## PAUSED - Loop paused');

    this.emitRalphEvent('ralph:paused', {
      featureId,
      projectPath: loop.projectPath,
      loopState: loop.state,
      message: 'Ralph loop paused',
    });

    return loop.state;
  }

  /**
   * Resume a paused Ralph loop
   */
  async resumeLoop(projectPath: string, featureId: string): Promise<RalphLoopState | null> {
    // Load existing state
    const state = await this.loadState(projectPath, featureId);
    if (!state || state.status !== 'paused') {
      return null;
    }

    // Load the feature
    const feature = await this.loadFeature(projectPath, featureId);
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }

    // Determine work directory
    const worktreePath = this.getWorktreePath(projectPath, featureId);
    const worktreeExists = await this.worktreeExists(worktreePath);
    const workDir = worktreeExists ? worktreePath : projectPath;

    // Create abort controller
    const abortController = new AbortController();

    // Update state
    state.status = 'running';

    // Track this loop
    const runningLoop: RunningRalphLoop = {
      featureId,
      projectPath,
      worktreePath: worktreeExists ? worktreePath : null,
      abortController,
      state,
      startTime: state.startedAt ? new Date(state.startedAt).getTime() : Date.now(),
    };
    this.runningLoops.set(featureId, runningLoop);

    await this.saveState(projectPath, featureId, state);
    await this.appendProgressLog(projectPath, featureId, '## RESUMED - Loop resumed');

    this.emitRalphEvent('ralph:resumed', {
      featureId,
      projectPath,
      loopState: state,
      message: 'Ralph loop resumed',
    });

    // Continue the loop
    this.runLoopAsync(runningLoop, workDir, feature);

    return state;
  }

  /**
   * Get the status of a Ralph loop
   */
  async getStatus(projectPath: string, featureId: string): Promise<RalphLoopState | null> {
    // Check running loops first
    const running = this.runningLoops.get(featureId);
    if (running) {
      return running.state;
    }

    // Load from disk
    return this.loadState(projectPath, featureId);
  }

  /**
   * Get all running Ralph loops
   */
  getRunningLoops(): Array<{ featureId: string; projectPath: string; state: RalphLoopState }> {
    return Array.from(this.runningLoops.values()).map((loop) => ({
      featureId: loop.featureId,
      projectPath: loop.projectPath,
      state: loop.state,
    }));
  }

  /**
   * Check if a feature has a Ralph loop running
   */
  isLoopRunning(featureId: string): boolean {
    return this.runningLoops.has(featureId);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
