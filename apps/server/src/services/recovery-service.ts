/**
 * Recovery Service - Handles failure analysis and recovery strategies
 *
 * Provides automated recovery capabilities for agent failures including:
 * - Error analysis to determine appropriate recovery strategy
 * - Execution of recovery actions (retry, rollback, escalate, etc.)
 * - Recording of recovery attempts for learning and improvement
 *
 * Recovery Strategies:
 * - retry: Simple retry of the failed operation
 * - retry_with_context: Retry with additional context/hints
 * - alternative_approach: Try a different approach to solve the problem
 * - rollback_and_retry: Roll back changes and retry from clean state
 * - escalate_to_user: Request user intervention
 * - pause_and_wait: Pause execution (e.g., for rate limits)
 */

import { randomUUID } from 'crypto';
import { createLogger, classifyError } from '@automaker/utils';
import type { ErrorInfo, ErrorType, Feature } from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('RecoveryService');

/**
 * Recovery strategy types
 */
export type RecoveryStrategy =
  | 'retry'
  | 'retry_with_context'
  | 'alternative_approach'
  | 'rollback_and_retry'
  | 'escalate_to_user'
  | 'pause_and_wait';

/**
 * Recovery attempt status
 */
export type RecoveryStatus = 'pending' | 'in_progress' | 'success' | 'failed' | 'skipped';

/**
 * Analysis result from analyzeFailure
 */
export interface FailureAnalysis {
  /** Unique identifier for this analysis */
  id: string;
  /** The classified error information */
  errorInfo: ErrorInfo;
  /** Recommended recovery strategy */
  recommendedStrategy: RecoveryStrategy;
  /** Confidence level (0-1) in the recommendation */
  confidence: number;
  /** Human-readable explanation of the analysis */
  explanation: string;
  /** Additional context hints for recovery */
  contextHints: string[];
  /** Whether automatic recovery is recommended */
  autoRecoverRecommended: boolean;
  /** Estimated wait time in seconds (for pause_and_wait strategy) */
  estimatedWaitTime?: number;
  /** Timestamp of analysis */
  analyzedAt: string;
}

/**
 * Recovery attempt record
 */
export interface RecoveryAttempt {
  /** Unique identifier for this attempt */
  id: string;
  /** Reference to the failure analysis */
  analysisId: string;
  /** Feature ID this recovery is for */
  featureId: string;
  /** Project path */
  projectPath: string;
  /** Strategy used for this attempt */
  strategy: RecoveryStrategy;
  /** Current status of the attempt */
  status: RecoveryStatus;
  /** Attempt number (1, 2, 3...) */
  attemptNumber: number;
  /** Timestamp when attempt started */
  startedAt: string;
  /** Timestamp when attempt completed */
  completedAt?: string;
  /** Error message if attempt failed */
  errorMessage?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for executing recovery
 */
export interface RecoveryExecutionOptions {
  /** The failure analysis to recover from */
  analysis: FailureAnalysis;
  /** Feature being recovered */
  feature: Feature;
  /** Project path */
  projectPath: string;
  /** Override the recommended strategy */
  strategyOverride?: RecoveryStrategy;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Custom context to add for retry_with_context */
  additionalContext?: string;
  /** Callback for recovery progress */
  onProgress?: (attempt: RecoveryAttempt) => void;
}

/**
 * Result of recovery execution
 */
export interface RecoveryExecutionResult {
  /** Whether recovery was successful */
  success: boolean;
  /** The strategy that was used */
  strategy: RecoveryStrategy;
  /** All recovery attempts made */
  attempts: RecoveryAttempt[];
  /** Final error message if recovery failed */
  errorMessage?: string;
  /** Action required from user (for escalate_to_user) */
  userActionRequired?: string;
  /** Recommended wait time in seconds (for pause_and_wait) */
  waitTimeSeconds?: number;
}

/**
 * Configuration for the recovery service
 */
export interface RecoveryServiceConfig {
  /** Default maximum retries for retry strategies */
  defaultMaxRetries: number;
  /** Base delay in ms for exponential backoff */
  baseRetryDelayMs: number;
  /** Default wait time in seconds for pause_and_wait */
  defaultPauseWaitSeconds: number;
  /** Confidence threshold for auto-recovery */
  autoRecoveryConfidenceThreshold: number;
}

const DEFAULT_CONFIG: RecoveryServiceConfig = {
  defaultMaxRetries: 3,
  baseRetryDelayMs: 1000,
  defaultPauseWaitSeconds: 60,
  autoRecoveryConfidenceThreshold: 0.7,
};

/**
 * Strategy recommendation rules based on error type
 */
const STRATEGY_RULES: Record<
  ErrorType,
  { strategy: RecoveryStrategy; confidence: number; autoRecover: boolean }
> = {
  rate_limit: {
    strategy: 'pause_and_wait',
    confidence: 0.95,
    autoRecover: true,
  },
  quota_exhausted: {
    strategy: 'escalate_to_user',
    confidence: 0.9,
    autoRecover: false,
  },
  authentication: {
    strategy: 'escalate_to_user',
    confidence: 0.95,
    autoRecover: false,
  },
  execution: {
    strategy: 'retry_with_context',
    confidence: 0.6,
    autoRecover: true,
  },
  cancellation: {
    strategy: 'escalate_to_user',
    confidence: 0.8,
    autoRecover: false,
  },
  abort: {
    strategy: 'escalate_to_user',
    confidence: 0.9,
    autoRecover: false,
  },
  unknown: {
    strategy: 'retry',
    confidence: 0.4,
    autoRecover: false,
  },
};

/**
 * RecoveryService - Manages failure analysis and recovery strategies
 */
export class RecoveryService {
  private events: EventEmitter | null = null;
  private config: RecoveryServiceConfig;
  private attemptHistory: Map<string, RecoveryAttempt[]> = new Map();

