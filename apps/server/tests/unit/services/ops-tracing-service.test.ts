/**
 * Unit tests for OpsTracingService
 *
 * Covers:
 * - Graceful degradation when Langfuse is not configured
 * - Sample rate clamping and probabilistic sampling
 * - Error traces always bypass sampling
 * - Maintenance sweep tracing with aggregation
 * - Webhook delivery tracing (success and failure)
 * - Timer tick tracing with sample gating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before any imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { OpsTracingService } from '@/services/ops-tracing-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save and restore env vars across tests */
function withLangfuseEnv(publicKey: string, secretKey: string): () => void {
  const origPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const origSecret = process.env.LANGFUSE_SECRET_KEY;
  process.env.LANGFUSE_PUBLIC_KEY = publicKey;
  process.env.LANGFUSE_SECRET_KEY = secretKey;
  return () => {
    if (origPublic === undefined) delete process.env.LANGFUSE_PUBLIC_KEY;
    else process.env.LANGFUSE_PUBLIC_KEY = origPublic;
    if (origSecret === undefined) delete process.env.LANGFUSE_SECRET_KEY;
    else process.env.LANGFUSE_SECRET_KEY = origSecret;
  };
}

// ---------------------------------------------------------------------------
// Tests: Langfuse not configured
// ---------------------------------------------------------------------------

