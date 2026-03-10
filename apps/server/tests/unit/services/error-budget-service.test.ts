/**
 * Unit tests for ErrorBudgetService
 *
 * Covers:
 * - recordMerge() increments total and (optionally) failed counts
 * - markCiFailure() marks existing record as failed or creates a new one
 * - getFailRate() returns correct ratio within rolling window
 * - isExhausted() returns true when fail rate >= threshold
 * - getState() returns a complete snapshot
 * - Rolling window excludes old records
 * - Persistence round-trip (write => read)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock logger before imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { ErrorBudgetService } from '@/services/error-budget-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temp directory for each test suite to isolate disk state. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'error-budget-test-'));
}

function removeTmpDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBudgetService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  // ──────────────────────────── Initial state ────────────────────────────

  it('returns failRate=0 when no records exist', () => {
    const svc = new ErrorBudgetService(tmpDir);
    expect(svc.getFailRate()).toBe(0);
  });

  it('isExhausted() returns false when no records exist', () => {
    const svc = new ErrorBudgetService(tmpDir);
    expect(svc.isExhausted()).toBe(false);
  });

  it('getState() returns correct defaults when empty', () => {
    const svc = new ErrorBudgetService(tmpDir);
    const state = svc.getState();
    expect(state.totalMerges).toBe(0);
    expect(state.failedMerges).toBe(0);
    expect(state.failRate).toBe(0);
    expect(state.exhausted).toBe(false);
    expect(state.windowDays).toBe(7);
    expect(state.threshold).toBe(0.2);
  });

  // ──────────────────────────── recordMerge ────────────────────────────

  it('recordMerge(false) increments total but not failed', () => {
    const svc = new ErrorBudgetService(tmpDir);
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    const state = svc.getState();
    expect(state.totalMerges).toBe(2);
    expect(state.failedMerges).toBe(0);
    expect(state.failRate).toBe(0);
  });

  it('recordMerge(true) counts as both total and failed', () => {
    const svc = new ErrorBudgetService(tmpDir);
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', true);
    const state = svc.getState();
    expect(state.totalMerges).toBe(2);
    expect(state.failedMerges).toBe(1);
    expect(state.failRate).toBeCloseTo(0.5);
  });

  // ──────────────────────────── markCiFailure ────────────────────────────

  it('markCiFailure() flips an existing non-failed record to failed', () => {
    const svc = new ErrorBudgetService(tmpDir);
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.markCiFailure('f1');
    const state = svc.getState();
    expect(state.failedMerges).toBe(1);
    expect(state.failRate).toBeCloseTo(0.5);
  });

  it('markCiFailure() does not double-count an already-failed record', () => {
    const svc = new ErrorBudgetService(tmpDir);
    svc.recordMerge('f1', true);
    svc.markCiFailure('f1');
    const state = svc.getState();
    expect(state.failedMerges).toBe(1);
  });

  it('markCiFailure() creates a new record when no prior merge exists in window', () => {
    const svc = new ErrorBudgetService(tmpDir);
    // No prior merge for f99
    svc.markCiFailure('f99');
    const state = svc.getState();
    expect(state.totalMerges).toBe(1);
    expect(state.failedMerges).toBe(1);
  });

  // ──────────────────────────── isExhausted / threshold ────────────────────────────

  it('isExhausted() returns false when fail rate is below threshold', () => {
    const svc = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.recordMerge('f3', false);
    svc.recordMerge('f4', false);
    svc.recordMerge('f5', false);
    // 0/5 = 0% < 20%
    expect(svc.isExhausted()).toBe(false);
  });

  it('isExhausted() returns true when fail rate meets threshold', () => {
    const svc = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    // 1/5 = 20% >= 20%
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.recordMerge('f3', false);
    svc.recordMerge('f4', false);
    svc.recordMerge('f5', true);
    expect(svc.isExhausted()).toBe(true);
  });

  it('isExhausted() returns true when fail rate exceeds threshold', () => {
    const svc = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    // 2/4 = 50% > 20%
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.recordMerge('f3', true);
    svc.recordMerge('f4', true);
    expect(svc.isExhausted()).toBe(true);
  });

  it('custom threshold is respected', () => {
    const svc = new ErrorBudgetService(tmpDir, { threshold: 0.5 });
    svc.recordMerge('f1', true);
    svc.recordMerge('f2', false);
    // 1/2 = 50% — exactly at threshold
    expect(svc.isExhausted()).toBe(true);
  });

  // ──────────────────────────── Rolling window ────────────────────────────

  it('records outside the rolling window are excluded from fail rate', () => {
    // Use a 1-day window
    const svc = new ErrorBudgetService(tmpDir, { windowDays: 1, threshold: 0.2 });

    // Manually write an old record to disk (8 days ago)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const budgetPath = path.join(tmpDir, '.automaker', 'metrics', 'error-budget.json');
    fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
    fs.writeFileSync(
      budgetPath,
      JSON.stringify({
        version: 1,
        updatedAt: eightDaysAgo,
        records: [
          { featureId: 'old-f1', mergedAt: eightDaysAgo, failedCi: true },
          { featureId: 'old-f2', mergedAt: eightDaysAgo, failedCi: true },
          { featureId: 'old-f3', mergedAt: eightDaysAgo, failedCi: true },
        ],
      }),
      'utf-8'
    );

    // Old records (all failures) should be excluded — budget is not exhausted
    expect(svc.getFailRate()).toBe(0);
    expect(svc.isExhausted()).toBe(false);
  });

  it('mixes old and recent records, only counting recent ones', () => {
    const svc = new ErrorBudgetService(tmpDir, { windowDays: 7, threshold: 0.2 });

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const budgetPath = path.join(tmpDir, '.automaker', 'metrics', 'error-budget.json');
    fs.mkdirSync(path.dirname(budgetPath), { recursive: true });
    fs.writeFileSync(
      budgetPath,
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        records: [
          // Old failures — should be excluded
          { featureId: 'old-f1', mergedAt: eightDaysAgo, failedCi: true },
          { featureId: 'old-f2', mergedAt: eightDaysAgo, failedCi: true },
        ],
      }),
      'utf-8'
    );

    // Add a recent successful merge — fail rate should be 0/1 = 0%
    svc.recordMerge('recent-f1', false);
    expect(svc.getFailRate()).toBe(0);
    expect(svc.isExhausted()).toBe(false);
  });

  // ──────────────────────────── Persistence ────────────────────────────

  it('persists state to disk and reads it back correctly', () => {
    const svc1 = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    svc1.recordMerge('f1', false);
    svc1.recordMerge('f2', true);

    // Create a new instance reading from the same directory
    const svc2 = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    const state = svc2.getState();
    expect(state.totalMerges).toBe(2);
    expect(state.failedMerges).toBe(1);
    expect(state.failRate).toBeCloseTo(0.5);
  });

  it('persists to the correct path (.automaker/metrics/error-budget.json)', () => {
    const svc = new ErrorBudgetService(tmpDir);
    svc.recordMerge('f1', false);
    const expectedPath = path.join(tmpDir, '.automaker', 'metrics', 'error-budget.json');
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  // ──────────────────────────── getState snapshot ────────────────────────────

  it('getState() returns exhausted=true when budget is exhausted', () => {
    const svc = new ErrorBudgetService(tmpDir, { threshold: 0.2 });
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.recordMerge('f3', false);
    svc.recordMerge('f4', false);
    svc.recordMerge('f5', true); // 1/5 = 20%
    const state = svc.getState();
    expect(state.exhausted).toBe(true);
    expect(state.failRate).toBeCloseTo(0.2);
  });

  it('getState() reflects custom windowDays option', () => {
    const svc = new ErrorBudgetService(tmpDir, { windowDays: 14 });
    const state = svc.getState();
    expect(state.windowDays).toBe(14);
  });
});
