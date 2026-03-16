/**
 * Tests for FeatureHealthService
 *
 * Covers epic completion detection logic:
 * - Children in 'review' should NOT count as done
 * - Git-backed epics should NOT be auto-fixable (delegate to CompletionDetectorService)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureHealthService } from '@/services/feature-health-service.js';
import type { Feature } from '@protolabsai/types';

describe('feature-health-service.ts', () => {
  let service: FeatureHealthService;
  let mockFeatureLoader: any;
  let mockAutoModeService: any;

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    mockAutoModeService = {
      getRunningAgents: vi.fn().mockResolvedValue([]),
      releaseStaleLeases: vi.fn().mockReturnValue([]),
    };
    service = new FeatureHealthService(mockFeatureLoader, mockAutoModeService);
  });

  describe('checkEpicChildrenDone', () => {
    it('does not flag epic as complete when children are in review', async () => {
      const features: Partial<Feature>[] = [
        { id: 'epic-1', title: 'Epic', isEpic: true, status: 'backlog', branchName: 'epic/test' },
        { id: 'child-1', epicId: 'epic-1', status: 'done' },
        { id: 'child-2', epicId: 'epic-1', status: 'review' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', false);

      const epicIssues = report.issues.filter((i) => i.type === 'epic_children_done');
      expect(epicIssues).toHaveLength(0);
    });

    it('flags epic as complete when all children are done', async () => {
      const features: Partial<Feature>[] = [
        { id: 'epic-1', title: 'Epic', isEpic: true, status: 'backlog', branchName: 'epic/test' },
        { id: 'child-1', epicId: 'epic-1', status: 'done' },
        { id: 'child-2', epicId: 'epic-1', status: 'done' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', false);

      const epicIssues = report.issues.filter((i) => i.type === 'epic_children_done');
      expect(epicIssues).toHaveLength(1);
    });

    it('marks git-backed epics as NOT auto-fixable', async () => {
      const features: Partial<Feature>[] = [
        { id: 'epic-1', title: 'Epic', isEpic: true, status: 'backlog', branchName: 'epic/test' },
        { id: 'child-1', epicId: 'epic-1', status: 'done' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', false);

      const epicIssue = report.issues.find((i) => i.type === 'epic_children_done');
      expect(epicIssue).toBeDefined();
      expect(epicIssue!.autoFixable).toBe(false);
      expect(epicIssue!.fix).toContain('CompletionDetectorService');
    });

    it('marks non-git epics as auto-fixable', async () => {
      const features: Partial<Feature>[] = [
        { id: 'epic-1', title: 'Epic', isEpic: true, status: 'backlog' },
        { id: 'child-1', epicId: 'epic-1', status: 'done' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', false);

      const epicIssue = report.issues.find((i) => i.type === 'epic_children_done');
      expect(epicIssue).toBeDefined();
      expect(epicIssue!.autoFixable).toBe(true);
      expect(epicIssue!.fix).toBe('Set epic status to done');
    });

    it('auto-fixes non-git epics but skips git-backed ones', async () => {
      const features: Partial<Feature>[] = [
        {
          id: 'epic-git',
          title: 'Git Epic',
          isEpic: true,
          status: 'backlog',
          branchName: 'epic/test',
        },
        { id: 'child-1', epicId: 'epic-git', status: 'done' },
        { id: 'epic-no-git', title: 'No Git Epic', isEpic: true, status: 'backlog' },
        { id: 'child-2', epicId: 'epic-no-git', status: 'done' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', true);

      // Only the non-git epic should have been auto-fixed
      expect(report.fixed).toHaveLength(1);
      expect(report.fixed[0].featureId).toBe('epic-no-git');

      // update should only have been called for the non-git epic
      const updateCalls = mockFeatureLoader.update.mock.calls.filter(
        ([, id]: [string, string]) => id === 'epic-git'
      );
      expect(updateCalls).toHaveLength(0);
    });
  });
});
