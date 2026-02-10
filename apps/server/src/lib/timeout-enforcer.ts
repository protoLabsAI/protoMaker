/**
 * Timeout Enforcer - Enforces timeouts on agent operations with auto-abort
 *
 * Provides complexity-based timeout management:
 * - small: 300s (5 minutes)
 * - medium: 600s (10 minutes) - default
 * - large: 900s (15 minutes)
 * - architectural: 1200s (20 minutes)
 *
 * Features:
 * - Auto-abort on timeout
 * - Circuit breaker integration ready
 * - Emits agent:timeout events
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from './events.js';

const logger = createLogger('TimeoutEnforcer');

/**
 * Complexity levels for timeout calculation
 */
export type TimeoutComplexity = 'small' | 'medium' | 'large' | 'architectural';

/**
 * Timeout configuration by complexity
 */
const TIMEOUT_CONFIG: Record<TimeoutComplexity, number> = {
  small: 300_000, // 5 minutes
  medium: 600_000, // 10 minutes (default)
  large: 900_000, // 15 minutes
  architectural: 1_200_000, // 20 minutes
};

/**
 * Default timeout if complexity not specified
 */
const DEFAULT_TIMEOUT = TIMEOUT_CONFIG.medium;

/**
 * Timeout context for tracking operation state
 */
interface TimeoutContext {
  operationId: string;
  complexity: TimeoutComplexity;
  timeoutMs: number;
  startTime: number;
  abortController: AbortController;
}

/**
 * Get timeout duration for a given complexity level
 */
export function getTimeoutForComplexity(complexity?: TimeoutComplexity): number {
  if (!complexity) {
    return DEFAULT_TIMEOUT;
  }
  return TIMEOUT_CONFIG[complexity] ?? DEFAULT_TIMEOUT;
}

/**
 * Wrap an async operation with timeout enforcement
 *
 * @param operation - Async function to execute with timeout
 * @param options - Configuration options
 * @returns Promise that resolves with operation result or rejects on timeout
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: {
    operationId: string;
    complexity?: TimeoutComplexity;
    timeoutMs?: number;
    events?: EventEmitter;
    metadata?: Record<string, unknown>;
  }
): Promise<T> {
  const { operationId, complexity, timeoutMs: customTimeout, events, metadata = {} } = options;

  // Determine timeout duration
  const timeoutMs = customTimeout ?? getTimeoutForComplexity(complexity);
  const effectiveComplexity = complexity ?? 'medium';

  // Create abort controller for cancellation
  const abortController = new AbortController();

  // Create timeout context
  const context: TimeoutContext = {
    operationId,
    complexity: effectiveComplexity,
    timeoutMs,
    startTime: Date.now(),
    abortController,
  };

  logger.info('Starting operation with timeout', {
    operationId,
    complexity: effectiveComplexity,
    timeoutMs,
    timeoutSec: Math.round(timeoutMs / 1000),
  });

  // Create a promise that rejects after timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutHandle = setTimeout(() => {
      const elapsed = Date.now() - context.startTime;
      logger.warn('Operation timed out, aborting', {
        operationId,
        complexity: effectiveComplexity,
        timeoutMs,
        elapsedMs: elapsed,
        elapsedSec: Math.round(elapsed / 1000),
      });

      // Abort the operation
      abortController.abort();

      // Emit timeout event
      if (events) {
        events.emit('agent:timeout', {
          operationId,
          complexity: effectiveComplexity,
          timeoutMs,
          elapsedMs: elapsed,
          metadata,
        });
      }

      // Reject with timeout error
      const timeoutError = new Error(
        `Agent operation timed out after ${Math.round(timeoutMs / 1000)}s (${effectiveComplexity} complexity)`
      );
      timeoutError.name = 'TimeoutError';
      reject(timeoutError);
    }, timeoutMs);

    // Clean up timeout when aborted
    abortController.signal.addEventListener('abort', () => {
      clearTimeout(timeoutHandle);
    });
  });

  try {
    // Race the operation against the timeout
    const result = await Promise.race([operation(abortController.signal), timeoutPromise]);

    // Abort to trigger cleanup listener which clears the timeout handle
    abortController.abort();

    const elapsed = Date.now() - context.startTime;
    logger.info('Operation completed successfully', {
      operationId,
      complexity: effectiveComplexity,
      elapsedMs: elapsed,
      elapsedSec: Math.round(elapsed / 1000),
    });

    return result;
  } catch (error) {
    // Check if this was a timeout error
    if (isTimeoutError(error)) {
      const elapsed = Date.now() - context.startTime;
      logger.error('Operation aborted due to timeout', {
        operationId,
        complexity: effectiveComplexity,
        timeoutMs,
        elapsedMs: elapsed,
      });
    }

    // Re-throw all errors (timeout or otherwise)
    throw error;
  }
}

/**
 * Create a timeout-aware wrapper for agent operations
 *
 * This is a convenience function for wrapping Claude SDK operations.
 */
export function createTimeoutWrapper(events?: EventEmitter) {
  return async function wrapWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: {
      operationId: string;
      complexity?: TimeoutComplexity;
      timeoutMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<T> {
    return withTimeout(operation, {
      ...options,
      events,
    });
  };
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}
