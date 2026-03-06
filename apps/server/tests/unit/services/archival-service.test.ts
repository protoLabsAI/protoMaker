/**
 * ArchivalService tests — Baseline documentation of deletion behavior.
 *
 * These tests verify that ArchivalService deletes the entire feature directory
 * (including agent-output.md, handoffs, and feature.json) after the retention
 * window expires. This documents data loss as a known, intentional behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ArchivalService } from '@/services/archival-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { LedgerService } from '@/services/ledger-service.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { EventEmitter } from '@/lib/events.js';

describe('ArchivalService', () => {
  let archivalService: ArchivalService;
  let mockFeatureLoader: {
    getAll: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockLedgerService: { recordFeatureCompletion: ReturnType<typeof vi.fn> };
  let mockSettingsService: { getGlobalSettings: ReturnType<typeof vi.fn> };
  let mockEvents: {
    emit: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };

  const projectPath = '/test/project';
  const retentionHours = 2;
  const retentionMs = retentionHours * 60 * 60 * 1000;

  function makeExpiredCompletedAt(extraMs = 1000): string {
    return new Date(Date.now() - retentionMs - extraMs).toISOString();
  }

  function makeRecentCompletedAt(agoMs = 30 * 60 * 1000): string {
    return new Date(Date.now() - agoMs).toISOString();
  }

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      delete: vi.fn().mockResolvedValue(true),
    };

    mockLedgerService = {
      recordFeatureCompletion: vi.fn().mockResolvedValue(undefined),
    };

    mockSettingsService = {
      getGlobalSettings: vi.fn().mockResolvedValue({
        archival: { enabled: true, retentionHours },
        projects: [{ path: projectPath }],
      }),
    };

    mockEvents = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
    };

    archivalService = new ArchivalService(
      mockFeatureLoader as unknown as FeatureLoader,
      mockLedgerService as unknown as LedgerService,
      mockSettingsService as unknown as SettingsService,
      mockEvents as unknown as EventEmitter
    );
  });

  describe('runArchivalCycle — feature directory deletion after retention window', () => {
    it('deletes the feature directory for a done feature that has exceeded the retention window', async () => {
      const completedAt = makeExpiredCompletedAt();
      mockFeatureLoader.getAll.mockResolvedValue([
        { id: 'feature-1', title: 'Done Feature', status: 'done', completedAt },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).toHaveBeenCalledWith(projectPath, 'feature-1');
    });

    it('documents data loss: featureLoader.delete() removes entire directory (agent-output.md, handoffs, feature.json)', async () => {
      // When ArchivalService calls featureLoader.delete(), the ENTIRE feature directory
      // is removed recursively. This includes agent-output.md, any handoff files, and
      // feature.json. All agent work artifacts are permanently lost after archival.
      const completedAt = makeExpiredCompletedAt(5000);
      mockFeatureLoader.getAll.mockResolvedValue([
        { id: 'feature-abc', title: 'Feature with artifacts', status: 'done', completedAt },
      ]);

      await archivalService.runArchivalCycle();

      // delete() is called exactly once — this is the recursive directory deletion
      // covering agent-output.md, handoffs/, and feature.json
      expect(mockFeatureLoader.delete).toHaveBeenCalledTimes(1);
      expect(mockFeatureLoader.delete).toHaveBeenCalledWith(projectPath, 'feature-abc');
    });

    it('skips features still within the retention window', async () => {
      const completedAt = makeRecentCompletedAt(30 * 60 * 1000); // only 30 min ago
      mockFeatureLoader.getAll.mockResolvedValue([
        { id: 'feature-recent', title: 'Recent Done', status: 'done', completedAt },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).not.toHaveBeenCalled();
    });

    it('skips non-done features even when they are old', async () => {
      const oldCompletedAt = makeExpiredCompletedAt(10000);
      mockFeatureLoader.getAll.mockResolvedValue([
        {
          id: 'feature-active',
          title: 'Active',
          status: 'in_progress',
          completedAt: oldCompletedAt,
        },
        { id: 'feature-backlog', title: 'Backlog', status: 'backlog' },
        {
          id: 'feature-failed',
          title: 'Failed',
          status: 'failed',
          completedAt: oldCompletedAt,
        },
        {
          id: 'feature-blocked',
          title: 'Blocked',
          status: 'blocked',
          completedAt: oldCompletedAt,
        },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).not.toHaveBeenCalled();
    });

    it('falls back to statusHistory timestamp when completedAt is absent', async () => {
      const oldTimestamp = makeExpiredCompletedAt(5000);
      mockFeatureLoader.getAll.mockResolvedValue([
        {
          id: 'feature-no-ts',
          title: 'Feature without completedAt',
          status: 'done',
          // No completedAt field — should fall back to statusHistory
          statusHistory: [{ from: 'in_progress', to: 'done', timestamp: oldTimestamp }],
        },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).toHaveBeenCalledWith(projectPath, 'feature-no-ts');
    });

    it('skips features with no completedAt and no done statusHistory entry', async () => {
      mockFeatureLoader.getAll.mockResolvedValue([
        {
          id: 'feature-no-date',
          title: 'No date at all',
          status: 'done',
          // no completedAt, no statusHistory with done
          statusHistory: [{ from: null, to: 'backlog', timestamp: makeExpiredCompletedAt() }],
        },
      ]);

      await archivalService.runArchivalCycle();

      // Cannot determine completedAt → skip
      expect(mockFeatureLoader.delete).not.toHaveBeenCalled();
    });

    it('skips archival entirely when disabled in settings', async () => {
      mockSettingsService.getGlobalSettings.mockResolvedValue({
        archival: { enabled: false },
        projects: [{ path: projectPath }],
      });

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.getAll).not.toHaveBeenCalled();
      expect(mockFeatureLoader.delete).not.toHaveBeenCalled();
    });

    it('ensures ledger record is written before the directory is deleted', async () => {
      const completedAt = makeExpiredCompletedAt();
      const feature = { id: 'feature-1', title: 'Done', status: 'done', completedAt };
      mockFeatureLoader.getAll.mockResolvedValue([feature]);

      const callOrder: string[] = [];
      mockLedgerService.recordFeatureCompletion.mockImplementation(async () => {
        callOrder.push('ledger');
      });
      mockFeatureLoader.delete.mockImplementation(async () => {
        callOrder.push('delete');
        return true;
      });

      await archivalService.runArchivalCycle();

      // Ledger is written BEFORE the directory is deleted — preserving the metric record
      expect(callOrder).toEqual(['ledger', 'delete']);
    });

    it('emits feature:archived event after successful deletion', async () => {
      const completedAt = makeExpiredCompletedAt();
      mockFeatureLoader.getAll.mockResolvedValue([
        { id: 'feature-1', title: 'Done Feature', status: 'done', completedAt },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockEvents.emit).toHaveBeenCalledWith('feature:archived', {
        projectPath,
        featureId: 'feature-1',
        featureTitle: 'Done Feature',
      });
    });

    it('archives multiple done features from the same project', async () => {
      const completedAt = makeExpiredCompletedAt();
      mockFeatureLoader.getAll.mockResolvedValue([
        { id: 'feature-1', title: 'Done A', status: 'done', completedAt },
        { id: 'feature-2', title: 'Done B', status: 'done', completedAt },
        { id: 'feature-3', title: 'Active', status: 'in_progress' },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).toHaveBeenCalledTimes(2);
      expect(mockFeatureLoader.delete).toHaveBeenCalledWith(projectPath, 'feature-1');
      expect(mockFeatureLoader.delete).toHaveBeenCalledWith(projectPath, 'feature-2');
    });

    it('skips epic if any child features are still active', async () => {
      const completedAt = makeExpiredCompletedAt();
      mockFeatureLoader.getAll.mockResolvedValue([
        {
          id: 'epic-1',
          title: 'Epic',
          status: 'done',
          completedAt,
          isEpic: true,
        },
        {
          id: 'feature-child',
          title: 'Child still active',
          status: 'in_progress',
          epicId: 'epic-1',
        },
      ]);

      await archivalService.runArchivalCycle();

      expect(mockFeatureLoader.delete).not.toHaveBeenCalled();
    });
  });
});
