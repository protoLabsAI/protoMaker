/**
 * OpsTracingService - Wraps maintenance sweeps and timer ticks with structured traces.
 *
 * Emits trace records as structured log entries and optionally forwards them to
 * Langfuse when configured. Uses probabilistic sampling for high-frequency timer
 * ticks to avoid overwhelming the tracing backend. Errors are always traced
 * regardless of sample rate.
 *
 * Gracefully degrades when Langfuse is not configured -- callers never need to
 * guard against missing observability infrastructure.
 */

import { createLogger } from '@protolabsai/utils';

const logger = createLogger('OpsTracing');

/** Minimum sample rate to prevent accidental full-volume tracing */
const MIN_SAMPLE_RATE = 0.001;
/** Maximum sample rate (100%) */
const MAX_SAMPLE_RATE = 1.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceCheckTrace {
  name: string;
  durationMs: number;
  issuesFound: number;
  fixesApplied: number;
}

export interface MaintenanceSweepResult {
  traceId: string;
  tier: 'critical' | 'full';
  checkCount: number;
  totalDurationMs: number;
  totalIssues: number;
  totalFixes: number;
}

export interface WebhookDeliveryResult {
  traceId: string;
  deliveryId: string;
  source: string;
  eventType: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface TimerTickResult {
  traceId: string;
  timerId: string;
  timerName: string;
  durationMs: number;
  isError: boolean;
  error?: string;
}

export interface OpsTracingOptions {
  /** Fraction of normal timer ticks to trace (0.0 - 1.0). Default: 0.01 (1%) */
  sampleRate?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class OpsTracingService {
  private readonly langfuseAvailable: boolean;
  private readonly sampleRate: number;

  constructor(opts?: OpsTracingOptions) {
    this.sampleRate = clampSampleRate(opts?.sampleRate ?? 0.01);
    this.langfuseAvailable = !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

    if (!this.langfuseAvailable) {
      logger.info('Langfuse not configured -- ops tracing will emit structured logs only');
    } else {
      logger.info(`Ops tracing active (sample rate: ${(this.sampleRate * 100).toFixed(1)}%)`);
    }
  }

  /**
   * Whether this tick should be traced. Always true for errors.
   * Normal ticks are sampled probabilistically at the configured rate.
   */
  shouldTrace(isError = false): boolean {
    if (!this.langfuseAvailable) return false;
    if (isError) return true;
    return Math.random() < this.sampleRate;
  }

  /** Whether the Langfuse backend is available for tracing */
  isAvailable(): boolean {
    return this.langfuseAvailable;
  }

  /** Current sample rate */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Trace a maintenance sweep (critical or full tier).
   * Returns a trace ID that can be used for correlation, or null if not traced.
   */
  async traceMaintenanceSweep(
    tier: 'critical' | 'full',
    checks: MaintenanceCheckTrace[],
    totalDurationMs: number
  ): Promise<MaintenanceSweepResult | null> {
    if (!this.langfuseAvailable) return null;

    const totalIssues = checks.reduce((sum, c) => sum + c.issuesFound, 0);
    const totalFixes = checks.reduce((sum, c) => sum + c.fixesApplied, 0);
    const traceId = `ops-sweep-${tier}-${Date.now()}`;

    const result: MaintenanceSweepResult = {
      traceId,
      tier,
      checkCount: checks.length,
      totalDurationMs,
      totalIssues,
      totalFixes,
    };

    logger.debug('Traced maintenance sweep', {
      traceId,
      tier,
      checks: checks.length,
      durationMs: totalDurationMs,
      issues: totalIssues,
      fixes: totalFixes,
    });

    return result;
  }

  /**
   * Trace a webhook delivery attempt.
   * Returns a trace result or null if Langfuse is unavailable.
   */
  async traceWebhookDelivery(
    deliveryId: string,
    source: string,
    eventType: string,
    durationMs: number,
    success: boolean,
    error?: string
  ): Promise<WebhookDeliveryResult | null> {
    if (!this.langfuseAvailable) return null;

    const traceId = `ops-webhook-${deliveryId}`;
    const result: WebhookDeliveryResult = {
      traceId,
      deliveryId,
      source,
      eventType,
      durationMs,
      success,
      error,
    };

    if (!success) {
      logger.warn('Webhook delivery failed', { traceId, source, eventType, error });
    } else {
      logger.debug('Traced webhook delivery', { traceId, source, eventType, durationMs });
    }

    return result;
  }

  /**
   * Trace a timer tick. Respects the sample rate for normal ticks;
   * errors are always traced.
   *
   * Returns a trace result or null if not sampled / unavailable.
   */
  async traceTimerTick(
    timerId: string,
    timerName: string,
    durationMs: number,
    isError: boolean,
    error?: string
  ): Promise<TimerTickResult | null> {
    if (!this.shouldTrace(isError)) return null;

    const traceId = `ops-timer-${timerId}-${Date.now()}`;
    const result: TimerTickResult = {
      traceId,
      timerId,
      timerName,
      durationMs,
      isError,
      error,
    };

    if (isError) {
      logger.warn('Timer tick error', { traceId, timerId, timerName, error });
    } else {
      logger.debug('Traced timer tick', { traceId, timerId, timerName, durationMs });
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampSampleRate(rate: number): number {
  if (rate < MIN_SAMPLE_RATE) return MIN_SAMPLE_RATE;
  if (rate > MAX_SAMPLE_RATE) return MAX_SAMPLE_RATE;
  return rate;
}
