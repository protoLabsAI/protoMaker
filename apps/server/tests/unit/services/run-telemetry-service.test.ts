import { describe, it, expect } from 'vitest';
import { summarizeRunTelemetry } from '@/services/run-telemetry-service.js';
import type { Feature, ExecutionRecord } from '@protolabsai/types';

function rec(success: boolean, over: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: Math.random().toString(36),
    startedAt: '2026-05-27T00:00:00Z',
    model: 'protolabs/smart',
    success,
    trigger: 'auto',
    ...over,
  } as ExecutionRecord;
}

function feat(over: Partial<Feature> = {}): Feature {
  return {
    id: 'f1',
    category: 'feature',
    description: '',
    status: 'in_progress',
    ...over,
  } as unknown as Feature;
}

describe('summarizeRunTelemetry', () => {
  it('returns no-data with no history', () => {
    expect(summarizeRunTelemetry(feat()).signal).toBe('no-data');
  });

  it('detects looping when the same error repeats', () => {
    const t = summarizeRunTelemetry(
      feat({
        executionHistory: [
          // Same failure twice (differing only in a request id / digits) — the
          // digit-normalizing key collapses them, which is the looping signal.
          rec(false, { error: 'API Error: 401 key not allowed to access model (req 12)' }),
          rec(false, { error: 'API Error: 401 key not allowed to access model (req 98)' }),
        ],
      })
    );
    expect(t.signal).toBe('looping');
    expect(t.repeatedError?.count).toBe(2);
    expect(t.hint).toMatch(/same error/i);
  });

  it('flags escalating on multiple distinct failures', () => {
    const t = summarizeRunTelemetry(
      feat({
        executionHistory: [
          rec(false, { error: 'merge conflict in foo.ts' }),
          rec(false, { error: 'typecheck failed: TS2322' }),
        ],
      })
    );
    expect(t.signal).toBe('escalating');
    expect(t.failures).toBe(2);
    expect(t.lastError).toMatch(/typecheck/);
  });

  it('flags escalating on remediation cycles even with one failure', () => {
    const t = summarizeRunTelemetry(
      feat({
        executionHistory: [rec(false, { error: 'x' })],
        ciRemediationCount: 1,
        reviewRemediationCount: 1,
      } as Partial<Feature>)
    );
    expect(t.signal).toBe('escalating');
    expect(t.remediationCycles).toBe(2);
  });

  it('returns ok for a single clean/in-progress run', () => {
    const t = summarizeRunTelemetry(
      feat({ executionHistory: [rec(true, { turnCount: 5, costUsd: 0.1 })] })
    );
    expect(t.signal).toBe('ok');
    expect(t.attempts).toBe(1);
    expect(t.failures).toBe(0);
  });

  it('aggregates cost + turns across runs', () => {
    const t = summarizeRunTelemetry(
      feat({
        executionHistory: [
          rec(true, { costUsd: 0.12, turnCount: 3 }),
          rec(true, { costUsd: 0.08, turnCount: 4 }),
        ],
      })
    );
    expect(t.totalCostUsd).toBeCloseTo(0.2, 4);
    expect(t.totalTurns).toBe(7);
  });
});
