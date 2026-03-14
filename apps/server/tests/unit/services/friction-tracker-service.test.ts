import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FrictionTrackerService,
  type FrictionTrackerDependencies,
} from '@/services/friction-tracker-service.js';
import type { FrictionReport } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(
  overrides: Partial<FrictionTrackerDependencies> = {}
): FrictionTrackerDependencies {
  const featureLoader = {
    create: vi.fn().mockResolvedValue({ id: 'feature-abc123' }),
    // Default: no existing feature found — allows filing to proceed
    findByTitle: vi.fn().mockResolvedValue(null),
  } as unknown as FrictionTrackerDependencies['featureLoader'];

  return {
    featureLoader,
    projectPath: '/test/project',
    instanceId: 'instance-test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FrictionTrackerService', () => {
  let deps: FrictionTrackerDependencies;
  let service: FrictionTrackerService;

  beforeEach(() => {
    deps = makeDeps();
    service = new FrictionTrackerService(deps);
  });

  // -------------------------------------------------------------------------
  // Counter behavior
  // -------------------------------------------------------------------------

  describe('counter tracking', () => {
    it('starts at zero for unknown patterns', () => {
      expect(service.getCount('rate_limit')).toBe(0);
    });

    it('increments the counter on each recordFailure call', async () => {
      await service.recordFailure('rate_limit');
      expect(service.getCount('rate_limit')).toBe(1);

      await service.recordFailure('rate_limit');
      expect(service.getCount('rate_limit')).toBe(2);
    });

    it('tracks different patterns independently', async () => {
      await service.recordFailure('rate_limit');
      await service.recordFailure('rate_limit');
      await service.recordFailure('timeout');

      expect(service.getCount('rate_limit')).toBe(2);
      expect(service.getCount('timeout')).toBe(1);
    });

    it('ignores empty-string patterns', async () => {
      await service.recordFailure('');
      expect(service.getCount('')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('ignores "unknown" pattern — catch-all should not trigger System Improvement', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('unknown');
      }
      expect(service.getCount('unknown')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Threshold — filing System Improvement feature
  // -------------------------------------------------------------------------

  describe('threshold behavior', () => {
    it('does NOT file before reaching 3 occurrences', async () => {
      await service.recordFailure('test_failure');
      await service.recordFailure('test_failure');

      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('files a System Improvement feature on the 3rd occurrence', async () => {
      await service.recordFailure('test_failure');
      await service.recordFailure('test_failure');
      await service.recordFailure('test_failure');

      expect(deps.featureLoader.create).toHaveBeenCalledOnce();

      const [projectPath, data] = vi.mocked(deps.featureLoader.create).mock.calls[0];
      expect(projectPath).toBe('/test/project');
      expect(data).toMatchObject({
        complexity: 'medium',
        systemImprovement: true,
        status: 'backlog',
      });
      expect(String(data.title)).toContain('test_failure');
    });

    it('does NOT file again on subsequent occurrences after threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('test_failure');
      }

      // Only one filing despite 5 occurrences
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });

    it('derives feature title from the pattern', async () => {
      for (let i = 0; i < 3; i++) {
        await service.recordFailure('authentication');
      }

      const data = vi.mocked(deps.featureLoader.create).mock.calls[0][1];
      expect(String(data.title)).toContain('authentication');
    });
  });

  // -------------------------------------------------------------------------
  // Peer de-duplication
  // -------------------------------------------------------------------------

  describe('peer de-duplication', () => {
    it('returns false for isPeerRecentlyFiled when no report received', () => {
      expect(service.isPeerRecentlyFiled('rate_limit')).toBe(false);
    });

    it('returns true after handlePeerReport with recent timestamp', () => {
      const report: FrictionReport = {
        pattern: 'rate_limit',
        filedAt: new Date().toISOString(),
        featureId: 'feature-peer-001',
        instanceId: 'peer-instance',
      };

      service.handlePeerReport(report);

      expect(service.isPeerRecentlyFiled('rate_limit')).toBe(true);
    });

    it('returns false after handlePeerReport with old timestamp (>24h)', () => {
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const report: FrictionReport = {
        pattern: 'rate_limit',
        filedAt: oldTimestamp,
        featureId: 'feature-peer-001',
        instanceId: 'peer-instance',
      };

      service.handlePeerReport(report);

      expect(service.isPeerRecentlyFiled('rate_limit')).toBe(false);
    });

    it('skips filing when a peer recently filed the same pattern', async () => {
      // Simulate a peer report arriving before the threshold
      const report: FrictionReport = {
        pattern: 'dependency',
        filedAt: new Date().toISOString(),
        featureId: 'feature-peer-002',
        instanceId: 'peer-instance',
      };
      service.handlePeerReport(report);

      // Now hit the threshold — should be suppressed
      for (let i = 0; i < 3; i++) {
        await service.recordFailure('dependency');
      }

      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('ignores peer reports with invalid filedAt', () => {
      const report: FrictionReport = {
        pattern: 'unknown',
        filedAt: 'not-a-date',
        featureId: 'feature-peer-003',
        instanceId: 'peer-instance',
      };

      // Should not throw
      service.handlePeerReport(report);

      // Should not mark as recently filed
      expect(service.isPeerRecentlyFiled('unknown')).toBe(false);
    });

    it('keeps the most recent filing timestamp when multiple peer reports arrive', () => {
      const olderTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
      const newerTime = new Date().toISOString();

      service.handlePeerReport({
        pattern: 'transient',
        filedAt: olderTime,
        featureId: 'f1',
        instanceId: 'peer-a',
      });
      service.handlePeerReport({
        pattern: 'transient',
        filedAt: newerTime,
        featureId: 'f2',
        instanceId: 'peer-b',
      });

      // Newer report keeps it as "recently filed"
      expect(service.isPeerRecentlyFiled('transient')).toBe(true);
    });

    it('does not suppress filing when peer report has expired', async () => {
      const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      service.handlePeerReport({
        pattern: 'tool_error',
        filedAt: expiredTime,
        featureId: 'f-old',
        instanceId: 'peer-old',
      });

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('tool_error');
      }

      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Durable de-duplication (feature store check)
  // -------------------------------------------------------------------------

  describe('durable dedup (feature store check)', () => {
    it('skips filing when a non-done open feature already exists for the pattern', async () => {
      vi.mocked(deps.featureLoader.findByTitle).mockResolvedValue({
        id: 'feature-existing-001',
        status: 'in_progress',
        title: 'System Improvement: recurring tool_error failures',
      } as never);

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('tool_error');
      }

      expect(deps.featureLoader.create).not.toHaveBeenCalled();
      // Should populate local dedup guard
      expect(service.isPeerRecentlyFiled('tool_error')).toBe(true);
    });

    it('skips filing when existing feature is in backlog', async () => {
      vi.mocked(deps.featureLoader.findByTitle).mockResolvedValue({
        id: 'feature-existing-002',
        status: 'backlog',
        title: 'System Improvement: recurring test_failure failures',
      } as never);

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('test_failure');
      }

      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('files a new feature when the existing one is done', async () => {
      vi.mocked(deps.featureLoader.findByTitle).mockResolvedValue({
        id: 'feature-old-done',
        status: 'done',
        title: 'System Improvement: recurring rate_limit failures',
      } as never);

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('rate_limit');
      }

      // Old feature is done → file a fresh one
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });

    it('files a new feature when the existing one is interrupted', async () => {
      vi.mocked(deps.featureLoader.findByTitle).mockResolvedValue({
        id: 'feature-interrupted',
        status: 'interrupted',
        title: 'System Improvement: recurring merge_conflict failures',
      } as never);

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('merge_conflict');
      }

      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });

    it('falls through and files when findByTitle throws', async () => {
      vi.mocked(deps.featureLoader.findByTitle).mockRejectedValueOnce(new Error('FS error'));

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('dependency');
      }

      // Fallback: file anyway — better a duplicate than a missed ticket
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Sliding-window counter behavior
  // -------------------------------------------------------------------------

  describe('sliding-window counters', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resets counter when the window has expired before a new failure', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      // Two failures at t=0
      await service.recordFailure('tool_error');
      await service.recordFailure('tool_error');
      expect(service.getCount('tool_error')).toBe(2);

      // Advance time beyond the 7-day window
      vi.setSystemTime(startTime + SEVEN_DAYS_MS + 1);

      // Third failure — window is expired, counter resets to 1
      await service.recordFailure('tool_error');
      expect(service.getCount('tool_error')).toBe(1);

      // Should NOT have filed a feature (only 1 occurrence in the new window)
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('does NOT reset counter when failures are within the 7-day window', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      await service.recordFailure('tool_error');
      await service.recordFailure('tool_error');

      // Advance to 6 days (still within window)
      vi.setSystemTime(startTime + 6 * 24 * 60 * 60 * 1000);

      await service.recordFailure('tool_error');

      // All 3 are within the window → should file
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });

    it('getCount returns 0 for a pattern whose window has expired', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      await service.recordFailure('rate_limit');
      expect(service.getCount('rate_limit')).toBe(1);

      // Move past window
      vi.setSystemTime(startTime + SEVEN_DAYS_MS + 1);
      expect(service.getCount('rate_limit')).toBe(0);
    });

    it('starts a fresh window after expiry and counts from 1', async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      // Saturate counter just below threshold
      await service.recordFailure('dependency');
      await service.recordFailure('dependency');
      expect(service.getCount('dependency')).toBe(2);

      // Expire the window
      vi.setSystemTime(startTime + SEVEN_DAYS_MS + 1);

      // New failure — fresh window
      await service.recordFailure('dependency');
      expect(service.getCount('dependency')).toBe(1);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();

      // Two more in the new window → reaches threshold
      await service.recordFailure('dependency');
      await service.recordFailure('dependency');
      expect(service.getCount('dependency')).toBe(3);
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('rolls back the dedup guard when featureLoader.create fails', async () => {
      vi.mocked(deps.featureLoader.create).mockRejectedValueOnce(new Error('disk full'));

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('validation');
      }

      // The dedup guard should be rolled back so the next attempt can retry
      expect(service.isPeerRecentlyFiled('validation')).toBe(false);
    });
  });
});
