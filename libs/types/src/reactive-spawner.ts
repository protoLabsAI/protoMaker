/**
 * Reactive Spawner types
 *
 * Types for the ReactiveSpawnerService which spawns Ava agents in response
 * to messages, errors, and cron triggers with concurrency, rate limiting,
 * deduplication, and circuit breaker protection.
 */

/**
 * Categories of triggers that can spawn a reactive agent session.
 */
export type TriggerCategory = 'message' | 'error' | 'cron';

/**
 * Context passed when spawning an agent reactively.
 */
export interface TriggerContext {
  /** Category of the trigger */
  category: TriggerCategory;
  /** Human-readable description of what triggered this spawn */
  description: string;
  /** ISO timestamp when the trigger occurred */
  triggeredAt: string;
  /** Optional metadata for the trigger */
  metadata?: Record<string, unknown>;
}

/**
 * Result returned after a reactive spawn attempt.
 */
export interface SpawnResult {
  /** Whether the agent was successfully spawned and completed */
  spawned: boolean;
  /** Reason spawn was skipped (e.g. concurrency limit, rate limit, circuit open, dedup) */
  skippedReason?: string;
  /** The agent output text if successfully executed */
  output?: string;
  /** Error message if execution failed */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
  /** The trigger category that initiated this spawn */
  category: TriggerCategory;
}

/**
 * Budget configuration for controlling reactive spawn behavior.
 */
export interface HealingBudget {
  /** Maximum concurrent sessions per category */
  maxConcurrentPerCategory: number;
  /** Maximum sessions allowed per hour across all categories */
  maxSessionsPerHour: number;
  /** Circuit breaker failure threshold before opening */
  circuitBreakerFailureThreshold: number;
  /** Circuit breaker cooldown period in milliseconds */
  circuitBreakerCooldownMs: number;
  /** TTL in milliseconds for error deduplication hashes */
  errorDedupTtlMs: number;
}

/**
 * Inbound chat message from Ava's conversation surface.
 */
export interface AvaChatMessage {
  /** Message content */
  content: string;
  /** Channel or surface identifier */
  channelId?: string;
  /** Discord user or other actor who sent the message */
  author?: string;
  /** ISO timestamp of the message */
  timestamp?: string;
  /** Optional message ID for deduplication */
  messageId?: string;
}

/**
 * Context describing an error that should trigger a healing spawn.
 */
export interface ErrorContext {
  /** Error message */
  message: string;
  /** Error code or type classifier */
  errorType?: string;
  /** Stack trace (optional) */
  stack?: string;
  /** Service or component where the error occurred */
  source?: string;
  /** Optional feature ID associated with the error */
  featureId?: string;
  /** ISO timestamp when the error occurred */
  occurredAt?: string;
}