describe('OpsTracingService (Langfuse unavailable)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withLangfuseEnv('', '');
  });

  afterEach(() => {
    restore();
  });

  it('reports unavailable when env vars are empty', () => {
    const svc = new OpsTracingService();
    expect(svc.isAvailable()).toBe(false);
  });

  it('shouldTrace returns false even for errors', () => {
    const svc = new OpsTracingService();
    expect(svc.shouldTrace(true)).toBe(false);
    expect(svc.shouldTrace(false)).toBe(false);
  });

  it('traceMaintenanceSweep returns null', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceMaintenanceSweep('critical', [], 100);
    expect(result).toBeNull();
  });

  it('traceWebhookDelivery returns null', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceWebhookDelivery('d1', 'github', 'push', 50, true);
    expect(result).toBeNull();
  });

  it('traceTimerTick returns null', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceTimerTick('t1', 'health-check', 30, false);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Langfuse configured
// ---------------------------------------------------------------------------

describe('OpsTracingService (Langfuse available)', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withLangfuseEnv('pk-lf-test', 'sk-lf-test');
  });

  afterEach(() => {
    restore();
  });

  it('reports available when env vars are set', () => {
    const svc = new OpsTracingService();
    expect(svc.isAvailable()).toBe(true);
  });

  it('uses default sample rate of 1%', () => {
    const svc = new OpsTracingService();
    expect(svc.getSampleRate()).toBe(0.01);
  });

  it('accepts custom sample rate', () => {
    const svc = new OpsTracingService({ sampleRate: 0.5 });
    expect(svc.getSampleRate()).toBe(0.5);
  });

  it('clamps sample rate to minimum', () => {
    const svc = new OpsTracingService({ sampleRate: 0 });
    expect(svc.getSampleRate()).toBe(0.001);
  });

  it('clamps sample rate to maximum', () => {
    const svc = new OpsTracingService({ sampleRate: 5.0 });
    expect(svc.getSampleRate()).toBe(1.0);
  });

  it('shouldTrace always returns true for errors', () => {
    const svc = new OpsTracingService({ sampleRate: 0.001 });
    // With sample rate at minimum, normal ticks are very unlikely to be sampled.
    // But errors must always be traced.
    expect(svc.shouldTrace(true)).toBe(true);
  });

  it('shouldTrace returns true at 100% sample rate for non-errors', () => {
    const svc = new OpsTracingService({ sampleRate: 1.0 });
    // At 100% sample rate, all ticks should be traced
    expect(svc.shouldTrace(false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Maintenance sweep tracing
// ---------------------------------------------------------------------------

describe('OpsTracingService.traceMaintenanceSweep', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withLangfuseEnv('pk-lf-test', 'sk-lf-test');
  });

  afterEach(() => {
    restore();
  });

  it('returns a result with aggregated totals', async () => {
    const svc = new OpsTracingService();
    const checks = [
      { name: 'stale-features', durationMs: 50, issuesFound: 2, fixesApplied: 1 },
      { name: 'orphaned-worktrees', durationMs: 30, issuesFound: 0, fixesApplied: 0 },
      { name: 'disk-space', durationMs: 10, issuesFound: 1, fixesApplied: 0 },
    ];
    const result = await svc.traceMaintenanceSweep('full', checks, 90);

    expect(result).not.toBeNull();
    expect(result!.traceId).toMatch(/^ops-sweep-full-\d+$/);
    expect(result!.tier).toBe('full');
    expect(result!.checkCount).toBe(3);
    expect(result!.totalDurationMs).toBe(90);
    expect(result!.totalIssues).toBe(3);
    expect(result!.totalFixes).toBe(1);
  });

  it('handles empty check list', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceMaintenanceSweep('critical', [], 5);

    expect(result).not.toBeNull();
    expect(result!.checkCount).toBe(0);
    expect(result!.totalIssues).toBe(0);
    expect(result!.totalFixes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Webhook delivery tracing
// ---------------------------------------------------------------------------

describe('OpsTracingService.traceWebhookDelivery', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withLangfuseEnv('pk-lf-test', 'sk-lf-test');
  });

  afterEach(() => {
    restore();
  });

  it('traces a successful delivery', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceWebhookDelivery('d-abc', 'github', 'push', 120, true);

    expect(result).not.toBeNull();
    expect(result!.traceId).toBe('ops-webhook-d-abc');
    expect(result!.deliveryId).toBe('d-abc');
    expect(result!.source).toBe('github');
    expect(result!.eventType).toBe('push');
    expect(result!.durationMs).toBe(120);
    expect(result!.success).toBe(true);
    expect(result!.error).toBeUndefined();
  });

  it('traces a failed delivery with error', async () => {
    const svc = new OpsTracingService();
    const result = await svc.traceWebhookDelivery(
      'd-fail',
      'discord',
      'message',
      500,
      false,
      'Connection refused'
    );

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('Connection refused');
  });
});

// ---------------------------------------------------------------------------
// Tests: Timer tick tracing
// ---------------------------------------------------------------------------

describe('OpsTracingService.traceTimerTick', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = withLangfuseEnv('pk-lf-test', 'sk-lf-test');
  });

  afterEach(() => {
    restore();
  });

  it('traces error ticks regardless of sample rate', async () => {
    // Use the minimum sample rate so normal ticks are very unlikely to be traced.
    const svc = new OpsTracingService({ sampleRate: 0.001 });
    const result = await svc.traceTimerTick('t1', 'health-check', 30, true, 'OOM detected');

    expect(result).not.toBeNull();
    expect(result!.traceId).toMatch(/^ops-timer-t1-\d+$/);
    expect(result!.timerId).toBe('t1');
    expect(result!.timerName).toBe('health-check');
    expect(result!.durationMs).toBe(30);
    expect(result!.isError).toBe(true);
    expect(result!.error).toBe('OOM detected');
  });

  it('traces all ticks at 100% sample rate', async () => {
    const svc = new OpsTracingService({ sampleRate: 1.0 });
    const result = await svc.traceTimerTick('t2', 'board-janitor', 15, false);

    expect(result).not.toBeNull();
    expect(result!.isError).toBe(false);
    expect(result!.error).toBeUndefined();
  });

  it('returns null for non-error ticks when sampling rejects', async () => {
    // Force Math.random to return a value above sample rate
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    const svc = new OpsTracingService({ sampleRate: 0.01 });
    const result = await svc.traceTimerTick('t3', 'stale-check', 20, false);

    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('traces non-error ticks when sampling accepts', async () => {
    // Force Math.random to return a value below sample rate
    vi.spyOn(Math, 'random').mockReturnValue(0.005);

    const svc = new OpsTracingService({ sampleRate: 0.01 });
    const result = await svc.traceTimerTick('t4', 'disk-watch', 10, false);

    expect(result).not.toBeNull();
    expect(result!.isError).toBe(false);
    vi.restoreAllMocks();
  });
});
