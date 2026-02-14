import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubLinearBridgeService } from '@/services/github-linear-bridge-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { Feature } from '@automaker/types';

// Mock the LinearMCPClient
vi.mock('@/services/linear-mcp-client.js', () => ({
  LinearMCPClient: vi.fn().mockImplementation(() => ({
    addComment: vi.fn().mockResolvedValue(true),
  })),
}));

describe('GitHubLinearBridgeService', () => {
  let bridge: GitHubLinearBridgeService;
  let mockEmitter: EventEmitter;
  let mockFeatureLoader: FeatureLoader;
  let mockSettingsService: SettingsService;
  let eventCallbacks: Array<(type: string, payload: unknown) => void>;

  const mockFeature: Partial<Feature> = {
    id: 'feat-123',
    title: 'Test Feature',
    status: 'review',
    branchName: 'feature/test-branch',
    linearIssueId: 'linear-issue-456',
  };

  beforeEach(() => {
    eventCallbacks = [];

    mockEmitter = {
      emit: vi.fn(),
      subscribe: vi.fn((callback) => {
        eventCallbacks.push(callback);
        return () => {
          const idx = eventCallbacks.indexOf(callback);
          if (idx >= 0) eventCallbacks.splice(idx, 1);
        };
      }),
    };

    mockFeatureLoader = {
      get: vi.fn().mockResolvedValue(mockFeature),
      getAll: vi.fn().mockResolvedValue([mockFeature]),
    } as unknown as FeatureLoader;

    mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        integrations: {
          linear: {
            enabled: true,
            agentToken: 'test-token',
          },
        },
      }),
    } as unknown as SettingsService;

    bridge = new GitHubLinearBridgeService();
    bridge.initialize(mockEmitter, mockFeatureLoader, mockSettingsService);
  });

  afterEach(() => {
    bridge.destroy();
    vi.clearAllMocks();
  });

  function emitEvent(type: string, payload: unknown): void {
    for (const cb of eventCallbacks) {
      cb(type, payload);
    }
  }

  describe('pr:changes-requested', () => {
    it('should post comment to Linear issue when changes requested', async () => {
      const { LinearMCPClient } = await import('@/services/linear-mcp-client.js');

      emitEvent('pr:changes-requested', {
        projectPath: '/test/project',
        featureId: 'feat-123',
        prNumber: 42,
        reviewers: ['alice', 'bob'],
        feedback: 'Please fix the type annotations',
      });

      // Wait for async handler
      await new Promise((r) => setTimeout(r, 50));

      expect(mockFeatureLoader.get).toHaveBeenCalledWith('/test/project', 'feat-123');
      expect(LinearMCPClient).toHaveBeenCalled();
    });

    it('should skip when feature has no linearIssueId', async () => {
      (mockFeatureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockFeature,
        linearIssueId: undefined,
      });

      const { LinearMCPClient } = await import('@/services/linear-mcp-client.js');

      emitEvent('pr:changes-requested', {
        projectPath: '/test/project',
        featureId: 'feat-123',
        prNumber: 42,
      });

      await new Promise((r) => setTimeout(r, 50));

      // Should still call get to check linearIssueId
      expect(mockFeatureLoader.get).toHaveBeenCalled();
      // But should NOT create a client or post comment
      const instances = (LinearMCPClient as unknown as ReturnType<typeof vi.fn>).mock.instances;
      if (instances.length > 0) {
        expect(instances[0].addComment).not.toHaveBeenCalled();
      }
    });

    it('should deduplicate within 5 minute window', async () => {
      const payload = {
        projectPath: '/test/project',
        featureId: 'feat-123',
        prNumber: 42,
        reviewers: ['alice'],
      };

      emitEvent('pr:changes-requested', payload);
      await new Promise((r) => setTimeout(r, 50));

      // Second event should be deduped
      emitEvent('pr:changes-requested', payload);
      await new Promise((r) => setTimeout(r, 50));

      // Feature should only be fetched once (dedup prevents second call)
      expect(mockFeatureLoader.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('pr:approved', () => {
    it('should post approval comment to Linear issue', async () => {
      const { LinearMCPClient } = await import('@/services/linear-mcp-client.js');

      emitEvent('pr:approved', {
        projectPath: '/test/project',
        featureId: 'feat-123',
        prNumber: 42,
        approvers: ['alice'],
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockFeatureLoader.get).toHaveBeenCalledWith('/test/project', 'feat-123');
      expect(LinearMCPClient).toHaveBeenCalled();
    });
  });

  describe('pr:ci-failure', () => {
    it('should post CI failure comment to Linear issue', async () => {
      const { LinearMCPClient } = await import('@/services/linear-mcp-client.js');

      emitEvent('pr:ci-failure', {
        projectPath: '/test/project',
        prNumber: 42,
        headBranch: 'feature/test-branch',
        featureId: 'feat-123',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockFeatureLoader.get).toHaveBeenCalled();
      expect(LinearMCPClient).toHaveBeenCalled();
    });

    it('should look up feature by branch when featureId is missing', async () => {
      emitEvent('pr:ci-failure', {
        projectPath: '/test/project',
        prNumber: 42,
        headBranch: 'feature/test-branch',
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockFeatureLoader.getAll).toHaveBeenCalledWith('/test/project');
    });

    it('should skip when no feature found for branch', async () => {
      (mockFeatureLoader.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      emitEvent('pr:ci-failure', {
        projectPath: '/test/project',
        prNumber: 42,
        headBranch: 'unknown-branch',
      });

      await new Promise((r) => setTimeout(r, 50));

      // Should call getAll to search by branch
      expect(mockFeatureLoader.getAll).toHaveBeenCalled();
      // But should NOT call get since no feature found
      expect(mockFeatureLoader.get).not.toHaveBeenCalled();
    });
  });

  describe('initialization', () => {
    it('should subscribe to events on initialize', () => {
      expect(mockEmitter.subscribe).toHaveBeenCalled();
    });

    it('should not initialize twice', () => {
      bridge.initialize(mockEmitter, mockFeatureLoader, mockSettingsService);
      // Subscribe should only be called once from the first init
      expect(mockEmitter.subscribe).toHaveBeenCalledTimes(1);
    });

    it('should clean up on destroy', () => {
      bridge.destroy();
      // Event callback should be removed
      expect(eventCallbacks).toHaveLength(0);
    });
  });
});
