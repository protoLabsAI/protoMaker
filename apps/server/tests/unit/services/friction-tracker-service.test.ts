import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  } as unknown as FrictionTrackerDependencies['featureLoader'];

  const avaChannelService = {
    postMessage: vi.fn().mockResolvedValue({ id: 'msg-001' }),
  } as unknown as FrictionTrackerDependencies['avaChannelService'];

  return {
    featureLoader,
    avaChannelService,
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

    it('broadcasts friction_report to ava channel on filing', async () => {
      for (let i = 0; i < 3; i++) {
        await service.recordFailure('merge_conflict');
      }

      expect(deps.avaChannelService.postMessage).toHaveBeenCalledOnce();
      const [content, source] = vi.mocked(deps.avaChannelService.postMessage).mock.calls[0];
      expect(source).toBe('system');
      expect(content).toContain('[friction_report]');

      const json = content.replace('[friction_report]', '').trim();
      const report: FrictionReport = JSON.parse(json);
      expect(report.pattern).toBe('merge_conflict');
      expect(report.instanceId).toBe('instance-test');
      expect(report.featureId).toBe('feature-abc123');
      expect(report.filedAt).toBeTruthy();
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

    it('continues without throwing when avaChannelService.postMessage fails', async () => {
      vi.mocked(deps.avaChannelService.postMessage).mockRejectedValueOnce(
        new Error('discord down')
      );

      // Should not throw
      for (let i = 0; i < 3; i++) {
        await service.recordFailure('quota');
      }

      // Feature was still filed (create was called)
      expect(deps.featureLoader.create).toHaveBeenCalledOnce();
    });
  });
});
