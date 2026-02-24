/**
 * AgentScoringService Unit Tests
 *
 * Tests for Langfuse score creation based on feature lifecycle events:
 * - agent.success: scored on status transitions
 * - agent.efficiency: turns used / max turns
 * - agent.quality: CodeRabbit thread count
 * - agent.build_pass: binary pass/fail
 * - agent.rework_count: normalized execution attempts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentScoringService } from '../../../src/services/agent-scoring-service.js';
import type { Feature } from '@protolabs-ai/types';

// ============================================================================
// Mock Langfuse singleton
// ============================================================================

const mockLangfuse = {
  isAvailable: vi.fn().mockReturnValue(true),
  createScore: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../src/lib/langfuse-singleton.js', () => ({
  getLangfuseInstance: () => mockLangfuse,
}));

// ============================================================================
// Mock logger
// ============================================================================

vi.mock('@protolabs-ai/utils', async () => {
  const actual = await vi.importActual('@protolabs-ai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

// ============================================================================
// Helpers
// ============================================================================

type EventCallback = (type: string, payload: unknown) => void;

function createMockEvents() {
  let callback: EventCallback | null = null;
  return {
    subscribe: vi.fn((cb: EventCallback) => {
      callback = cb;
      return () => {
        callback = null;
      };
    }),
    emit: vi.fn(),
    fire(type: string, payload: unknown) {
      callback?.(type, payload);
    },
  };
}

function createMockFeatureLoader(features: Partial<Feature>[] = []) {
  return {
    get: vi
      .fn()
      .mockImplementation((_path: string, id: string) =>
        Promise.resolve(features.find((f) => f.id === id) ?? null)
      ),
    getAll: vi.fn().mockResolvedValue(features),
  };
}

function createTestFeature(overrides: Partial<Feature> = {}): Partial<Feature> {
  return {
    id: 'feature-123',
    title: 'Test Feature',
    status: 'done',
    lastTraceId: 'trace-abc',
    complexity: 'medium',
    executionHistory: [{ turnCount: 100, model: 'sonnet', success: true }],
    threadFeedback: [],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AgentScoringService', () => {
  let events: ReturnType<typeof createMockEvents>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLangfuse.isAvailable.mockReturnValue(true);
  });

  function setup(features: Partial<Feature>[] = [createTestFeature()]) {
    events = createMockEvents();
    featureLoader = createMockFeatureLoader(features);
    // Constructor calls registerListeners() which subscribes
    new AgentScoringService(events as never, featureLoader as never);
    return { events, featureLoader };
  }

  describe('initialization', () => {
    it('should subscribe to events on construction', () => {
      setup();
      expect(events.subscribe).toHaveBeenCalledOnce();
    });
  });

  describe('agent.success scoring', () => {
    it('should score 1.0 when feature transitions to done', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // Allow async handler to complete
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            traceId: 'trace-abc',
            name: 'agent.success',
            value: 1.0,
          })
        );
      });
    });

    it('should score 0.7 when feature transitions from in_progress to review', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'in_progress',
        newStatus: 'review',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.success',
            value: 0.7,
          })
        );
      });
    });

    it('should score 0.0 when feature resets from in_progress to backlog', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'in_progress',
        newStatus: 'backlog',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.success',
            value: 0.0,
          })
        );
      });
    });

    it('should score 0.0 when feature transitions from in_progress to blocked', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'in_progress',
        newStatus: 'blocked',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.success',
            value: 0.0,
          })
        );
      });
    });
  });

  describe('agent.efficiency scoring', () => {
    it('should score based on turns used vs max turns', async () => {
      const feature = createTestFeature({
        executionHistory: [{ turnCount: 100, model: 'sonnet', success: true }],
        maxTurns: 500,
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // efficiency = 1 - (100/500) = 0.8
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.efficiency',
            value: 0.8,
          })
        );
      });
    });

    it('should use default maxTurns based on complexity when not set', async () => {
      const feature = createTestFeature({
        executionHistory: [{ turnCount: 100, model: 'sonnet', success: true }],
        maxTurns: undefined,
        complexity: 'small', // default max = 200
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // efficiency = 1 - (100/200) = 0.5
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.efficiency',
            value: 0.5,
          })
        );
      });
    });

    it('should clamp efficiency to 0 when turns exceed maxTurns', async () => {
      const feature = createTestFeature({
        executionHistory: [{ turnCount: 600, model: 'sonnet', success: true }],
        maxTurns: 500,
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // efficiency = 1 - min(600/500, 1) = 1 - 1 = 0
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.efficiency',
            value: 0,
          })
        );
      });
    });

    it('should skip efficiency scoring when no turnCount', async () => {
      const feature = createTestFeature({
        executionHistory: [{ model: 'sonnet', success: true }],
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'agent.success' })
        );
      });

      const efficiencyCalls = mockLangfuse.createScore.mock.calls.filter(
        (c: [{ name: string }]) => c[0].name === 'agent.efficiency'
      );
      expect(efficiencyCalls).toHaveLength(0);
    });
  });

  describe('agent.quality scoring', () => {
    it('should score 1.0 with no review threads', async () => {
      const feature = createTestFeature({ threadFeedback: [] });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.quality',
            value: 1.0,
          })
        );
      });
    });

    it('should decrease by 0.1 per review thread', async () => {
      const feature = createTestFeature({
        threadFeedback: [
          { id: '1', body: 'a', resolved: false },
          { id: '2', body: 'b', resolved: false },
          { id: '3', body: 'c', resolved: false },
        ],
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // quality = max(0, 1 - 3 * 0.1) = 0.7
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.quality',
            value: 0.7,
          })
        );
      });
    });

    it('should clamp quality to 0 with 10+ threads', async () => {
      const threads = Array.from({ length: 12 }, (_, i) => ({
        id: String(i),
        body: `issue ${i}`,
        resolved: false,
      }));
      const feature = createTestFeature({ threadFeedback: threads });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // quality = max(0, 1 - 12 * 0.1) = max(0, -0.2) = 0
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.quality',
            value: 0,
          })
        );
      });
    });
  });

  describe('agent.build_pass scoring', () => {
    it('should score 1.0 on successful transition to done', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.build_pass',
            value: 1.0,
          })
        );
      });
    });

    it('should score 0.0 on failure transition to backlog', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'in_progress',
        newStatus: 'backlog',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.build_pass',
            value: 0.0,
          })
        );
      });
    });
  });

  describe('agent.rework_count scoring', () => {
    it('should score 1.0 for single execution attempt', async () => {
      const feature = createTestFeature({
        executionHistory: [{ turnCount: 50, model: 'sonnet', success: true }],
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.rework_count',
            value: 1.0,
          })
        );
      });
    });

    it('should score 0.5 for two execution attempts', async () => {
      const feature = createTestFeature({
        executionHistory: [
          { turnCount: 50, model: 'sonnet', success: false },
          { turnCount: 80, model: 'sonnet', success: true },
        ],
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.rework_count',
            value: 0.5,
          })
        );
      });
    });

    it('should score ~0.33 for three execution attempts', async () => {
      const feature = createTestFeature({
        executionHistory: [
          { turnCount: 50, model: 'sonnet', success: false },
          { turnCount: 80, model: 'sonnet', success: false },
          { turnCount: 100, model: 'opus', success: true },
        ],
      });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        const reworkCall = mockLangfuse.createScore.mock.calls.find(
          (c: [{ name: string }]) => c[0].name === 'agent.rework_count'
        );
        expect(reworkCall).toBeDefined();
        expect(reworkCall![0].value).toBeCloseTo(0.333, 2);
      });
    });
  });

  describe('Langfuse unavailable', () => {
    it('should silently skip scoring when Langfuse is unavailable', async () => {
      mockLangfuse.isAvailable.mockReturnValue(false);
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // Wait a tick
      await new Promise((r) => setTimeout(r, 50));
      expect(mockLangfuse.createScore).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should skip scoring when feature has no lastTraceId', async () => {
      const feature = createTestFeature({ lastTraceId: undefined });
      const { events } = setup([feature]);

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockLangfuse.createScore).not.toHaveBeenCalled();
    });

    it('should skip scoring when feature not found', async () => {
      const { events } = setup([]);

      events.fire('feature:status-changed', {
        featureId: 'nonexistent',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockLangfuse.createScore).not.toHaveBeenCalled();
    });

    it('should skip when event has no projectPath', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        // no projectPath
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockLangfuse.createScore).not.toHaveBeenCalled();
    });

    it('should flush after scoring', async () => {
      const { events } = setup();

      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.flush).toHaveBeenCalled();
      });
    });

    it('should use previousStatus field from event payload', async () => {
      const { events } = setup();

      // The event payload uses 'previousStatus', not 'oldStatus'
      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'in_progress',
        newStatus: 'review',
        projectPath: '/test/project',
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'agent.success',
            value: 0.7,
          })
        );
      });
    });
  });

  describe('pipeline phase scoring', () => {
    it('should track featureId → projectPath mapping on pipeline:phase-entered', async () => {
      const feature = createTestFeature({
        pipelineState: { traceId: 'pipeline-trace-1' },
      });
      const { events } = setup([feature]);

      events.fire('pipeline:phase-entered', {
        featureId: 'feature-123',
        projectPath: '/test/project',
        phase: 'BUILD',
      });

      events.fire('pipeline:phase-completed', {
        featureId: 'feature-123',
        phase: 'BUILD',
        durationMs: 5000,
      });

      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'pipeline.phase.success',
            value: 1.0,
          })
        );
      });
    });

    it('should evict pipeline cache on terminal status', async () => {
      const { events } = setup();

      events.fire('pipeline:phase-entered', {
        featureId: 'feature-123',
        projectPath: '/test/project',
      });

      // Terminal status evicts from cache
      events.fire('feature:status-changed', {
        featureId: 'feature-123',
        previousStatus: 'review',
        newStatus: 'done',
        projectPath: '/test/project',
      });

      // Clear scores from status change
      await vi.waitFor(() => {
        expect(mockLangfuse.createScore).toHaveBeenCalled();
      });
      mockLangfuse.createScore.mockClear();

      // Pipeline event after eviction should not score (no projectPath mapping)
      events.fire('pipeline:phase-completed', {
        featureId: 'feature-123',
        phase: 'PUBLISH',
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(mockLangfuse.createScore).not.toHaveBeenCalled();
    });
  });
});