  constructor(config: Partial<RecoveryServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the event emitter for broadcasting recovery events
   */
  setEventEmitter(events: EventEmitter): void {
    this.events = events;
  }

  /**
   * Analyze a failure and determine the appropriate recovery strategy
   *
   * @param error - The error that occurred
   * @param context - Optional context about the failure
   * @returns FailureAnalysis with recommended recovery strategy
   */
  analyzeFailure(
    error: unknown,
    context?: {
      featureId?: string;
      projectPath?: string;
      previousAttempts?: number;
      operationType?: string;
    }
  ): FailureAnalysis {
    const errorInfo = classifyError(error);
    const rule = STRATEGY_RULES[errorInfo.type];

    // Adjust confidence based on previous attempts
    let confidence = rule.confidence;
    const previousAttempts = context?.previousAttempts ?? 0;
    if (previousAttempts > 0) {
      // Reduce confidence with each failed attempt
      confidence = Math.max(0.1, confidence - previousAttempts * 0.15);
    }

    // Determine if auto-recovery should be attempted
    const autoRecoverRecommended =
      rule.autoRecover && confidence >= this.config.autoRecoveryConfidenceThreshold;

    // Build context hints based on error type
    const contextHints = this.buildContextHints(errorInfo, context);

    // Calculate estimated wait time for rate limits
    let estimatedWaitTime: number | undefined;
    if (errorInfo.type === 'rate_limit') {
      estimatedWaitTime = errorInfo.retryAfter ?? this.config.defaultPauseWaitSeconds;
    }

    // Build explanation
    const explanation = this.buildExplanation(errorInfo, rule.strategy, previousAttempts);

    const analysis: FailureAnalysis = {
      id: randomUUID(),
      errorInfo,
      recommendedStrategy: rule.strategy,
      confidence,
      explanation,
      contextHints,
      autoRecoverRecommended,
      estimatedWaitTime,
      analyzedAt: new Date().toISOString(),
    };

    logger.info(
      `Analyzed failure: ${errorInfo.type} -> ${rule.strategy} (confidence: ${confidence.toFixed(2)})`
    );

    // Emit analysis event
    if (this.events) {
      this.events.emit('recovery:analyzed', analysis);
    }

    return analysis;
  }

  /**
   * Execute a recovery strategy
   *
   * @param options - Recovery execution options
   * @returns RecoveryExecutionResult
   */
  async executeRecovery(options: RecoveryExecutionOptions): Promise<RecoveryExecutionResult> {
    const {
      analysis,
      feature,
      projectPath,
      strategyOverride,
      maxRetries = this.config.defaultMaxRetries,
      additionalContext,
      onProgress,
    } = options;

    const strategy = strategyOverride ?? analysis.recommendedStrategy;
    const attempts: RecoveryAttempt[] = [];
    const featureId = feature.id;

    logger.info(`Executing recovery strategy: ${strategy} for feature ${featureId}`);

    // Emit recovery started event
    if (this.events) {
      this.events.emit('recovery:started', { strategy, featureId, analysisId: analysis.id });
    }

    try {
      switch (strategy) {
        case 'retry':
          return await this.executeRetryStrategy(
            analysis,
            featureId,
            projectPath,
            maxRetries,
            attempts,
            onProgress
          );

        case 'retry_with_context':
          return await this.executeRetryWithContextStrategy(
            analysis,
            featureId,
            projectPath,
            maxRetries,
            additionalContext ?? analysis.contextHints.join('\n'),
            attempts,
            onProgress
          );

        case 'alternative_approach':
          return await this.executeAlternativeApproachStrategy(
            analysis,
            featureId,
            projectPath,
            attempts,
            onProgress
          );

        case 'rollback_and_retry':
          return await this.executeRollbackAndRetryStrategy(
            analysis,
            featureId,
            projectPath,
            maxRetries,
            attempts,
            onProgress
          );

        case 'escalate_to_user':
          return await this.executeEscalateToUserStrategy(
            analysis,
            featureId,
            projectPath,
            attempts,
            onProgress
          );

        case 'pause_and_wait':
          return await this.executePauseAndWaitStrategy(
            analysis,
            featureId,
            projectPath,
            attempts,
            onProgress
          );

        default:
          throw new Error(`Unknown recovery strategy: ${strategy}`);
      }
    } finally {
      // Emit recovery completed event
      if (this.events) {
        this.events.emit('recovery:completed', {
          strategy,
          featureId,
          analysisId: analysis.id,
          attemptCount: attempts.length,
        });
      }
    }
  }

  /**
   * Record a recovery attempt for learning and tracking
   *
   * @param attempt - The recovery attempt to record
   */
  recordRecoveryAttempt(attempt: RecoveryAttempt): void {
    const key = `${attempt.projectPath}:${attempt.featureId}`;

    if (!this.attemptHistory.has(key)) {
      this.attemptHistory.set(key, []);
    }

    const history = this.attemptHistory.get(key)!;
    history.push(attempt);

    // Limit history size per feature
    if (history.length > 100) {
      history.shift();
    }

    logger.debug(`Recorded recovery attempt ${attempt.id} for feature ${attempt.featureId}`);

    // Emit event for tracking
    if (this.events) {
      this.events.emit('recovery:attempt_recorded', attempt);
    }
  }

  /**
   * Get recovery attempt history for a feature
   *
   * @param projectPath - Project path
   * @param featureId - Feature ID
   * @returns Array of recovery attempts
   */
  getAttemptHistory(projectPath: string, featureId: string): RecoveryAttempt[] {
    const key = `${projectPath}:${featureId}`;
    return this.attemptHistory.get(key) ?? [];
  }

  /**
   * Get statistics for recovery attempts
   *
   * @param projectPath - Optional project path filter
   * @returns Recovery statistics
   */
  getStatistics(projectPath?: string): {
    totalAttempts: number;
    successRate: number;
    byStrategy: Record<RecoveryStrategy, { attempts: number; successes: number }>;
    byErrorType: Record<string, { attempts: number; successes: number }>;
  } {
    const stats = {
      totalAttempts: 0,
      successRate: 0,
      byStrategy: {} as Record<RecoveryStrategy, { attempts: number; successes: number }>,
      byErrorType: {} as Record<string, { attempts: number; successes: number }>,
    };

    let successes = 0;

    for (const [key, attempts] of this.attemptHistory.entries()) {
      // Filter by project if specified
      if (projectPath && !key.startsWith(projectPath)) {
        continue;
      }

      for (const attempt of attempts) {
        stats.totalAttempts++;
        if (attempt.status === 'success') {
          successes++;
        }

        // Track by strategy
        if (!stats.byStrategy[attempt.strategy]) {
          stats.byStrategy[attempt.strategy] = { attempts: 0, successes: 0 };
        }
        stats.byStrategy[attempt.strategy].attempts++;
        if (attempt.status === 'success') {
          stats.byStrategy[attempt.strategy].successes++;
        }
      }
    }

    stats.successRate = stats.totalAttempts > 0 ? successes / stats.totalAttempts : 0;

    return stats;
  }

  /**
   * Clear recovery history
   *
   * @param projectPath - Optional project path to clear (clears all if not specified)
   * @param featureId - Optional feature ID to clear
   */
  clearHistory(projectPath?: string, featureId?: string): void {
    if (!projectPath) {
      this.attemptHistory.clear();
      logger.info('Cleared all recovery history');
      return;
    }

    if (featureId) {
      const key = `${projectPath}:${featureId}`;
      this.attemptHistory.delete(key);
      logger.info(`Cleared recovery history for feature ${featureId}`);
      return;
    }

    // Clear all for project
    for (const key of this.attemptHistory.keys()) {
      if (key.startsWith(projectPath)) {
        this.attemptHistory.delete(key);
      }
    }
    logger.info(`Cleared recovery history for project ${projectPath}`);
  }

  // Private helper methods

  private buildContextHints(errorInfo: ErrorInfo, context?: { operationType?: string }): string[] {
    const hints: string[] = [];

    switch (errorInfo.type) {
      case 'execution':
        hints.push('Consider breaking the task into smaller steps');
        hints.push('Check for syntax errors or typos in the code');
        hints.push('Verify all required dependencies are available');
        break;
      case 'rate_limit':
        hints.push(`Wait ${errorInfo.retryAfter ?? 60} seconds before retrying`);
        hints.push('Consider reducing concurrent operations');
        break;
      case 'authentication':
        hints.push('Verify API key is valid and not expired');
        hints.push('Check authentication credentials');
        break;
      case 'quota_exhausted':
        hints.push('Check account billing and usage limits');
        hints.push('Consider upgrading plan or waiting for quota reset');
        break;
    }

    if (context?.operationType) {
      hints.push(`Failed during: ${context.operationType}`);
    }

    return hints;
  }

  private buildExplanation(
    errorInfo: ErrorInfo,
    strategy: RecoveryStrategy,
    previousAttempts: number
  ): string {
    const base = `Error type "${errorInfo.type}" detected. `;
    const strategyDesc: Record<RecoveryStrategy, string> = {
      retry: 'A simple retry may resolve transient issues.',
      retry_with_context: 'Retrying with additional context hints to help guide the operation.',
      alternative_approach: 'The original approach failed; trying an alternative method.',
      rollback_and_retry: 'Rolling back changes and retrying from a clean state.',
      escalate_to_user: 'This error requires user intervention to resolve.',
      pause_and_wait: 'Waiting for external constraints (rate limits) to reset.',
    };

    let explanation = base + strategyDesc[strategy];

    if (previousAttempts > 0) {
      explanation += ` (${previousAttempts} previous attempt(s) have failed)`;
    }

    return explanation;
  }

  private createAttempt(
    analysisId: string,
    featureId: string,
    projectPath: string,
    strategy: RecoveryStrategy,
    attemptNumber: number
  ): RecoveryAttempt {
    return {
      id: randomUUID(),
      analysisId,
      featureId,
      projectPath,
      strategy,
      status: 'in_progress',
      attemptNumber,
      startedAt: new Date().toISOString(),
    };
  }

  private async executeRetryStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    maxRetries: number,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    // For retry strategy, we signal that a retry should be attempted
    // The actual retry execution happens in the calling code (e.g., auto-mode-service)
    const attempt = this.createAttempt(analysis.id, featureId, projectPath, 'retry', 1);
    attempt.status = 'pending';
    attempt.metadata = { maxRetries, message: 'Retry recommended - execute via agent service' };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    return {
      success: true,
      strategy: 'retry',
      attempts,
    };
  }

