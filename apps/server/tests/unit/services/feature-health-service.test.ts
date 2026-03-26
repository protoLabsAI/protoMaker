/**
 * Tests for FeatureHealthService
 *
 * Covers epic completion detection logic:
 * - Children in 'review' should NOT count as done
 * - Git-backed epics are auto-fixable via CompletionDetectorService retry
 * - Non-git epics are auto-fixable by marking done directly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureHealthService } from '@/services/feature-health-service.js';
import type { Feature } from '@protolabsai/types';

describe('feature-health-service.ts', () => {
  let service: FeatureHealthService;
  let mockFeatureLoader: any;
  let mockAutoModeService: any;
  let mockCompletionDetector: any;

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    mockAutoModeService = {
      getRunningAgents: vi.fn().mockResolvedValue([]),
      releaseStaleLeases: vi.fn().mockReturnValue([]),
    };
    mockCompletionDetector = {
      retryEpicCompletion: vi.fn().mockResolvedValue(undefined),
    };
    service = new FeatureHealthService(mockFeatureLoader, mockAutoModeService);
    service.setCompletionDetector(mockCompletionDetector);
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

    it('marks git-backed epics as auto-fixable via CompletionDetector retry', async () => {
      const features: Partial<Feature>[] = [
        { id: 'epic-1', title: 'Epic', isEpic: true, status: 'backlog', branchName: 'epic/test' },
        { id: 'child-1', epicId: 'epic-1', status: 'done' },
      ];
      mockFeatureLoader.getAll.mockResolvedValue(features);

      const report = await service.audit('/mock', false);

      const epicIssue = report.issues.find((i) => i.type === 'epic_children_done');
      expect(epicIssue).toBeDefined();
      expect(epicIssue!.autoFixable).toBe(true);
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

    it('auto-fixes both git and non-git epics with appropriate strategy', async () => {
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

      // Both epics should have been auto-fixed
      expect(report.fixed).toHaveLength(2);

      // Git epic: routed through CompletionDetectorService for PR creation
      expect(mockCompletionDetector.retryEpicCompletion).toHaveBeenCalledWith('/mock', 'epic-git');

      // Non-git epic: marked done directly via featureLoader.update
      const nonGitUpdateCalls = mockFeatureLoader.update.mock.calls.filter(
        ([, id]: [string, string]) => id === 'epic-no-git'
      );
      expect(nonGitUpdateCalls).toHaveLength(1);
      expect(nonGitUpdateCalls[0][2]).toEqual({ status: 'done' });
    });
  });
});
