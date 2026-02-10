/**
 * Circuit Breaker - Generic circuit breaker for resilient service operations
 *
 * Implements the circuit breaker pattern to prevent cascading failures by:
 * - Tracking consecutive failures
 * - Opening the circuit after threshold is reached
 * - Providing cooldown period before retrying
 * - Resetting on successful operations
 *
 * @see https://martinfowler.com/bliki/CircuitBreaker.html
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('CircuitBreaker');

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Cooldown period in milliseconds before auto-resetting */
  cooldownMs: number;
  /** Name for logging purposes */
  name: string;
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  timeSinceLastFailure: number;
}

/**
 * Generic circuit breaker for service resilience
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   cooldownMs: 300000, // 5 minutes
 *   name: 'AvaGateway'
 * });
 *
 * async function callService() {
 *   if (breaker.isCircuitOpen()) {
 *     throw new Error('Service circuit breaker is open');
 *   }
 *
 *   try {
 *     const result = await service.call();
 *     breaker.recordSuccess();
 *     return result;
 *   } catch (error) {
 *     breaker.recordFailure();
 *     throw error;
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private isOpen = false;
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    logger.debug(`Circuit breaker initialized: ${config.name}`, {
      failureThreshold: config.failureThreshold,
      cooldownMs: config.cooldownMs,
    });
  }

  /**
   * Check if the circuit breaker is currently open
   *
   * Auto-resets to closed state after cooldown period expires.
   *
   * @returns true if circuit is open (blocking operations)
   */
  isCircuitOpen(): boolean {
    // Auto-reset after cooldown period
    if (this.isOpen && Date.now() - this.lastFailureTime >= this.config.cooldownMs) {
      logger.info(
        `${this.config.name}: Circuit breaker cooldown expired, resetting to closed state`
      );
      this.reset();
      return false;
    }
    return this.isOpen;
  }

  /**
   * Record a successful operation
   *
   * Resets failure count and closes the circuit if open.
   */
  recordSuccess(): void {
    if (this.failureCount > 0 || this.isOpen) {
      logger.info(`${this.config.name}: Operation succeeded, resetting circuit breaker`, {
        previousFailures: this.failureCount,
        wasOpen: this.isOpen,
      });
    }
    this.failureCount = 0;
    this.isOpen = false;
  }

  /**
   * Record a failed operation
   *
   * Increments failure count and may open the circuit if threshold is reached.
   *
   * @returns true if circuit was opened by this failure
   */
  recordFailure(): boolean {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold && !this.isOpen) {
      this.isOpen = true;
      logger.warn(
        `${this.config.name}: Circuit breaker OPENED after ${this.failureCount} consecutive failures. ` +
          `Will retry after ${this.config.cooldownMs}ms cooldown.`
      );
      return true;
    }

    if (!this.isOpen) {
      logger.debug(
        `${this.config.name}: Failure ${this.failureCount}/${this.config.failureThreshold}`
      );
    }

    return false;
  }

  /**
   * Reset the circuit breaker to closed state
   *
   * Clears failure count and closes the circuit.
   */
  reset(): void {
    const wasOpen = this.isOpen;
    const previousFailures = this.failureCount;

    this.failureCount = 0;
    this.isOpen = false;

    if (wasOpen || previousFailures > 0) {
      logger.info(`${this.config.name}: Circuit breaker manually reset`, {
        wasOpen,
        previousFailures,
      });
    }
  }

  /**
   * Get current circuit breaker state for monitoring
   *
   * @returns Current state snapshot
   */
  getState(): CircuitBreakerState {
    return {
      isOpen: this.isOpen,
      failureCount: this.failureCount,
      timeSinceLastFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : 0,
    };
  }

  /**
   * Get failure count
   *
   * @returns Number of consecutive failures
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Check if failure count has reached backoff threshold
   *
   * Used to trigger exponential backoff before circuit opens.
   *
   * @param threshold - Number of failures to trigger backoff (default: 3)
   * @returns true if backoff should be applied
   */
  shouldBackoff(threshold = 3): boolean {
    return this.failureCount >= threshold && !this.isOpen;
  }
}
