/**
 * Completion Detector Service Unit Tests
 *
 * Tests the cascade logic:
 *   feature done → epic done → milestone completed → project completed
 *
 * Also tests deduplication and the areMilestonePhasesDone guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    it('should initialize and subscribe to events', () => {
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);
      expect(events.subscribe).toHaveBeenCalledOnce();
    });

    it('should cleanup on destroy', () => {
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);
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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
      service.initialize(events as any, featureLoader as any, projectService as any, undefined);

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
