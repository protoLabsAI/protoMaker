/**
 * Content Flow Service Unit Tests
 *
 * Tests for content flow orchestration:
 * - Parameter validation
 * - Status tracking (running, completed, failed)
 * - Error handling when LangGraph flow throws
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentFlowService } from '../../../src/services/content-flow-service.js';
import type { EventEmitter } from '../../../src/lib/events.js';

// Mock the flows package
vi.mock('@protolabs-ai/flows', () => ({
  createContentCreationFlow: vi.fn(() => ({
    stream: vi.fn(),
    getState: vi.fn(),
  })),
}));

// Mock ChatAnthropic
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
  })),
}));

// Mock Langfuse singleton
vi.mock('../../../src/lib/langfuse-singleton.js', () => ({
  getLangfuseInstance: vi.fn(() => ({
    isAvailable: () => false,
    createTrace: vi.fn(),
    createScore: vi.fn(),
    flush: vi.fn(),
  })),
}));

// Mock file system operations
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock getAutomakerDir
vi.mock('@protolabs-ai/platform', () => ({
  getAutomakerDir: vi.fn(() => '/test/automaker'),
}));

import { createContentCreationFlow } from '@protolabs-ai/flows';

// Mock event emitter
const createMockEventEmitter = (): EventEmitter => {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
  } as unknown as EventEmitter;
};

describe('ContentFlowService', () => {
  let contentFlowService: ContentFlowService;
  let mockEmitter: EventEmitter;

  beforeEach(() => {
    contentFlowService = new ContentFlowService();
    mockEmitter = createMockEventEmitter();
    contentFlowService.setEventEmitter(mockEmitter);
    vi.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('should accept empty topic and start flow', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const result = await contentFlowService.startFlow('/test/path', '');
      expect(result.runId).toBeDefined();
      expect(result.status.topic).toBe('');
    });

    it('should accept any format value (validation happens at runtime)', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const result = await contentFlowService.startFlow('/test/path', 'Test Topic', {
        format: 'invalid' as any,
      });

      expect(result.runId).toBeDefined();
    });

    it('should accept valid parameters', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const result = await contentFlowService.startFlow('/test/path', 'Test Topic', {
        format: 'tutorial',
        tone: 'conversational',
        audience: 'beginner',
      });

      expect(result.runId).toBeDefined();
      expect(result.status.topic).toBe('Test Topic');
      expect(result.status.status).toBe('running');
    });

    it('should use default values when optional params omitted', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const result = await contentFlowService.startFlow('/test/path', 'Test Topic');

      expect(result.runId).toBeDefined();
      expect(result.status.status).toBe('running');
      expect(result.status.progress).toBe(0);
    });
  });

  describe('status tracking', () => {
    it('should return correct status for running flow', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { generate_queries: { progress: 5 } };
            // Never complete - simulate long-running flow
            await new Promise(() => {}); // Hang forever
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Give it a moment to start streaming
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('running');
      expect(status?.runId).toBe(runId);
    });

    it('should return correct status for completed flow', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Wait for flow to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('completed');
      expect(status?.progress).toBe(100);
      expect(status?.completedAt).toBeDefined();
    });

    it('should track review phases correctly', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield {
              research_review: {
                researchReview: { percentage: 85, passed: true, verdict: 'Good' },
              },
            };
            // Hang to keep the flow in review state
            await new Promise(() => {});
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Wait for review node
      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('reviewing_research');
      expect(status?.currentNode).toBe('research_review');
    });

    it('should return null for non-existent run', () => {
      const status = contentFlowService.getStatus('non-existent-run-id');
      expect(status).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle flow execution errors gracefully', async () => {
      const mockFlow = {
        stream: vi.fn().mockRejectedValue(new Error('LangGraph execution failed')),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Wait for error to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('LangGraph execution failed');
    });

    it('should emit error status on flow failure', async () => {
      const mockFlow = {
        stream: vi.fn().mockRejectedValue(new Error('Flow crashed')),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Wait for error emission
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'feature:progress',
        expect.objectContaining({
          type: 'content-flow',
          status: 'failed',
          error: 'Flow crashed',
        })
      );
    });

    it('should handle streaming errors mid-flow', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { generate_queries: { progress: 5 } };
            throw new Error('Stream interrupted');
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic');

      // Wait for stream error
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('failed');
      expect(status?.error).toContain('Stream interrupted');
    });

    it('should handle model initialization errors', async () => {
      // This test verifies error handling when models can't be created
      // In practice, this would be a ChatAnthropic constructor failure
      // For this test, we'll simulate a flow creation failure
      vi.mocked(createContentCreationFlow).mockImplementation(() => {
        throw new Error('Model initialization failed');
      });

      await expect(contentFlowService.startFlow('/test/path', 'Test Topic')).rejects.toThrow(
        'Model initialization failed'
      );
    });
  });

  describe('HITL mode', () => {
    it('should create flow with HITL enabled when requested', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { research_review: {} };
          },
        }),
        getState: vi.fn().mockResolvedValue({
          next: ['research_hitl'],
          values: {},
        }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic', {
        enableHITL: true,
      });

      // Wait for interrupt
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('interrupted');
      expect(status?.hitlGatesPending).toContain('research_hitl');
    });

    it('should handle autonomous mode (no interrupts)', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      const { runId } = await contentFlowService.startFlow('/test/path', 'Test Topic', {
        enableHITL: false,
      });

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = contentFlowService.getStatus(runId);
      expect(status).toBeDefined();
      expect(status?.status).toBe('completed');
      expect(status?.hitlGatesPending).toHaveLength(0);
    });
  });

  describe('execution state tracking', () => {
    it('should track active flows', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            // Never complete - keep running
            await new Promise(() => {});
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      await contentFlowService.startFlow('/test/path', 'Topic 1');
      await contentFlowService.startFlow('/test/path', 'Topic 2');

      // Give flows time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = contentFlowService.getExecutionState();
      expect(state.totalActive).toBe(2);
      expect(state.activeFlows).toHaveLength(2);
    });

    it('should track completed flows in recent history', async () => {
      const mockFlow = {
        stream: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            yield { complete: { status: 'done' } };
          },
        }),
        getState: vi.fn().mockResolvedValue({ next: [] }),
      };

      vi.mocked(createContentCreationFlow).mockReturnValue(mockFlow as any);

      await contentFlowService.startFlow('/test/path', 'Topic 1');

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 100));

      const state = contentFlowService.getExecutionState();
      expect(state.totalActive).toBe(0);
      expect(state.recentFlows).toHaveLength(1);
      expect(state.recentFlows[0].status).toBe('completed');
    });
  });
});