  private async executeRetryWithContextStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    maxRetries: number,
    additionalContext: string,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    // Signal retry with context - actual execution in calling code
    const attempt = this.createAttempt(
      analysis.id,
      featureId,
      projectPath,
      'retry_with_context',
      1
    );
    attempt.status = 'pending';
    attempt.metadata = {
      maxRetries,
      additionalContext,
      message: 'Retry with context recommended - add context hints to prompt',
    };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    return {
      success: true,
      strategy: 'retry_with_context',
      attempts,
    };
  }

  private async executeAlternativeApproachStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    // Signal alternative approach - actual execution in calling code
    const attempt = this.createAttempt(
      analysis.id,
      featureId,
      projectPath,
      'alternative_approach',
      1
    );
    attempt.status = 'pending';
    attempt.metadata = {
      message: 'Alternative approach recommended - modify strategy or break into smaller tasks',
      suggestions: [
        'Break the feature into smaller sub-tasks',
        'Try a different implementation approach',
        'Simplify the requirements',
      ],
    };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    return {
      success: true,
      strategy: 'alternative_approach',
      attempts,
    };
  }

  private async executeRollbackAndRetryStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    maxRetries: number,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    // Signal rollback and retry - actual git operations in calling code
    const attempt = this.createAttempt(
      analysis.id,
      featureId,
      projectPath,
      'rollback_and_retry',
      1
    );
    attempt.status = 'pending';
    attempt.metadata = {
      maxRetries,
      message: 'Rollback and retry recommended - reset worktree to clean state before retrying',
      steps: [
        'Save current changes if needed',
        'Reset worktree to last known good state',
        'Retry the operation',
      ],
    };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    return {
      success: true,
      strategy: 'rollback_and_retry',
      attempts,
    };
  }

  private async executeEscalateToUserStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    const attempt = this.createAttempt(analysis.id, featureId, projectPath, 'escalate_to_user', 1);
    attempt.status = 'pending';
    attempt.metadata = {
      message: 'User intervention required',
      errorType: analysis.errorInfo.type,
      errorMessage: analysis.errorInfo.message,
    };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    // Build user action message
    let userActionRequired = `Manual intervention needed: ${analysis.explanation}`;
    if (analysis.errorInfo.type === 'authentication') {
      userActionRequired = 'Please check and update your API credentials.';
    } else if (analysis.errorInfo.type === 'quota_exhausted') {
      userActionRequired =
        'Your usage quota has been exhausted. Please upgrade your plan or wait for quota reset.';
    }

    return {
      success: false,
      strategy: 'escalate_to_user',
      attempts,
      userActionRequired,
    };
  }

  private async executePauseAndWaitStrategy(
    analysis: FailureAnalysis,
    featureId: string,
    projectPath: string,
    attempts: RecoveryAttempt[],
    onProgress?: (attempt: RecoveryAttempt) => void
  ): Promise<RecoveryExecutionResult> {
    const waitTime = analysis.estimatedWaitTime ?? this.config.defaultPauseWaitSeconds;

    const attempt = this.createAttempt(analysis.id, featureId, projectPath, 'pause_and_wait', 1);
    attempt.status = 'pending';
    attempt.metadata = {
      waitTimeSeconds: waitTime,
      message: `Pause recommended for ${waitTime} seconds due to rate limiting`,
    };
    attempts.push(attempt);
    this.recordRecoveryAttempt(attempt);

    if (onProgress) {
      onProgress(attempt);
    }

    return {
      success: true,
      strategy: 'pause_and_wait',
      attempts,
      waitTimeSeconds: waitTime,
    };
  }
}

// Singleton instance
let recoveryServiceInstance: RecoveryService | null = null;

/**
 * Get the singleton recovery service instance
 */
export function getRecoveryService(): RecoveryService {
  if (!recoveryServiceInstance) {
    recoveryServiceInstance = new RecoveryService();
  }
  return recoveryServiceInstance;
}
