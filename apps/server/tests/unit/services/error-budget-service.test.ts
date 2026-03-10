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
 * - error_budget:exhausted event emitted when burn rate >= 1.0
 * - error_budget:recovered event emitted when burn rate drops below 0.8
 * - AutoModeCoordinator respects errorBudgetAutoFreeze setting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

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
import { AutoModeCoordinator } from '@/services/auto-mode/auto-mode-coordinator.js';

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

  // ──────────────────────────── Error budget events ────────────────────────────

  it('emits error_budget:exhausted when burn rate reaches 1.0 (all merges failed)', () => {
    // Use threshold=0.2 for isExhausted() but the NEW exhausted event fires at 1.0 burn rate
    const svc = new ErrorBudgetService(tmpDir);
    const exhaustedListener = vi.fn();
    svc.on('error_budget:exhausted', exhaustedListener);

    // Drive all merges to failed → failRate = 1.0
    svc.recordMerge('f1', true);
    svc.recordMerge('f2', true);

    expect(exhaustedListener).toHaveBeenCalledTimes(1);
    const payload = exhaustedListener.mock.calls[0][0] as {
      projectPath: string;
      failRate: number;
      threshold: number;
    };
    expect(payload.projectPath).toBe(tmpDir);
    expect(payload.failRate).toBe(1);
    expect(payload.threshold).toBe(1.0);
  });

  it('does not emit error_budget:exhausted twice without recovery in between', () => {
    const svc = new ErrorBudgetService(tmpDir);
    const exhaustedListener = vi.fn();
    svc.on('error_budget:exhausted', exhaustedListener);

    // First exhaustion: all merges fail
    svc.recordMerge('f1', true);
    svc.recordMerge('f2', true);
    // Still at 100% — second call should NOT fire again
    svc.recordMerge('f3', true);

    expect(exhaustedListener).toHaveBeenCalledTimes(1);
  });

  it('emits error_budget:recovered when burn rate drops below 0.8 after exhaustion', () => {
    const svc = new ErrorBudgetService(tmpDir);
    const exhaustedListener = vi.fn();
    const recoveredListener = vi.fn();
    svc.on('error_budget:exhausted', exhaustedListener);
    svc.on('error_budget:recovered', recoveredListener);

    // Drive to 100% failure → exhausted
    svc.recordMerge('f1', true);
    svc.recordMerge('f2', true);
    expect(exhaustedListener).toHaveBeenCalledTimes(1);
    expect(recoveredListener).not.toHaveBeenCalled();

    // Add many successful merges to bring failRate below 0.8
    // 2 failed / 12 total = 16.7% < 80%
    for (let i = 3; i <= 12; i++) {
      svc.recordMerge(`f${i}`, false);
    }

    expect(recoveredListener).toHaveBeenCalledTimes(1);
    const payload = recoveredListener.mock.calls[0][0] as {
      projectPath: string;
      failRate: number;
    };
    expect(payload.projectPath).toBe(tmpDir);
    expect(payload.failRate).toBeLessThan(0.8);
  });

  it('does not emit error_budget:recovered if never exhausted', () => {
    const svc = new ErrorBudgetService(tmpDir);
    const exhaustedListener = vi.fn();
    const recoveredListener = vi.fn();
    svc.on('error_budget:exhausted', exhaustedListener);
    svc.on('error_budget:recovered', recoveredListener);

    // Start with successful merges so failRate never reaches 1.0
    // 1 failed / 4 total = 25% — below 100% exhaustion threshold
    svc.recordMerge('f1', false);
    svc.recordMerge('f2', false);
    svc.recordMerge('f3', false);
    svc.recordMerge('f4', true);

    // Budget was never fully exhausted (failRate stayed below 1.0)
    expect(exhaustedListener).not.toHaveBeenCalled();
    expect(recoveredListener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AutoModeCoordinator — errorBudgetAutoFreeze behavior
// ---------------------------------------------------------------------------

describe('AutoModeCoordinator', () => {
  it('sets pickup frozen when error_budget:exhausted is received (autoFreeze default=true)', async () => {
    const emitter = new EventEmitter() as unknown as import('@/lib/events.js').EventEmitter;
    const coordinator = new AutoModeCoordinator(emitter, null);

    expect(coordinator.isPickupFrozen()).toBe(false);

    emitter.emit('error_budget:exhausted', { projectPath: '/tmp/test', failRate: 1.0 });

    // Allow promise microtasks to settle
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(coordinator.isPickupFrozen()).toBe(true);
  });

  it('clears pickup frozen when error_budget:recovered is received', async () => {
    const emitter = new EventEmitter() as unknown as import('@/lib/events.js').EventEmitter;
    const coordinator = new AutoModeCoordinator(emitter, null);

    emitter.emit('error_budget:exhausted', { projectPath: '/tmp/test', failRate: 1.0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(coordinator.isPickupFrozen()).toBe(true);

    emitter.emit('error_budget:recovered', { projectPath: '/tmp/test', failRate: 0.3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(coordinator.isPickupFrozen()).toBe(false);
  });

  it('skips freeze when errorBudgetAutoFreeze=false in settings', async () => {
    const emitter = new EventEmitter() as unknown as import('@/lib/events.js').EventEmitter;

    // Mock settings service with errorBudgetAutoFreeze=false
    const mockSettingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        projects: [{ path: '/tmp/project', id: 'proj-1' }],
      }),
      getProjectSettings: vi.fn().mockResolvedValue({
        workflow: { errorBudgetAutoFreeze: false },
      }),
    } as unknown as import('@/services/settings-service.js').SettingsService;

    const coordinator = new AutoModeCoordinator(emitter, mockSettingsService);

    emitter.emit('error_budget:exhausted', { projectPath: '/tmp/test', failRate: 1.0 });

    // Allow async settings read to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should NOT be frozen because setting is disabled
    expect(coordinator.isPickupFrozen()).toBe(false);
  });
});
