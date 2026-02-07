/**
 * Tests for authority agent utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAgentState,
  withProcessingGuard,
  initializeAgent,
  registerEventListener,
  type AgentState,
} from '../../../../src/services/authority-agents/agent-utils.js';
import type { AuthorityAgent } from '@automaker/types';

describe('agent-utils', () => {
  describe('createAgentState', () => {
    it('should create state with empty collections', () => {
      const state = createAgentState();

      expect(state.agents).toBeInstanceOf(Map);
      expect(state.initializedProjects).toBeInstanceOf(Set);
      expect(state.processing).toBeInstanceOf(Set);
      expect(state.agents.size).toBe(0);
      expect(state.initializedProjects.size).toBe(0);
      expect(state.processing.size).toBe(0);
    });

    it('should accept custom state', () => {
      interface CustomState {
        pollTimers: Map<string, NodeJS.Timeout>;
        escalatedBlockers: Set<string>;
      }

      const state = createAgentState<CustomState>({
        pollTimers: new Map(),
        escalatedBlockers: new Set(['blocker-1']),
      });

      expect(state.custom.pollTimers).toBeInstanceOf(Map);
      expect(state.custom.escalatedBlockers).toBeInstanceOf(Set);
      expect(state.custom.escalatedBlockers.has('blocker-1')).toBe(true);
    });

    it('should provide getAgent method', () => {
      const state = createAgentState();
      const mockAgent = { id: 'agent-1', role: 'product-manager' } as AuthorityAgent;

      state.agents.set('/project', mockAgent);

      expect(state.getAgent('/project')).toBe(mockAgent);
      expect(state.getAgent('/other')).toBe(null);
    });

    it('should provide isInitialized method', () => {
      const state = createAgentState();

      expect(state.isInitialized('/project')).toBe(false);

      state.initializedProjects.add('/project');

      expect(state.isInitialized('/project')).toBe(true);
    });

    it('should provide isProcessing method', () => {
      const state = createAgentState();

      expect(state.isProcessing('feature-1')).toBe(false);

      state.processing.add('feature-1');

      expect(state.isProcessing('feature-1')).toBe(true);
    });

    it('should provide markInitialized and removeInitialized methods', () => {
      const state = createAgentState();

      state.markInitialized('/project');
      expect(state.isInitialized('/project')).toBe(true);

      state.removeInitialized('/project');
      expect(state.isInitialized('/project')).toBe(false);
    });
  });

  describe('withProcessingGuard', () => {
    let state: AgentState;

    beforeEach(() => {
      state = createAgentState();
    });

    it('should execute function when not already processing', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');

      const result = await withProcessingGuard(state, 'id-1', mockFn);

      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledOnce();
      expect(state.isProcessing('id-1')).toBe(false); // Cleaned up after execution
    });

    it('should block duplicate processing', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');

      // Add to processing set manually
      state.processing.add('id-1');

      const result = await withProcessingGuard(state, 'id-1', mockFn);

      expect(result).toBeUndefined();
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should clean up processing set even if function throws', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      await expect(withProcessingGuard(state, 'id-1', mockFn)).rejects.toThrow('Test error');

      expect(state.isProcessing('id-1')).toBe(false); // Cleaned up despite error
    });

    it('should support concurrent guards with different IDs', async () => {
      const mockFn1 = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 50)));
      const mockFn2 = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 50)));

      // Execute both in parallel
      const [result1, result2] = await Promise.all([
        withProcessingGuard(state, 'id-1', mockFn1),
        withProcessingGuard(state, 'id-2', mockFn2),
      ]);

      expect(mockFn1).toHaveBeenCalledOnce();
      expect(mockFn2).toHaveBeenCalledOnce();
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
      expect(state.processing.size).toBe(0);
    });

    it('should respect custom log options', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      state.processing.add('id-1');

      // Disable logging
      await withProcessingGuard(state, 'id-1', mockFn, { logBlocked: false });

      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe('initializeAgent', () => {
    let state: AgentState;
    let mockAuthorityService: {
      registerAgent: ReturnType<typeof vi.fn>;
    };
    let mockAgent: AuthorityAgent;

    beforeEach(() => {
      state = createAgentState();
      mockAgent = {
        id: 'agent-1',
        role: 'product-manager',
        projectPath: '/project',
        trustLevel: 'high',
      } as AuthorityAgent;
      mockAuthorityService = {
        registerAgent: vi.fn().mockResolvedValue(mockAgent),
      };
    });

    it('should initialize agent for project', async () => {
      const agent = await initializeAgent(
        state,
        mockAuthorityService,
        'product-manager',
        '/project'
      );

      expect(agent).toBe(mockAgent);
      expect(mockAuthorityService.registerAgent).toHaveBeenCalledWith(
        'product-manager',
        '/project'
      );
      expect(state.getAgent('/project')).toBe(mockAgent);
      expect(state.isInitialized('/project')).toBe(true);
    });

    it('should skip if already initialized', async () => {
      // First initialization
      await initializeAgent(state, mockAuthorityService, 'product-manager', '/project');

      // Reset mock
      mockAuthorityService.registerAgent.mockClear();

      // Second initialization should skip
      const agent = await initializeAgent(
        state,
        mockAuthorityService,
        'product-manager',
        '/project'
      );

      expect(agent).toBe(mockAgent);
      expect(mockAuthorityService.registerAgent).not.toHaveBeenCalled();
    });

    it('should call custom setup function', async () => {
      const setupFn = vi.fn().mockResolvedValue(undefined);

      await initializeAgent(state, mockAuthorityService, 'product-manager', '/project', setupFn);

      expect(setupFn).toHaveBeenCalledWith(mockAgent);
    });

    it('should throw if project marked initialized but no agent found', async () => {
      // Mark as initialized but don't add agent
      state.markInitialized('/project');

      await expect(
        initializeAgent(state, mockAuthorityService, 'product-manager', '/project')
      ).rejects.toThrow('Project /project marked initialized but no agent found');
    });

    it('should support skipIfInitialized=false option', async () => {
      // First initialization
      await initializeAgent(state, mockAuthorityService, 'product-manager', '/project');

      // Reset mock
      mockAuthorityService.registerAgent.mockClear();

      // Second initialization with skipIfInitialized=false should re-register
      await initializeAgent(state, mockAuthorityService, 'product-manager', '/project', undefined, {
        skipIfInitialized: false,
      });

      expect(mockAuthorityService.registerAgent).toHaveBeenCalled();
    });
  });

  describe('registerEventListener', () => {
    let state: AgentState;
    let listenerRegistered: boolean;
    let mockEvents: {
      subscribe: ReturnType<typeof vi.fn>;
    };
    let mockInitialize: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      state = createAgentState();
      listenerRegistered = false;
      mockEvents = {
        subscribe: vi.fn(),
      };
      mockInitialize = vi.fn().mockResolvedValue(undefined);
    });

    it('should register event listener', () => {
      const mockHandler = vi.fn();

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        mockHandler,
        mockInitialize
      );

      expect(mockEvents.subscribe).toHaveBeenCalledWith('test:event', expect.any(Function));
      expect(listenerRegistered).toBe(true);
    });

    it('should skip if already registered', () => {
      listenerRegistered = true;

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        vi.fn(),
        mockInitialize
      );

      expect(mockEvents.subscribe).not.toHaveBeenCalled();
    });

    it('should auto-initialize projects from event data', async () => {
      const mockHandler = vi.fn();
      let subscribedHandler: ((data: unknown) => void | Promise<void>) | undefined;

      mockEvents.subscribe.mockImplementation((event, handler) => {
        subscribedHandler = handler;
      });

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        mockHandler,
        mockInitialize
      );

      // Simulate event
      const eventData = { projectPath: '/project', featureId: 'feature-1' };
      await subscribedHandler?.(eventData);

      expect(mockInitialize).toHaveBeenCalledWith('/project');
      expect(mockHandler).toHaveBeenCalledWith(eventData);
    });

    it('should skip auto-initialize if project already initialized', async () => {
      const mockHandler = vi.fn();
      let subscribedHandler: ((data: unknown) => void | Promise<void>) | undefined;

      mockEvents.subscribe.mockImplementation((event, handler) => {
        subscribedHandler = handler;
      });

      // Mark project as initialized
      state.markInitialized('/project');

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        mockHandler,
        mockInitialize
      );

      // Simulate event
      const eventData = { projectPath: '/project', featureId: 'feature-1' };
      await subscribedHandler?.(eventData);

      expect(mockInitialize).not.toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(eventData);
    });

    it('should support custom project path extractor', async () => {
      const mockHandler = vi.fn();
      let subscribedHandler: ((data: unknown) => void | Promise<void>) | undefined;

      mockEvents.subscribe.mockImplementation((event, handler) => {
        subscribedHandler = handler;
      });

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        mockHandler,
        mockInitialize,
        {
          getProjectPath: (event: unknown) => (event as { customPath?: string }).customPath,
        }
      );

      // Simulate event with custom path field
      const eventData = { customPath: '/custom-project', featureId: 'feature-1' };
      await subscribedHandler?.(eventData);

      expect(mockInitialize).toHaveBeenCalledWith('/custom-project');
    });

    it('should support event filter', async () => {
      const mockHandler = vi.fn();
      let subscribedHandler: ((data: unknown) => void | Promise<void>) | undefined;

      mockEvents.subscribe.mockImplementation((event, handler) => {
        subscribedHandler = handler;
      });

      registerEventListener(
        state,
        () => listenerRegistered,
        (val) => {
          listenerRegistered = val;
        },
        mockEvents,
        'test:event',
        mockHandler,
        mockInitialize,
        {
          filter: (event: unknown) => (event as { enabled?: boolean }).enabled === true,
        }
      );

      // Simulate filtered-out event
      await subscribedHandler?.({ projectPath: '/project', enabled: false });
      expect(mockHandler).not.toHaveBeenCalled();

      // Simulate filtered-in event
      state.markInitialized('/project'); // Skip auto-init
      await subscribedHandler?.({ projectPath: '/project', enabled: true });
      expect(mockHandler).toHaveBeenCalledOnce();
    });
  });
});
