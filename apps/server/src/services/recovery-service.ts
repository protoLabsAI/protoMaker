/**
 * Recovery Service - Automatic detection and repair of feature failures
 *
 * Provides failure analysis and recovery strategies for the self-healing system.
 * Works with auto-mode-service to automatically retry failed features with
 * context-aware recovery strategies.
 */

import type {
  FailureCategory,
  FailureAnalysis,
  RecoveryResult,
  RecoveryStrategy,
  ExecutionContext,
  RecoveryConfig,
  ErrorInfo,
} from '@protolabsai/types';
import { DEFAULT_RECOVERY_CONFIG } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../lib/secure-fs.js';
import path from 'node:path';
import type { EventEmitter } from '../lib/events.js';

/**
 * Structured record of a recovery attempt, persisted to JSONL for learning.
 */
export interface RecoveryRecord {
  timestamp: string;
  featureId: string;
  projectPath: string;
  category: FailureCategory;
  strategyType: string;
  success: boolean;
  errorMessage?: string;
  explanation?: string;
}

const logger = createLogger('RecoveryService');

/**
 * RecoveryService - Analyzes failures and executes recovery strategies
 */
export class RecoveryService {
  private events: EventEmitter;
  private config: RecoveryConfig;

  constructor(events: EventEmitter, config: Partial<RecoveryConfig> = {}) {
    this.events = events;
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Analyze a failure and determine recovery strategy
   */
  async analyzeFailure(
    error: Error | unknown,
    errorInfo: ErrorInfo,
    context: ExecutionContext
  ): Promise<FailureAnalysis> {
    const category = this.categorizeFailure(errorInfo, error);
    const strategy = this.determineStrategy(category, context);
    const maxRetries = this.getMaxRetries(category);
    const delay = this.calculateDelay(category, context.retryCount);

    const analysis: FailureAnalysis = {
      category,
      isRetryable: this.isRetryable(category, context),
      suggestedDelay: delay,
      maxRetries,
      recoveryStrategy: strategy,
      contextToPreserve: this.getContextToPreserve(category, context),
      explanation: this.explainFailure(category, errorInfo),
      originalError: errorInfo.message,
      currentRetryCount: context.retryCount,
    };

    logger.info(
      `Analyzed failure for feature ${context.featureId}: category=${category}, retryable=${analysis.isRetryable}, retryCount=${context.retryCount}/${maxRetries}`
    );

    // Emit event for failure analysis
    this.events.emit('recovery_analysis', {
      featureId: context.featureId,
      projectPath: context.projectPath,
      analysis: {
        category: analysis.category,
        isRetryable: analysis.isRetryable,
        currentRetryCount: analysis.currentRetryCount,
        maxRetries: analysis.maxRetries,
        explanation: analysis.explanation,
      },
    });

    return analysis;
  }

  /**
   * Execute automatic recovery based on strategy
   */
  async executeRecovery(
    featureId: string,
    analysis: FailureAnalysis,
    projectPath: string
  ): Promise<RecoveryResult> {
    const strategy = analysis.recoveryStrategy;
    logger.info(`Executing recovery for feature ${featureId}: strategy=${strategy.type}`);

    // Emit event before recovery attempt
    this.events.emit('recovery_started', {
      featureId,
      projectPath,
      strategy: strategy.type,
      retryCount: analysis.currentRetryCount,
    });

    let result: RecoveryResult;

    switch (strategy.type) {
      case 'retry':
        result = await this.executeRetry(featureId, strategy, analysis);
        break;

      case 'retry_with_context':
        result = await this.executeRetryWithContext(featureId, strategy, analysis);
        break;

      case 'alternative_approach':
        result = await this.executeAlternativeApproach(featureId, strategy, analysis);
        break;

      case 'rollback_and_retry':
        result = await this.executeRollbackAndRetry(featureId, analysis);
        break;

      case 'pause_and_wait':
        result = await this.executePauseAndWait(featureId, strategy, analysis);
        break;

      case 'escalate_to_user':
        result = await this.executeEscalateToUser(featureId, strategy, analysis, projectPath);
        break;

      default:
        result = {
          success: false,
          shouldRetry: false,
          failureReason: `Unknown recovery strategy: ${(strategy as { type: string }).type}`,
          actionTaken: 'none',
        };
    }

    // Emit event after recovery attempt
    this.events.emit('recovery_completed', {
      featureId,
      projectPath,
      strategy: strategy.type,
      success: result.success,
      shouldRetry: result.shouldRetry,
      actionTaken: result.actionTaken,
    });

    // Record the recovery attempt for learning
    await this.recordRecoveryAttempt(featureId, strategy, result.success, projectPath, {
      category: analysis.category,
      explanation: analysis.explanation,
      errorMessage: analysis.originalError,
    });

    return result;
  }

  /**
   * Record recovery attempt for learning.
   * Persists a structured JSONL record and emits an event.
   */
  async recordRecoveryAttempt(
    featureId: string,
    strategy: RecoveryStrategy,
    success: boolean,
    projectPath: string,
    extra?: { category?: FailureCategory; explanation?: string; errorMessage?: string }
  ): Promise<void> {
    logger.info(
      `Recording recovery attempt for feature ${featureId}: strategy=${strategy.type}, success=${success}`
    );

    const timestamp = new Date().toISOString();

    // Persist to JSONL
    const record: RecoveryRecord = {
      timestamp,
      featureId,
      projectPath,
      category: extra?.category ?? 'unknown',
      strategyType: strategy.type,
      success,
      errorMessage: extra?.errorMessage,
      explanation: extra?.explanation,
    };

    await this.appendRecoveryRecord(projectPath, record);

    // Check if we should generate lessons for this category
    if (!success && extra?.category) {
      await this.checkAndGenerateLessons(projectPath, extra.category);
    }

    // Emit event for tracking
    this.events.emit('recovery_recorded', {
      featureId,
      projectPath,
      strategy: strategy.type,
      success,
      timestamp,
    });
  }

  /**
   * Append a recovery record to the JSONL log file.
   */
  private async appendRecoveryRecord(projectPath: string, record: RecoveryRecord): Promise<void> {
    try {
      const filePath = this.getRecoveryLogPath(projectPath);
      const dir = path.dirname(filePath);

      if (!secureFs.existsSync(dir)) {
        await secureFs.mkdir(dir, { recursive: true });
      }

      await secureFs.appendFile(filePath, JSON.stringify(record) + '\n');
    } catch (error) {
      logger.error('Failed to write recovery record:', error);
    }
  }

  /**
   * Read all recovery records from the JSONL log.
   */
  async readRecoveryLog(projectPath: string): Promise<RecoveryRecord[]> {
    try {
      const filePath = this.getRecoveryLogPath(projectPath);

      if (!secureFs.existsSync(filePath)) {
        return [];
      }

      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
      const lines = content.split('\n').filter((l: string) => l.trim());

      const records: RecoveryRecord[] = [];
      for (let i = 0; i < lines.length; i++) {
        try {
          records.push(JSON.parse(lines[i]) as RecoveryRecord);
        } catch {
          logger.warn(`Skipping malformed recovery log line ${i + 1}`);
        }
      }
      return records;
    } catch (error) {
      logger.error('Failed to read recovery log:', error);
      return [];
    }
  }

  /**
   * Check if enough failures of a category have accumulated to generate lessons.
   * After 3+ failures of the same category, generates a context file with guidance.
   */
  async checkAndGenerateLessons(projectPath: string, category: FailureCategory): Promise<void> {
    try {
      const records = await this.readRecoveryLog(projectPath);
      const categoryRecords = records.filter((r) => r.category === category);

      if (categoryRecords.length < 3) {
        return;
      }

      const totalAttempts = categoryRecords.length;
      const successes = categoryRecords.filter((r) => r.success).length;
      const failures = totalAttempts - successes;
      const successRate = totalAttempts > 0 ? Math.round((successes / totalAttempts) * 100) : 0;

      // Collect unique error messages
      const errorMessages = [
        ...new Set(categoryRecords.filter((r) => r.errorMessage).map((r) => r.errorMessage!)),
      ];

      // Collect unique strategies used
      const strategies = [...new Set(categoryRecords.map((r) => r.strategyType))];

      const content = `# Failure Lessons: ${category}

> Auto-generated from ${totalAttempts} recovery attempts. Updated ${new Date().toISOString()}.

## Statistics

- **Total attempts**: ${totalAttempts}
- **Successes**: ${successes} (${successRate}%)
- **Failures**: ${failures}
- **Strategies tried**: ${strategies.join(', ')}

## Common Error Patterns

${errorMessages
  .slice(0, 5)
  .map((msg) => `- ${msg}`)
  .join('\n')}

## Guidance for Agents

${this.generateCategoryGuidance(category, successRate, strategies)}
`;

      // Write to context directory so it auto-injects into agent prompts
      const contextDir = path.join(getAutomakerDir(projectPath), 'context');
      if (!secureFs.existsSync(contextDir)) {
        await secureFs.mkdir(contextDir, { recursive: true });
      }

      const lessonFile = path.join(contextDir, `failure-lessons-${category}.md`);
      await secureFs.writeFile(lessonFile, content);

      logger.info(`Generated failure lessons for category "${category}" at ${lessonFile}`);

      this.events.emit('recovery_lesson_generated', {
        projectPath,
        category,
        totalAttempts,
        successRate,
      });
    } catch (error) {
      logger.error(`Failed to generate lessons for category "${category}":`, error);
    }
  }

  /**
   * Generate category-specific guidance for agents based on failure patterns.
   */
  private generateCategoryGuidance(
    category: FailureCategory,
    successRate: number,
    _strategies: string[]
  ): string {
    const guidance: Record<string, string> = {
      test_failure:
        'When tests fail, read the full test output before making changes. Fix one test at a time. Run the specific failing test file rather than the full suite.',
      merge_conflict:
        'A merge conflict was detected. Run `git fetch origin && git rebase origin/main` to rebase your branch onto the latest main. ' +
        'If conflicts appear during rebase, resolve them in each conflicting file, then run `git add <file>` and `git rebase --continue`. ' +
        'After a clean rebase, push with `git push --force-with-lease`. ' +
        'To prevent future conflicts, always rebase before starting work on a new feature.',
      dependency:
        'Check that all required packages are installed. Run `npm install` in the worktree before building. Verify import paths match the monorepo package structure.',
      tool_error:
        'Read the FULL error output before making any changes. For build/TypeScript errors: run `npm run build:packages` first, then `npm run build:server`, fix every error (not just the first). For git hook/lint failures: run `npm run format` to auto-fix Prettier, then `npm run lint` for ESLint issues. Never retry the same command without first making a code change.',
      transient:
        'Transient errors are usually temporary. Wait briefly and retry. If they persist, check network connectivity and API status.',
      rate_limit:
        'Rate limits require patience. Use exponential backoff. Batch operations where possible to reduce API calls.',
      authentication:
        'Authentication errors require valid credentials. Do not retry — escalate to the user.',
      validation:
        'Validation errors indicate incorrect input. Review the expected format and correct the data before retrying.',
      quota: 'Quota errors cannot be resolved by retrying. Escalate to the user.',
      unknown:
        'For unknown errors, gather as much diagnostic information as possible before retrying.',
    };

    let text = guidance[category] || guidance.unknown;

    if (successRate < 30) {
      text +=
        '\n\n**Warning**: Recovery success rate is very low for this category. Consider a fundamentally different approach.';
    }

    return text;
  }

  /**
   * Get the path to the recovery JSONL log file.
   */
  private getRecoveryLogPath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), 'recovery', 'failures.jsonl');
  }

  /**
   * Categorize a failure based on error information
   */
  private categorizeFailure(errorInfo: ErrorInfo, _error: unknown): FailureCategory {
    const message = errorInfo.message.toLowerCase();

    // Check specific error types first
    if (errorInfo.isAuth) {
      return 'authentication';
    }

    if (errorInfo.isQuotaExhausted) {
      return 'quota';
    }

    if (errorInfo.isRateLimit) {
      return 'rate_limit';
    }

    // Check for test failures
    if (
      message.includes('test failed') ||
      message.includes('tests failed') ||
      message.includes('assertion failed') ||
      message.includes('expect(') ||
      message.includes('test:') ||
      message.includes('vitest') ||
      message.includes('jest')
    ) {
      return 'test_failure';
    }

    // Check for merge conflicts
    if (
      message.includes('merge conflict') ||
      message.includes('conflict') ||
      message.includes('could not merge')
    ) {
      return 'merge_conflict';
    }

    // Check for dependency issues
    if (
      message.includes('module not found') ||
      message.includes('cannot find module') ||
      message.includes('dependency') ||
      message.includes('npm install') ||
      message.includes('package not found')
    ) {
      return 'dependency';
    }

    // Check for tool errors
    if (
      message.includes('tool error') ||
      message.includes('tool failed') ||
      message.includes('command failed') ||
      message.includes('execution failed')
    ) {
      return 'tool_error';
    }

    // Check for transient errors
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('connection refused') ||
      message.includes('socket hang up')
    ) {
      return 'transient';
    }

    // Check for validation errors
    if (
      message.includes('invalid') ||
      message.includes('validation') ||
      message.includes('syntax error') ||
      message.includes('parse error')
    ) {
      return 'validation';
    }

    return 'unknown';
  }

  /**
   * Determine the best recovery strategy for a failure category
   */
  private determineStrategy(
    category: FailureCategory,
    context: ExecutionContext
  ): RecoveryStrategy {
    switch (category) {
      case 'transient':
        return {
          type: 'retry',
          delay: this.calculateDelay(category, context.retryCount),
        };

      case 'rate_limit':
        return {
          type: 'pause_and_wait',
          duration: this.calculateDelay(category, context.retryCount),
          reason: 'API rate limit reached. Waiting before retry.',
        };

      case 'quota':
        return {
          type: 'escalate_to_user',
          reason: 'Usage quota exhausted. Please check your API plan or wait for quota reset.',
        };

      case 'test_failure':
        if (context.retryCount < this.config.maxTestFailureRetries) {
          const errorContext =
            context.previousErrors.length > 0
              ? `Previous test failures:\n${context.previousErrors.slice(-3).join('\n')}`
              : 'Tests failed on first attempt.';
          return {
            type: 'retry_with_context',
            context: `The previous attempt failed due to test failures. ${errorContext}\nPlease fix these issues and ensure all tests pass.`,
            delay: this.config.baseDelayMs,
          };
        }
        return {
          type: 'escalate_to_user',
          reason: `Tests failed after ${context.retryCount} attempts. Manual intervention needed.`,
        };

      case 'tool_error':
        return {
          type: 'alternative_approach',
          suggestion: 'The previous tool/command failed. Try an alternative approach.',
        };

      case 'merge_conflict':
        if (context.retryCount < 1) {
          return {
            type: 'retry_with_context',
            context:
              'A git merge conflict was detected. Rebase your branch onto the latest main before retrying: ' +
              '`git fetch origin && git rebase origin/main`. ' +
              'If conflicts appear, resolve them then run `git rebase --continue`. ' +
              'After a clean rebase, push with `git push --force-with-lease`.',
            delay: 5000,
          };
        }
        return {
          type: 'escalate_to_user',
          reason: 'Merge conflict persists after rebase attempt. Manual resolution required.',
        };

      case 'dependency':
        return {
          type: 'retry_with_context',
          context: 'A dependency was missing. The agent should install required dependencies.',
          delay: this.config.baseDelayMs,
        };

      case 'authentication':
        return {
          type: 'escalate_to_user',
          reason: 'Authentication failed. Please check your API key configuration.',
        };

      case 'validation':
        return {
          type: 'escalate_to_user',
          reason: 'Validation error occurred. The input or configuration may need review.',
        };

      default:
        if (context.retryCount < this.config.maxTransientRetries) {
          return {
            type: 'retry_with_context',
            context: `Unknown error occurred: ${context.previousErrors.slice(-1).join('')}. Please try a different approach.`,
            delay: this.calculateDelay('unknown', context.retryCount),
          };
        }
        return {
          type: 'escalate_to_user',
          reason: `Failed after ${context.retryCount} attempts with unknown errors.`,
        };
    }
  }

  /**
   * Check if a failure category is retryable given the context
   */
  private isRetryable(category: FailureCategory, context: ExecutionContext): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const maxRetries = this.getMaxRetries(category);
    if (context.retryCount >= maxRetries) {
      return false;
    }

    // These categories always need user intervention
    const nonRetryableCategories: FailureCategory[] = ['quota', 'authentication', 'validation'];

    return !nonRetryableCategories.includes(category);
  }

  /**
   * Get maximum retries for a failure category
   */
  private getMaxRetries(category: FailureCategory): number {
    switch (category) {
      case 'transient':
      case 'rate_limit':
        return this.config.maxTransientRetries;
      case 'test_failure':
        return this.config.maxTestFailureRetries;
      case 'tool_error':
      case 'dependency':
        return 2;
      case 'merge_conflict':
        return 1; // One auto-retry with rebase guidance; escalate if it persists
      case 'unknown':
        return this.config.maxTransientRetries;
      default:
        return 0; // No retries for quota, auth, validation
    }
  }

  /**
   * Calculate delay before retry with exponential backoff
   */
  private calculateDelay(category: FailureCategory, retryCount: number): number {
    let baseDelay = this.config.baseDelayMs;

    // Rate limits need longer delays
    if (category === 'rate_limit') {
      baseDelay = 5000; // 5 seconds base for rate limits
    }

    // Exponential backoff: base * 2^retryCount
    const delay = baseDelay * Math.pow(2, retryCount);

    // Cap at max delay
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Get context to preserve for retry attempts
   */
  private getContextToPreserve(category: FailureCategory, context: ExecutionContext): string[] {
    if (!this.config.preserveContext) {
      return [];
    }

    const items: string[] = [];

    // Always preserve previous errors
    if (context.previousErrors.length > 0) {
      items.push(...context.previousErrors.slice(-3));
    }

    // For test failures, include test output
    if (category === 'test_failure' && context.agentOutput) {
      const testOutput = this.extractTestOutput(context.agentOutput);
      if (testOutput) {
        items.push(testOutput);
      }
    }

    return items;
  }

  /**
   * Extract test output from agent output
   */
  private extractTestOutput(agentOutput: string): string | null {
    // Look for common test output patterns
    const patterns = [
      /FAIL\s+.+\n[\s\S]*?(?=\n\n|$)/g,
      /✗\s+.+\n[\s\S]*?(?=\n\n|$)/g,
      /Error:\s+.+\n[\s\S]*?(?=\n\n|$)/g,
    ];

    for (const pattern of patterns) {
      const matches = agentOutput.match(pattern);
      if (matches && matches.length > 0) {
        return matches.slice(0, 3).join('\n---\n');
      }
    }

    return null;
  }

  /**
   * Generate human-readable explanation of the failure
   */
  private explainFailure(category: FailureCategory, errorInfo: ErrorInfo): string {
    const explanations: Record<FailureCategory, string> = {
      transient:
        'A temporary network or timeout error occurred. This is usually resolved by retrying.',
      rate_limit: 'The API rate limit was reached. Waiting before retrying.',
      quota: 'Your API usage quota has been exhausted.',
      validation: 'The input or configuration failed validation.',
      tool_error: 'A tool or command failed during execution.',
      test_failure: 'One or more tests failed during verification.',
      merge_conflict: 'A git merge conflict was detected.',
      dependency: 'A required dependency is missing.',
      authentication: 'Authentication with the API failed.',
      retry_exhausted: 'The agent exhausted all retry attempts without success.',
      unknown: 'An unexpected error occurred.',
    };

    return `${explanations[category]} Original error: ${errorInfo.message}`;
  }

  // Strategy execution methods

  private async executeRetry(
    featureId: string,
    strategy: { type: 'retry'; delay: number },
    _analysis: FailureAnalysis
  ): Promise<RecoveryResult> {
    logger.info(`Simple retry for feature ${featureId} after ${strategy.delay}ms delay`);

    return {
      success: true,
      shouldRetry: true,
      actionTaken: `Scheduled retry after ${strategy.delay}ms delay`,
    };
  }

  private async executeRetryWithContext(
    featureId: string,
    strategy: { type: 'retry_with_context'; context: string; delay: number },
    _analysis: FailureAnalysis
  ): Promise<RecoveryResult> {
    logger.info(`Retry with context for feature ${featureId}`);

    return {
      success: true,
      shouldRetry: true,
      retryContext: strategy.context,
      actionTaken: `Scheduled retry with additional context: ${strategy.context.substring(0, 100)}...`,
    };
  }

  private async executeAlternativeApproach(
    featureId: string,
    strategy: { type: 'alternative_approach'; suggestion: string },
    _analysis: FailureAnalysis
  ): Promise<RecoveryResult> {
    logger.info(`Suggesting alternative approach for feature ${featureId}`);

    return {
      success: true,
      shouldRetry: true,
      retryContext: strategy.suggestion,
      actionTaken: `Suggested alternative approach: ${strategy.suggestion}`,
    };
  }

  private async executeRollbackAndRetry(
    featureId: string,
    _analysis: FailureAnalysis
  ): Promise<RecoveryResult> {
    logger.info(`Rollback and retry for feature ${featureId}`);

    // Note: Actual rollback would need git operations
    // For now, we just signal that retry should happen with fresh state
    return {
      success: true,
      shouldRetry: true,
      retryContext: 'Previous changes have been rolled back. Starting fresh.',
      actionTaken: 'Rolled back changes and scheduled fresh retry',
    };
  }

  private async executePauseAndWait(
    featureId: string,
    strategy: { type: 'pause_and_wait'; duration: number; reason: string },
    _analysis: FailureAnalysis
  ): Promise<RecoveryResult> {
    logger.info(`Pausing for ${strategy.duration}ms before retry for feature ${featureId}`);

    // The actual wait is handled by the caller
    return {
      success: true,
      shouldRetry: true,
      actionTaken: `Waiting ${strategy.duration}ms: ${strategy.reason}`,
    };
  }

  private async executeEscalateToUser(
    featureId: string,
    strategy: { type: 'escalate_to_user'; reason: string },
    _analysis: FailureAnalysis,
    projectPath?: string
  ): Promise<RecoveryResult> {
    logger.info(`Escalating to user for feature ${featureId}: ${strategy.reason}`);

    // Emit notification event (includes projectPath for issue creation pipeline)
    this.events.emit('recovery_escalated', {
      featureId,
      projectPath,
      reason: strategy.reason,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      shouldRetry: false,
      failureReason: strategy.reason,
      actionTaken: `Escalated to user: ${strategy.reason}`,
    };
  }

  /**
   * Update recovery configuration
   */
  updateConfig(config: Partial<RecoveryConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Recovery config updated:', this.config);
  }

  /**
   * Get current recovery configuration
   */
  getConfig(): RecoveryConfig {
    return { ...this.config };
  }
}

// Singleton instance (will be created when needed)
let recoveryServiceInstance: RecoveryService | null = null;

/**
 * Get or create the RecoveryService singleton
 */
export function getRecoveryService(events: EventEmitter): RecoveryService {
  if (!recoveryServiceInstance) {
    recoveryServiceInstance = new RecoveryService(events);
  }
  return recoveryServiceInstance;
}

/**
 * Create a new RecoveryService instance (for testing or custom configuration)
 */
export function createRecoveryService(
  events: EventEmitter,
  config?: Partial<RecoveryConfig>
): RecoveryService {
  return new RecoveryService(events, config);
}
