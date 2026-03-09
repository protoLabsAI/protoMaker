/**
 * ReactiveSpawnerService — trigger-based agent spawning with rate limiting and circuit breaking.
 *
 * Spawns Ava agents in response to three trigger categories:
 * - message: reacts to an incoming AvaChatMessage
 * - error: reacts to an ErrorContext
 * - cron: reacts to a scheduled task
 *
 * Budget controls:
 * - maxConcurrent=1 per category (prevents overlapping runs in the same lane)
 * - maxSessionsPerHour=3 (global hourly cap, resets each hour)
 * - Error deduplication via a hash Set with 1h TTL (skips identical errors)
 * - CircuitBreaker per category (failureThreshold=3, cooldownMs=300000)
 */

import { createLogger } from '@protolabsai/utils';
import type { AvaChatMessage } from '@protolabsai/types';
import type { SpawnResult, TriggerCategory } from '@protolabsai/types';
import { CircuitBreaker } from '../lib/circuit-breaker.js';
import type { DynamicAgentExecutor } from './dynamic-agent-executor.js';
import type { AgentFactoryService } from './agent-factory-service.js';

const logger = createLogger('ReactiveSpawnerService');

/** Error context shape — callers supply the relevant fields */
export interface ErrorContext {
  /** Human-readable error message */
  message: string;
  /** Error type or classifier (e.g. 'high_memory', 'feature_failure', 'uncaught_exception') */
  errorType?: string;
  /** Optional error code (e.g. Node.js ErrnoException code) */
  code?: string;
  /** Optional stack trace (used for hashing and prompt context) */
  stack?: string;
  /** Alias for stack — callers may use either field */
  stackTrace?: string;
  /** Optional feature ID associated with the error */
  featureId?: string;
  /** Severity level of the error */
  severity?: 'low' | 'medium' | 'critical';
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Budget constants
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 1; // per category
const MAX_SESSIONS_PER_HOUR = 3; // global
const ERROR_DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 300_000; // 5 minutes
const HOUR_RESET_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ReactiveSpawnerService {
  /** Tracks whether a spawn is currently running for each category */
  private readonly running = new Map<TriggerCategory, boolean>([
    ['message', false],
    ['error', false],
    ['cron', false],
  ]);

  /** Circuit breakers, one per category */
  private readonly circuitBreakers = new Map<TriggerCategory, CircuitBreaker>([
    [
      'message',
      new CircuitBreaker({
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        cooldownMs: CIRCUIT_COOLDOWN_MS,
        name: 'ReactiveSpawner:message',
      }),
    ],
    [
      'error',
      new CircuitBreaker({
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        cooldownMs: CIRCUIT_COOLDOWN_MS,
        name: 'ReactiveSpawner:error',
      }),
    ],
    [
      'cron',
      new CircuitBreaker({
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        cooldownMs: CIRCUIT_COOLDOWN_MS,
        name: 'ReactiveSpawner:cron',
      }),
    ],
  ]);

  /** Seen error hashes (dedup) */
  private readonly seenErrorHashes = new Set<string>();

  /** Pending cleanup timers for error dedup entries */
  private readonly errorHashTimers: ReturnType<typeof setTimeout>[] = [];

  /** Hourly session counter */
  private sessionCount = 0;

  /** Timer to reset the hourly counter */
  private hourlyResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly agentFactoryService: AgentFactoryService,
    private readonly dynamicAgentExecutor: DynamicAgentExecutor,
    /** Project path used when creating agent configs */
    private readonly projectPath: string
  ) {
    this.scheduleHourlyReset();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Spawn an Ava agent in response to an incoming chat message */
  async spawnForMessage(msg: AvaChatMessage): Promise<SpawnResult> {
    const prompt = `React to the following Ava channel message and take appropriate action:\n\n${msg.content}`;
    return this.spawn('message', prompt);
  }

  /** Spawn an Ava agent to investigate and remediate an error */
  async spawnForError(ctx: ErrorContext): Promise<SpawnResult> {
    const hash = this.hashError(ctx);

    if (this.seenErrorHashes.has(hash)) {
      logger.debug(`ReactiveSpawner: duplicate error skipped (hash=${hash})`);
      return { spawned: false, skippedReason: 'duplicate_error', category: 'error' };
    }

    // Mark as seen and schedule cleanup
    this.seenErrorHashes.add(hash);
    const timer = setTimeout(() => {
      this.seenErrorHashes.delete(hash);
    }, ERROR_DEDUP_WINDOW_MS);
    this.errorHashTimers.push(timer);

    const stackTrace = ctx.stackTrace ?? ctx.stack;
    const prompt =
      `Investigate and remediate the following error:\n\n` +
      (ctx.errorType ? `Error Type: ${ctx.errorType}\n` : '') +
      `Message: ${ctx.message}\n` +
      (ctx.code ? `Code: ${ctx.code}\n` : '') +
      (ctx.severity ? `Severity: ${ctx.severity}\n` : '') +
      (ctx.featureId ? `Feature ID: ${ctx.featureId}\n` : '') +
      (stackTrace ? `Stack Trace:\n${stackTrace}\n` : '') +
      `\n` +
      `Instructions:\n` +
      `1. Investigate the root cause of this error.\n` +
      `2. If you can fix the root cause directly, do so.\n` +
      `3. If fixing requires a pull request (code changes), file a bug ticket on the board instead.\n` +
      `4. Do NOT restart the dev server under any circumstances.\n`;

    return this.spawn('error', prompt);
  }

  /** Spawn an Ava agent to execute a scheduled task */
  async spawnForCron(taskName: string, description: string): Promise<SpawnResult> {
    const prompt = `Execute the following scheduled task:\n\nTask: ${taskName}\n\n${description}`;
    return this.spawn('cron', prompt);
  }

  /** Gracefully shut down — clears all pending timers */
  close(): void {
    if (this.hourlyResetTimer !== null) {
      clearTimeout(this.hourlyResetTimer);
      this.hourlyResetTimer = null;
    }
    for (const timer of this.errorHashTimers) {
      clearTimeout(timer);
    }
    this.errorHashTimers.length = 0;
    logger.info('ReactiveSpawnerService: closed, all timers cleared');
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async spawn(category: TriggerCategory, prompt: string): Promise<SpawnResult> {
    // 1. Concurrency guard (per category)
    if (this.running.get(category)) {
      logger.debug(`ReactiveSpawner: already running for category="${category}"`);
      return { spawned: false, skippedReason: 'already_running', category };
    }

    // 2. Circuit breaker check
    const breaker = this.circuitBreakers.get(category)!;
    if (breaker.isCircuitOpen()) {
      logger.debug(`ReactiveSpawner: circuit open for category="${category}"`);
      return { spawned: false, skippedReason: 'circuit_open', category };
    }

    // 3. Hourly rate limit
    if (this.sessionCount >= MAX_SESSIONS_PER_HOUR) {
      logger.debug(
        `ReactiveSpawner: hourly rate limit reached (${this.sessionCount}/${MAX_SESSIONS_PER_HOUR})`
      );
      return { spawned: false, skippedReason: 'rate_limited', category };
    }

    // Claim the slot
    this.running.set(category, true);
    this.sessionCount++;

    logger.info(
      `ReactiveSpawner: spawning for category="${category}" (session ${this.sessionCount}/${MAX_SESSIONS_PER_HOUR} this hour)`
    );

    try {
      const agentConfig = this.agentFactoryService.createFromTemplate('ava', this.projectPath);
      const result = await this.dynamicAgentExecutor.execute(agentConfig, { prompt });

      if (result.success) {
        breaker.recordSuccess();
        return { spawned: true, category, output: result.output };
      } else {
        breaker.recordFailure();
        return { spawned: false, error: result.error, category };
      }
    } catch (err) {
      breaker.recordFailure();
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`ReactiveSpawner: unhandled error for category="${category}": ${message}`);
      return { spawned: false, error: message, category };
    } finally {
      this.running.set(category, false);
    }
  }

  /** Simple deterministic hash for error deduplication */
  private hashError(ctx: ErrorContext): string {
    return `${ctx.errorType ?? ctx.code ?? ''}::${ctx.message}`;
  }

  /** Schedule the hourly session-counter reset */
  private scheduleHourlyReset(): void {
    this.hourlyResetTimer = setTimeout(() => {
      this.sessionCount = 0;
      logger.debug('ReactiveSpawner: hourly session counter reset');
      this.scheduleHourlyReset();
    }, HOUR_RESET_MS);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance: ReactiveSpawnerService | null = null;

/**
 * Get the singleton ReactiveSpawnerService.
 *
 * Must be called with dependencies on first invocation.
 * Subsequent calls with no arguments return the existing instance.
 */
export function getReactiveSpawnerService(
  agentFactoryService?: AgentFactoryService,
  dynamicAgentExecutor?: DynamicAgentExecutor,
  projectPath?: string
): ReactiveSpawnerService {
  if (!instance) {
    if (!agentFactoryService || !dynamicAgentExecutor || !projectPath) {
      throw new Error(
        'ReactiveSpawnerService: agentFactoryService, dynamicAgentExecutor, and projectPath are required on first call'
      );
    }
    instance = new ReactiveSpawnerService(agentFactoryService, dynamicAgentExecutor, projectPath);
  }
  return instance;
}

/** Reset the singleton (for testing) */
export function resetReactiveSpawnerService(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
