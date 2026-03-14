/**
 * Completion Detector Service Unit Tests
 *
 * Tests the cascade logic:
 *   feature done → epic done → milestone completed → project completed
 *
 * Also tests deduplication and the areMilestonePhasesDone guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock node:child_process before importing the service so execFile is intercepted
const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

import { CompletionDetectorService } from '@/services/completion-detector-service.js';
import type { Feature, Milestone, Project } from '@protolabsai/types';
import type { EventType } from '@protolabsai/types';

// ────────────────────────── Mocks ──────────────────────────

function createMockEvents() {
  const subscribers: Array<(type: EventType, payload: unknown) => void> = [];
  return {
    emit: vi.fn(),
    subscribe: vi.fn((cb: (type: EventType, payload: unknown) => void) => {
      subscribers.push(cb);
      return () => {
        const idx = subscribers.indexOf(cb);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
    _fire(type: EventType, payload: unknown) {
      for (const cb of subscribers) cb(type, payload);
    },
  };
}

function createTestFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-1',
    title: 'Test Feature',
    description: 'A test feature',
    status: 'done',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function createTestMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    number: 1,
    slug: 'milestone-1',
    title: 'Foundation',
    description: 'Core infrastructure',
    phases: [],
    ...overrides,
  };
}

function createMockFeatureLoader(features: Feature[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    get: vi.fn().mockImplementation(async (_path: string, id: string) => {
      return features.find((f) => f.id === id) || null;
    }),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProjectService(project: Partial<Project> | null = null) {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    updateProject: vi.fn().mockResolvedValue(undefined),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('CompletionDetectorService', () => {
  let service: CompletionDetectorService;
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let projectService: ReturnType<typeof createMockProjectService>;
  beforeEach(() => {
    service = new CompletionDetectorService();
    events = createMockEvents();
    featureLoader = createMockFeatureLoader();
    projectService = createMockProjectService();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize and subscribe to events', async () => {
      await service.initialize(events as any, featureLoader as any, projectService as any);
      expect(events.subscribe).toHaveBeenCalledOnce();
    });

    it('should cleanup on destroy', async () => {
      await service.initialize(events as any, featureLoader as any, projectService as any);
      expect(() => service.destroy()).not.toThrow();
    });
  });

  describe('epic completion cascade', () => {
    it('should mark epic done when all children are done', async () => {
      const epic = createTestFeature({
        id: 'epic-1',
        title: 'Epic',
        status: 'in_progress',
        isEpic: true,
      });
      const child1 = createTestFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
      const child2 = createTestFeature({ id: 'child-2', epicId: 'epic-1', status: 'done' });

      featureLoader = createMockFeatureLoader([epic, child1, child2]);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      // Simulate feature:status-changed for child-2 moving to done
      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'child-2',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).toHaveBeenCalledWith('/test/path', 'epic-1', { status: 'done' });
      expect(events.emit).toHaveBeenCalledWith(
        'feature:completed',
        expect.objectContaining({
          featureId: 'epic-1',
          isEpic: true,
        })
      );
    });

    it('should NOT mark epic done when some children are not done', async () => {
      const epic = createTestFeature({
        id: 'epic-1',
        title: 'Epic',
        status: 'in_progress',
        isEpic: true,
      });
      const child1 = createTestFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
      const child2 = createTestFeature({ id: 'child-2', epicId: 'epic-1', status: 'in_progress' });

      featureLoader = createMockFeatureLoader([epic, child1, child2]);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'child-1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).not.toHaveBeenCalled();
    });

    it('should NOT mark epic done when epic is already done', async () => {
      const epic = createTestFeature({ id: 'epic-1', status: 'done', isEpic: true });
      const child1 = createTestFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });

      featureLoader = createMockFeatureLoader([epic, child1]);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'child-1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.update).not.toHaveBeenCalled();
    });
  });

  describe('createEpicToDevPR shell safety', () => {
    beforeEach(() => {
      mockExecFile.mockReset();
    });

    it('passes epic title with special characters as a separate arg without shell evaluation', async () => {
      const dangerousTitle = 'Epic $(rm -rf /) `malicious` and \\backslash';

      // promisify(execFile) without [util.promisify.custom] captures the first non-error
      // callback arg as the resolved value, so pass { stdout, stderr } as that arg.
      type ExecFileCb = (err: null, result: { stdout: string; stderr: string }) => void;

      // gh pr list → no existing PR
      mockExecFile.mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: object, cb: ExecFileCb) => {
          cb(null, { stdout: '[]', stderr: '' });
        }
      );
      // gh pr create → returns PR URL
      mockExecFile.mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: object, cb: ExecFileCb) => {
          cb(null, { stdout: 'https://github.com/org/repo/pull/42', stderr: '' });
        }
      );
      // gh pr merge (auto-merge) → success
      mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: object, cb: ExecFileCb) => {
          cb(null, { stdout: '', stderr: '' });
        }
      );

      const epic = createTestFeature({
        id: 'epic-1',
        title: dangerousTitle,
        status: 'in_progress',
        isEpic: true,
        branchName: 'epic/test-branch',
      });
      const child = createTestFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });

      featureLoader = createMockFeatureLoader([epic, child]);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'child-1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Find the gh pr create call
      const createCall = mockExecFile.mock.calls.find(
        (c: unknown[]) =>
          c[0] === 'gh' && Array.isArray(c[1]) && (c[1] as string[]).includes('create')
      );
      expect(createCall).toBeDefined();

      const args = createCall![1] as string[];
      const titleIndex = args.indexOf('--title');
      expect(titleIndex).toBeGreaterThan(-1);

      // Title is passed as a separate argument — shell metacharacters are literal
      expect(args[titleIndex + 1]).toBe(`epic: ${dangerousTitle}`);
      expect(args[titleIndex + 1]).toContain('$(rm -rf /)');
      expect(args[titleIndex + 1]).toContain('`malicious`');
      expect(args[titleIndex + 1]).toContain('\\backslash');

      // Body is also a separate argument — no escaping needed
      const bodyIndex = args.indexOf('--body');
      expect(bodyIndex).toBeGreaterThan(-1);
      expect(args[bodyIndex + 1]).toContain(dangerousTitle);
    });
  });

  describe('milestone completion', () => {
    it('should emit milestone:completed when all phases are done', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
        costUsd: 2.0,
      });
      const feature2 = createTestFeature({
        id: 'f2',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
        costUsd: 3.0,
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
          {
            number: 2,
            name: 'p2',
            title: 'Phase 2',
            description: '',
            featureId: 'f2',
            complexity: 'medium',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1, feature2]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f2',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).toHaveBeenCalledWith(
        'milestone:completed',
        expect.objectContaining({
          projectPath: '/test/path',
          projectTitle: 'Test Project',
          projectSlug: 'proj',
          milestoneTitle: 'Foundation',
        })
      );
    });

    it('should NOT emit milestone:completed when phases lack featureId', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
          {
            number: 2,
            name: 'p2',
            title: 'Phase 2 (uncreated)',
            description: '',
            complexity: 'medium',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });

    it('should NOT emit milestone:completed when some features are not done', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });
      const feature2 = createTestFeature({
        id: 'f2',
        status: 'in_progress',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
          {
            number: 2,
            name: 'p2',
            title: 'Phase 2',
            description: '',
            featureId: 'f2',
            complexity: 'medium',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1, feature2]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });

    /**
     * BUG DOCUMENTATION: If a feature has epicId but NO milestoneSlug, and the epic
     * also has no milestoneSlug, the milestone cascade never fires.
     *
     * Root cause: onFeatureDone only calls checkMilestoneCompletion when feature has
     * BOTH projectSlug AND milestoneSlug set. checkEpicCompletion only calls
     * checkMilestoneCompletion when epic has BOTH projectSlug AND milestoneSlug set.
     * If these fields are absent, the milestone is silently skipped.
     *
     * This test documents the current (broken) behavior. It should be fixed by
     * having the epic/feature look up their milestone association from the project.
     */
    it('should NOT cascade to milestone when milestoneSlug is missing from feature and epic (BUG)', async () => {
      // Feature and epic both lack milestoneSlug — milestone cascade WILL NOT fire
      const epic = createTestFeature({
        id: 'epic-1',
        title: 'Epic Without Milestone Slug',
        status: 'in_progress',
        isEpic: true,
        projectSlug: 'proj',
        // intentionally NO milestoneSlug — this is the bug condition
      });
      const child = createTestFeature({
        id: 'child-1',
        epicId: 'epic-1',
        status: 'done',
        projectSlug: 'proj',
        // intentionally NO milestoneSlug — this is the bug condition
      });

      // Milestone exists and has the child as a phase — but cascade won't reach it
      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'child-1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([epic, child]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'child-1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Epic WILL complete (epicId-based lookup works fine)
      expect(featureLoader.update).toHaveBeenCalledWith('/test/path', 'epic-1', { status: 'done' });
      expect(events.emit).toHaveBeenCalledWith(
        'feature:completed',
        expect.objectContaining({ featureId: 'epic-1', isEpic: true })
      );

      // BUT milestone cascade will NOT fire — milestoneSlug is missing from both feature and epic
      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });

    /**
     * TARGET BEHAVIOR: When milestoneSlug IS set on the feature, milestone cascade fires.
     * This is the expected (working) path — already covered by the main happy-path test above,
     * but included here explicitly alongside the bug test for contrast.
     */
    it('should cascade to milestone when milestoneSlug is set on feature (target behavior)', async () => {
      const feature = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1', // milestoneSlug IS set — cascade works
        costUsd: 1.5,
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Milestone cascade DOES fire when milestoneSlug is present
      expect(events.emit).toHaveBeenCalledWith(
        'milestone:completed',
        expect.objectContaining({
          projectPath: '/test/path',
          projectSlug: 'proj',
          milestoneTitle: 'Foundation',
        })
      );
    });

    it('should deduplicate milestone completion events', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      // Fire twice
      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const milestoneCalls = events.emit.mock.calls.filter(
        (c: unknown[]) => c[0] === 'milestone:completed'
      );
      expect(milestoneCalls).toHaveLength(1);
    });
  });

  describe('project completion cascade', () => {
    it('should emit project:completed when all milestones are done', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
        costUsd: 5.0,
      });

      // Milestone must NOT be pre-completed — the cascade sets it to 'completed'
      // then calls checkProjectCompletion which re-fetches the same object
      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).toHaveBeenCalledWith(
        'project:completed',
        expect.objectContaining({
          projectPath: '/test/path',
          projectTitle: 'Test Project',
          projectSlug: 'proj',
        })
      );
    });

    it('should deduplicate project completion events', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const projectCalls = events.emit.mock.calls.filter(
        (c: unknown[]) => c[0] === 'project:completed'
      );
      expect(projectCalls).toHaveLength(1);
    });
  });

  describe('auto-mode event trigger', () => {
    it('should trigger cascade on auto_mode_feature_complete with passes=true', async () => {
      const feature1 = createTestFeature({ id: 'f1', status: 'done' });
      featureLoader = createMockFeatureLoader([feature1]);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'f1',
        projectPath: '/test/path',
        passes: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have called get to load the feature
      expect(featureLoader.get).toHaveBeenCalledWith('/test/path', 'f1');
    });

    it('should NOT trigger on auto_mode_feature_complete with passes=false', async () => {
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('auto-mode:event', {
        type: 'auto_mode_feature_complete',
        featureId: 'f1',
        projectPath: '/test/path',
        passes: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(featureLoader.get).not.toHaveBeenCalled();
    });
  });

  describe('projectSlug and milestoneSlug guards', () => {
    it('should NOT emit milestone:completed when feature is missing projectSlug', async () => {
      // feature has milestoneSlug but NO projectSlug — completion detector skips milestone check
      const feature = createTestFeature({
        id: 'f1',
        status: 'done',
        // intentionally NO projectSlug
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // milestone:completed should NOT fire — projectSlug is required
      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });

    it('should NOT emit milestone:completed when feature is missing milestoneSlug', async () => {
      // feature has projectSlug but NO milestoneSlug — completion detector skips milestone check
      const feature = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        // intentionally NO milestoneSlug
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [
          {
            number: 1,
            name: 'p1',
            title: 'Phase 1',
            description: '',
            featureId: 'f1',
            complexity: 'small',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'Test Project',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // milestone:completed should NOT fire — milestoneSlug is required
      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });

    it('full flow: feature with projectSlug marked done fires milestone:completed', async () => {
      // Canonical end-to-end test verifying the guard passes when both projectSlug
      // and milestoneSlug are present and all milestone features are done.
      const feature1 = createTestFeature({
        id: 'feat-a',
        status: 'done',
        projectSlug: 'my-project',
        milestoneSlug: 'launch',
      });
      const feature2 = createTestFeature({
        id: 'feat-b',
        status: 'done',
        projectSlug: 'my-project',
        milestoneSlug: 'launch',
      });

      const milestone = createTestMilestone({
        slug: 'launch',
        title: 'Launch Milestone',
        phases: [
          {
            number: 1,
            name: 'feat-a',
            title: 'Feature A',
            description: '',
            featureId: 'feat-a',
            complexity: 'small',
          },
          {
            number: 2,
            name: 'feat-b',
            title: 'Feature B',
            description: '',
            featureId: 'feat-b',
            complexity: 'medium',
          },
        ],
      });

      const project: Partial<Project> = {
        title: 'My Project',
        slug: 'my-project',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1, feature2]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      // feat-a moves to done — both features are now done, milestone should complete
      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'feat-a',
        previousStatus: 'in_progress',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Full flow verified: milestone:completed fires with correct shape
      expect(events.emit).toHaveBeenCalledWith(
        'milestone:completed',
        expect.objectContaining({
          projectPath: '/test/path',
          projectTitle: 'My Project',
          projectSlug: 'my-project',
          milestoneSlug: 'launch',
          milestoneTitle: 'Launch Milestone',
        })
      );
    });
  });

  describe('areMilestonePhasesDone guard', () => {
    it('should return false for empty phases', async () => {
      const feature1 = createTestFeature({
        id: 'f1',
        status: 'done',
        projectSlug: 'proj',
        milestoneSlug: 'ms-1',
      });

      const milestone = createTestMilestone({
        slug: 'ms-1',
        phases: [], // empty
      });

      const project: Partial<Project> = {
        title: 'Test',
        slug: 'proj',
        status: 'active',
        milestones: [milestone],
      };

      featureLoader = createMockFeatureLoader([feature1]);
      projectService = createMockProjectService(project as Project);
      await service.initialize(events as any, featureLoader as any, projectService as any);

      events._fire('feature:status-changed', {
        projectPath: '/test/path',
        featureId: 'f1',
        previousStatus: 'review',
        newStatus: 'done',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).not.toHaveBeenCalledWith('milestone:completed', expect.anything());
    });
  });
});
