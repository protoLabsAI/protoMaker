import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FrictionTrackerService,
  type FrictionTrackerDependencies,
} from '@/services/friction-tracker-service.js';

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
    it('starts at zero for unseen patterns', () => {
      expect(service.getCount('test_failure')).toBe(0);
    });

    it('increments the counter on each recordFailure call', async () => {
      await service.recordFailure('test_failure');
      expect(service.getCount('test_failure')).toBe(1);

      await service.recordFailure('test_failure');
      expect(service.getCount('test_failure')).toBe(2);
    });

    it('tracks different patterns independently', async () => {
      await service.recordFailure('test_failure');
      await service.recordFailure('test_failure');
      await service.recordFailure('merge_conflict');

      expect(service.getCount('test_failure')).toBe(2);
      expect(service.getCount('merge_conflict')).toBe(1);
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
  // Excluded patterns — transient/infrastructure conditions
  // -------------------------------------------------------------------------

  describe('excluded patterns', () => {
    it('ignores "rate_limit" — transient API throttling has dedicated retry logic', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('rate_limit');
      }
      expect(service.getCount('rate_limit')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('ignores "transient" — network/timeout errors have automatic retry', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailure('transient');
      }
      expect(service.getCount('transient')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('ignores "rate_limit" in recordFailureWithContext too', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailureWithContext('rate_limit', { featureId: `f-${i}` });
      }
      expect(service.getCount('rate_limit')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('ignores "transient" in recordFailureWithContext too', async () => {
      for (let i = 0; i < 5; i++) {
        await service.recordFailureWithContext('transient', { featureId: `f-${i}` });
      }
      expect(service.getCount('transient')).toBe(0);
      expect(deps.featureLoader.create).not.toHaveBeenCalled();
    });

    it('still tracks non-excluded patterns normally', async () => {
      for (let i = 0; i < 3; i++) {
        await service.recordFailure('tool_error');
      }
      expect(service.getCount('tool_error')).toBe(3);
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
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
      expect(service.isRecentlyFiled('tool_error')).toBe(true);
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
        title: 'System Improvement: recurring tool_error failures',
      } as never);

      for (let i = 0; i < 3; i++) {
        await service.recordFailure('tool_error');
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

      await service.recordFailure('test_failure');
      expect(service.getCount('test_failure')).toBe(1);

      // Move past window
      vi.setSystemTime(startTime + SEVEN_DAYS_MS + 1);
      expect(service.getCount('test_failure')).toBe(0);
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
      expect(service.isRecentlyFiled('validation')).toBe(false);
    });
  });
});
