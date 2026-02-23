/**
 * Reflection Service Unit Tests
 *
 * Tests project-level reflection generation:
 * - Feature filtering by projectSlug only (not epicId)
 * - Deduplication of processed projects
 * - LLM call and file storage
 * - Event emission
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Feature } from '@automaker/types';
import type { EventType } from '@automaker/types';

// Mock external dependencies before importing the service
vi.mock('../../../src/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn().mockResolvedValue({ text: 'Mock reflection output' }),
}));

vi.mock('@automaker/platform', () => ({
  ensureAutomakerDir: vi.fn().mockResolvedValue(undefined),
  secureFs: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ReflectionService } from '../../../src/services/reflection-service.js';
import { simpleQuery } from '../../../src/providers/simple-query-service.js';
import { ensureAutomakerDir, secureFs } from '@automaker/platform';

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

function createMockFeatureLoader(features: Feature[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('ReflectionService', () => {
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;

  beforeEach(() => {
    events = createMockEvents();
    featureLoader = createMockFeatureLoader();
    vi.clearAllMocks();
    // Re-setup default mock return
    vi.mocked(simpleQuery).mockResolvedValue({ text: 'Mock reflection output' } as any);
  });

  describe('feature filtering', () => {
    it('should only include features matching projectSlug', async () => {
      const projectFeature = createTestFeature({
        id: 'f1',
        title: 'Project Feature',
        projectSlug: 'my-project',
        status: 'done',
        costUsd: 2.0,
      });
      const otherFeature = createTestFeature({
        id: 'f2',
        title: 'Other Feature',
        projectSlug: 'other-project',
        epicId: 'some-epic', // has epicId but wrong projectSlug
        status: 'done',
        costUsd: 5.0,
      });
      const unrelatedFeature = createTestFeature({
        id: 'f3',
        title: 'Unrelated',
        epicId: 'another-epic', // has epicId, no projectSlug
        status: 'done',
        costUsd: 10.0,
      });

      featureLoader = createMockFeatureLoader([projectFeature, otherFeature, unrelatedFeature]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify simpleQuery was called with prompt containing only the project feature
      expect(simpleQuery).toHaveBeenCalledOnce();
      const prompt = vi.mocked(simpleQuery).mock.calls[0][0].prompt;
      expect(prompt).toContain('Project Feature');
      expect(prompt).not.toContain('Other Feature');
      expect(prompt).not.toContain('Unrelated');
      // Cost should reflect only the project feature ($2.00, not $17.00)
      expect(prompt).toContain('$2.00');
    });
  });

  describe('deduplication', () => {
    it('should process each project only once', async () => {
      const feature = createTestFeature({ projectSlug: 'proj', status: 'done' });
      featureLoader = createMockFeatureLoader([feature]);
      new ReflectionService(events as any, featureLoader as any);

      const payload = {
        projectPath: '/test/path',
        projectTitle: 'Test',
        projectSlug: 'proj',
        totalMilestones: 1,
        totalFeatures: 1,
      };

      // Fire twice
      events._fire('project:completed', payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      events._fire('project:completed', payload);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(simpleQuery).toHaveBeenCalledOnce();
    });

    it('should process different projects independently', async () => {
      const feature1 = createTestFeature({ id: 'f1', projectSlug: 'proj-a', status: 'done' });
      const feature2 = createTestFeature({ id: 'f2', projectSlug: 'proj-b', status: 'done' });
      featureLoader = createMockFeatureLoader([feature1, feature2]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'Project A',
        projectSlug: 'proj-a',
        totalMilestones: 1,
        totalFeatures: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'Project B',
        projectSlug: 'proj-b',
        totalMilestones: 1,
        totalFeatures: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(simpleQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('reflection output', () => {
    it('should write reflection to project directory', async () => {
      const feature = createTestFeature({ projectSlug: 'proj', status: 'done' });
      featureLoader = createMockFeatureLoader([feature]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'proj',
        totalMilestones: 1,
        totalFeatures: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(ensureAutomakerDir).toHaveBeenCalledWith('/test/path/.automaker/projects/proj');
      expect(secureFs.writeFile).toHaveBeenCalledWith(
        '/test/path/.automaker/projects/proj/reflection.md',
        expect.stringContaining('# Reflection: Test Project'),
        'utf-8'
      );
    });

    it('should emit project:reflection:complete event', async () => {
      const feature = createTestFeature({ projectSlug: 'proj', status: 'done' });
      featureLoader = createMockFeatureLoader([feature]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'proj',
        totalMilestones: 1,
        totalFeatures: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(events.emit).toHaveBeenCalledWith('project:reflection:complete', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'proj',
        reflectionPath: '/test/path/.automaker/projects/proj/reflection.md',
      });
    });

    it('should handle LLM failure gracefully', async () => {
      vi.mocked(simpleQuery).mockRejectedValue(new Error('LLM unavailable'));

      const feature = createTestFeature({ projectSlug: 'proj', status: 'done' });
      featureLoader = createMockFeatureLoader([feature]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'proj',
        totalMilestones: 1,
        totalFeatures: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not emit completion event on failure
      expect(events.emit).not.toHaveBeenCalledWith(
        'project:reflection:complete',
        expect.anything()
      );
      // Should not write file on failure
      expect(secureFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('summary building', () => {
    it('should include feature stats in LLM prompt', async () => {
      const features = [
        createTestFeature({
          id: 'f1',
          title: 'Auth System',
          projectSlug: 'proj',
          status: 'done',
          costUsd: 3.5,
          prUrl: 'https://github.com/repo/pull/1',
          failureCount: 2,
        }),
        createTestFeature({
          id: 'f2',
          title: 'API Routes',
          projectSlug: 'proj',
          status: 'done',
          costUsd: 1.0,
          prUrl: 'https://github.com/repo/pull/2',
        }),
      ];

      featureLoader = createMockFeatureLoader(features);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('project:completed', {
        projectPath: '/test/path',
        projectTitle: 'My API',
        projectSlug: 'proj',
        totalMilestones: 1,
        totalFeatures: 2,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const prompt = vi.mocked(simpleQuery).mock.calls[0][0].prompt;
      expect(prompt).toContain('Project: My API');
      expect(prompt).toContain('Features Done: 2');
      expect(prompt).toContain('PRs Created: 2');
      expect(prompt).toContain('Features with Failures: 1');
      expect(prompt).toContain('Total Retries: 2');
      expect(prompt).toContain('$4.50');
      expect(prompt).toContain('Auth System');
      expect(prompt).toContain('API Routes');
      expect(prompt).toContain('[2 retries]');
    });
  });

  describe('event filtering', () => {
    it('should ignore non-project:completed events', async () => {
      const feature = createTestFeature({ projectSlug: 'proj' });
      featureLoader = createMockFeatureLoader([feature]);
      new ReflectionService(events as any, featureLoader as any);

      events._fire('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test',
        projectSlug: 'proj',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(simpleQuery).not.toHaveBeenCalled();
    });
  });
});
