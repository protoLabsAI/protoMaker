/**
 * Signal Intake Service Unit Tests
 *
 * Tests for signal classification and routing:
 * - Signal classification (ops vs gtm)
 * - GTM toggle enforcement (gtmEnabled=false forces ops)
 * - Deduplication logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalIntakeService } from '../../../src/services/signal-intake-service.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { Feature, ProjectSettings } from '@protolabsai/types';
import {
  createMockEventEmitter,
  createMockFeatureLoader,
  createMockSettingsService,
} from '../../helpers/mock-factories.js';

// Test data factories
const createTestSignal = (overrides: any = {}) => ({
  source: 'github',
  content: 'Test signal content',
  author: {
    id: 'test-author-123',
    name: 'Test Author',
  },
  channelContext: {},
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('SignalIntakeService', () => {
  let signalIntakeService: SignalIntakeService;
  let mockEmitter: EventEmitter;
  let mockFeatureLoader: FeatureLoader;
  let mockSettingsService: SettingsService;

  beforeEach(() => {
    mockEmitter = createMockEventEmitter() as unknown as EventEmitter;
    mockFeatureLoader = createMockFeatureLoader([], {
      create: vi.fn().mockResolvedValue({
        id: 'feature-signal-test',
        title: 'Test Signal Feature',
        status: 'backlog',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    }) as unknown as FeatureLoader;
    mockSettingsService = createMockSettingsService({
      getGlobalSettings: vi.fn().mockResolvedValue({ gtmEnabled: true }),
    }) as unknown as SettingsService;

    signalIntakeService = new SignalIntakeService(
      mockEmitter,
      mockFeatureLoader,
      '/test/path',
      mockSettingsService
    );

    vi.clearAllMocks();
  });

  describe('signal classification - ops vs gtm', () => {
    it('should classify GitHub signals as ops', async () => {
      const signal = createTestSignal({
        source: 'github',
        content: 'Bug fix needed',
      });

      mockEmitter.emit('signal:received', signal);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:idea-injected',
        expect.objectContaining({
          projectPath: '/test/path',
        })
      );

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('GitHub events'),
        })
      );

      // Should NOT route to GTM
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );
    });

    it('should classify Discord messages from GTM channels as gtm', async () => {
      const signal = createTestSignal({
        source: 'discord',
        content: 'Social media post needed',
        channelContext: {
          channelName: 'marketing-ideas',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GTM routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'gtm',
          reason: expect.stringContaining('Discord channel is GTM: marketing'),
        })
      );
    });

    it('should classify Discord messages from ops channels as ops', async () => {
      const signal = createTestSignal({
        source: 'discord',
        content: 'Infrastructure issue',
        channelContext: {
          channelName: 'engineering-chat',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith('authority:idea-injected', expect.any(Object));

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('Discord channel is Ops: engineering'),
        })
      );
    });

    it('should default Discord messages from unknown channels to ops', async () => {
      const signal = createTestSignal({
        source: 'discord',
        content: 'General discussion',
        channelContext: {
          channelName: 'general',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify ops routing (default)
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('defaults to Ops'),
        })
      );
    });

    it('should classify MCP create_feature as ops', async () => {
      const signal = createTestSignal({
        source: 'mcp:create_feature',
        content: 'New feature request',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('MCP create_feature is engineering'),
        })
      );
    });

    it('should classify UI content signals as gtm', async () => {
      const signal = createTestSignal({
        source: 'ui:content',
        content: 'Blog post idea',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GTM routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'gtm',
          reason: expect.stringContaining('Content creation signal from UI'),
        })
      );
    });
  });

  describe('gtmEnabled toggle', () => {
    it('should force all signals to ops when gtmEnabled=false', async () => {
      // Mock GTM disabled
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
      });

      // Create service with updated settings
      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      // Try a signal that would normally be GTM
      const signal = createTestSignal({
        source: 'ui:content',
        content: 'Marketing campaign',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify forced ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('GTM pipeline disabled'),
        })
      );

      // Should NOT route to GTM
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );
    });

    it('should force Discord GTM channels to ops when gtmEnabled=false', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
      });

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'discord',
        content: 'Marketing idea',
        channelContext: {
          channelName: 'marketing-team',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify forced ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('GTM pipeline disabled'),
        })
      );
    });

    it('should force UI content signals to ops when gtmEnabled=false', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
      });

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'ui:content',
        content: 'Blog post needed',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify forced ops routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'ops',
          reason: expect.stringContaining('GTM pipeline disabled'),
        })
      );

      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );
    });

    it('should allow GTM routing when gtmEnabled=true', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: true,
      });

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'ui:content',
        content: 'Content idea',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GTM routing allowed
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'gtm',
        })
      );
    });
  });

  describe('deduplication logic', () => {
    it('should prevent duplicate GitHub signals by event ID', async () => {
      const signal = createTestSignal({
        source: 'github',
        author: {
          id: 'event-456',
          name: 'GitHub Event',
        },
        content: 'Issue created',
      });

      // Send same signal twice
      mockEmitter.emit('signal:received', signal);
      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Feature should only be created once
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
    });

    it('should prevent duplicate Discord signals by author ID', async () => {
      const signal = createTestSignal({
        source: 'discord',
        author: {
          id: 'message-789',
          name: 'Discord User',
        },
        content: 'Feature request',
      });

      // Send same signal twice
      mockEmitter.emit('signal:received', signal);
      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Feature should only be created once
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
    });

    it('should allow duplicate UI signals with different timestamps', async () => {
      const signal1 = createTestSignal({
        source: 'ui:content',
        timestamp: '2026-02-01T10:00:00Z',
        content: 'First submission',
      });

      const signal2 = createTestSignal({
        source: 'ui:content',
        timestamp: '2026-02-01T11:00:00Z',
        content: 'Second submission',
      });

      mockEmitter.emit('signal:received', signal1);
      await new Promise((resolve) => setTimeout(resolve, 30));

      mockEmitter.emit('signal:received', signal2);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Both should be processed (different timestamps)
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );
    });

    it('should allow duplicate MCP signals with different timestamps', async () => {
      const signal1 = createTestSignal({
        source: 'mcp:create_feature',
        timestamp: '2026-02-01T10:00:00Z',
        content: 'First feature',
      });

      const signal2 = createTestSignal({
        source: 'mcp:create_feature',
        timestamp: '2026-02-01T11:00:00Z',
        content: 'Second feature',
      });

      mockEmitter.emit('signal:received', signal1);
      await new Promise((resolve) => setTimeout(resolve, 30));

      mockEmitter.emit('signal:received', signal2);
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Both should be processed (different timestamps)
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate by unique key (source + author/timestamp)', async () => {
      // Same source, same author ID - should dedupe
      const signal1 = createTestSignal({
        source: 'discord',
        author: { id: 'issue-123', name: 'Test' },
        content: 'Bug A',
      });

      // Different author ID - should NOT dedupe
      const signal2 = createTestSignal({
        source: 'discord',
        author: { id: 'issue-456', name: 'Test' },
        content: 'Bug B',
      });

      mockEmitter.emit('signal:received', signal1);
      mockEmitter.emit('signal:received', signal1); // Duplicate
      mockEmitter.emit('signal:received', signal2); // Different

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should create 2 features (signal1 once, signal2 once)
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('signal statistics', () => {
    it('should track signal counts by source', async () => {
      const githubSignal = createTestSignal({
        source: 'github',
        author: { id: 'github-1', name: 'Test' },
      });

      const discordSignal = createTestSignal({
        source: 'discord',
        author: { id: 'discord-1', name: 'Test' },
      });

      const mcpSignal = createTestSignal({
        source: 'mcp:create_feature',
        author: { id: 'mcp-1', name: 'Test' },
      });

      mockEmitter.emit('signal:received', githubSignal);
      mockEmitter.emit('signal:received', discordSignal);
      mockEmitter.emit('signal:received', mcpSignal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = signalIntakeService.getStatus();
      expect(status.signalCounts.github).toBe(1);
      expect(status.signalCounts.discord).toBe(1);
    });

    it('should track last signal timestamp', async () => {
      const timestamp = '2026-02-24T10:00:00Z';
      const signal = createTestSignal({
        timestamp,
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = signalIntakeService.getStatus();
      expect(status.lastSignalAt).toBe(timestamp);
      expect(status.active).toBe(true);
    });

    it('should return active status', () => {
      const status = signalIntakeService.getStatus();
      expect(status.active).toBe(true);
    });
  });

  describe('GTM signal → feature creation → pipeline initiation path', () => {
    it('should create a feature with workItemState idea and route through signal pipeline', async () => {
      const createdFeature = {
        id: 'gtm-feature-456',
        title: '[discord] Marketing campaign needed',
        status: 'backlog',
        workItemState: 'idea',
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(createdFeature as Feature);

      const signal = createTestSignal({
        source: 'discord',
        content: 'Marketing campaign needed',
        channelContext: {
          labels: ['marketing'],
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Feature should be created with workItemState: 'idea'
      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/path',
        expect.objectContaining({
          workItemState: 'idea',
          status: 'backlog',
        })
      );

      // signal:routed must include featureId and projectPath
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          featureId: 'gtm-feature-456',
          projectPath: '/test/path',
        })
      );
    });

    it('should include featureId in signal:routed event for GTM signals', async () => {
      const createdFeature = {
        id: 'gtm-feature-789',
        title: '[ui:content] Blog post idea',
        status: 'backlog',
        workItemState: 'idea',
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(createdFeature as Feature);

      const signal = createTestSignal({
        source: 'ui:content',
        content: 'Blog post idea',
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          featureId: 'gtm-feature-789',
          category: 'gtm',
        })
      );
    });
  });

  describe('recent signals ring buffer', () => {
    it('should add an entry with status pending when a signal is received', async () => {
      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-1', name: 'Dev' },
        content: 'Fix the bug now',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const recent = signalIntakeService.getRecentSignals();
      expect(recent).toHaveLength(1);
      expect(recent[0]).toMatchObject({
        channel: 'github',
        intent: 'work_order',
        preview: 'Fix the bug now',
        status: 'created',
        featureId: 'feature-signal-test',
      });
      expect(recent[0].id).toBeTruthy();
      expect(recent[0].createdAt).toBeTruthy();
    });

    it('should set status to created with featureId after ops feature creation', async () => {
      vi.mocked(mockFeatureLoader.create).mockResolvedValue({
        id: 'ring-feature-99',
        title: 'Test',
        status: 'backlog',
      } as any);

      const signal = createTestSignal({
        source: 'discord',
        author: { id: 'disc-99', name: 'Dev' },
        content: 'New ops work',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const recent = signalIntakeService.getRecentSignals();
      const entry = recent[0];
      expect(entry.status).toBe('created');
      expect(entry.featureId).toBe('ring-feature-99');
    });

    it('should return signals newest-first', async () => {
      for (let i = 0; i < 3; i++) {
        const signal = createTestSignal({
          source: 'github',
          author: { id: `gh-${i}`, name: `Dev ${i}` },
          content: `Signal ${i}`,
        });
        mockEmitter.emit('signal:received', signal);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const recent = signalIntakeService.getRecentSignals();
      expect(recent).toHaveLength(3);
      // Newest (Signal 2) should be first
      expect(recent[0].preview).toBe('Signal 2');
      expect(recent[2].preview).toBe('Signal 0');
    });

    it('should cap the ring buffer at 200 entries', async () => {
      // Send 210 unique signals
      for (let i = 0; i < 210; i++) {
        const signal = createTestSignal({
          source: 'github',
          author: { id: `gh-${i}`, name: `Dev` },
          content: `Signal ${i}`,
        });
        mockEmitter.emit('signal:received', signal);
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const recent = signalIntakeService.getRecentSignals();
      expect(recent.length).toBeLessThanOrEqual(200);
    });

    it('should preview only the first 120 characters of content', async () => {
      const longContent = 'A'.repeat(200);
      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-long', name: 'Dev' },
        content: longContent,
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const recent = signalIntakeService.getRecentSignals();
      expect(recent[0].preview).toHaveLength(120);
    });

    it('should set status to dismissed for interrupt signals', async () => {
      const signal = createTestSignal({
        source: 'discord',
        author: { id: 'disc-urgent', name: 'Ops' },
        content: 'URGENT: production is down',
        channelContext: { channelName: 'incidents-urgent' },
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const recent = signalIntakeService.getRecentSignals();
      expect(recent[0].status).toBe('dismissed');
      expect(recent[0].intent).toBe('interrupt');
    });
  });

  describe('portfolio gate', () => {
    beforeEach(() => {
      // Fresh emitter to avoid double-subscribe from outer beforeEach
      mockEmitter = createMockEventEmitter() as unknown as EventEmitter;
      vi.clearAllMocks();
    });

    it('should pass signals through when gate is disabled (default)', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: false,
      });

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-1', name: 'Dev' },
        content: 'New feature idea',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
      expect(mockEmitter.emit).toHaveBeenCalledWith('authority:idea-injected', expect.any(Object));
    });

    it('should pass signals through when gate is enabled and under capacity', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      // Return only a few features (under threshold of 50)
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue([
        { id: 'f1', title: 'Existing feature', status: 'backlog' },
        { id: 'f2', title: 'Another feature', status: 'done' },
      ] as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-2', name: 'Dev' },
        content: 'Completely unique idea',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
      expect(mockEmitter.emit).toHaveBeenCalledWith('authority:idea-injected', expect.any(Object));
    });

    it('should defer signals when gate is enabled and over capacity', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      // Generate 50 active features to exceed threshold
      const activeFeatures = Array.from({ length: 50 }, (_, i) => ({
        id: `f-${i}`,
        title: `Feature ${i}`,
        status: i % 2 === 0 ? 'backlog' : 'in_progress',
      }));
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(activeFeatures as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-3', name: 'Dev' },
        content: 'New signal over capacity',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT create a feature (deferred)
      expect(mockFeatureLoader.create).not.toHaveBeenCalled();

      // Should be in deferred queue
      const deferred = signalIntakeService.getDeferredQueue();
      expect(deferred).toHaveLength(1);
      expect(deferred[0].reason).toContain('Capacity exceeded');
    });

    it('should block duplicate signals when gate is enabled', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue([
        { id: 'f-existing', title: 'Add user authentication', status: 'backlog' },
      ] as any);

      const blockedFeature = {
        id: 'blocked-feat-1',
        title: '[github] Add user authentication',
        status: 'blocked',
        statusChangeReason: 'Duplicate of: Add user authentication',
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(blockedFeature as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-4', name: 'Dev' },
        content: 'Add user authentication',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should create a blocked feature
      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/path',
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: expect.stringContaining('Duplicate of:'),
        })
      );
    });

    it('should defer architectural signals when error budget is exceeded', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      // Create features with high failure rate (> 30%)
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue([
        { id: 'f1', title: 'Feature A', status: 'done', failureCount: 2 },
        { id: 'f2', title: 'Feature B', status: 'done', failureCount: 1 },
        { id: 'f3', title: 'Feature C', status: 'done', failureCount: 0 },
      ] as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-5', name: 'Dev' },
        content: 'Infrastructure migration needed',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT create a feature (deferred due to error budget)
      expect(mockFeatureLoader.create).not.toHaveBeenCalled();

      const deferred = signalIntakeService.getDeferredQueue();
      expect(deferred).toHaveLength(1);
      expect(deferred[0].reason).toContain('Error budget exceeded');
    });

    it('should bypass gate for interrupt signals even when enabled', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      // Over capacity
      const activeFeatures = Array.from({ length: 60 }, (_, i) => ({
        id: `f-${i}`,
        title: `Feature ${i}`,
        status: 'backlog',
      }));
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(activeFeatures as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'discord',
        author: { id: 'disc-gate-1', name: 'Ops' },
        content: 'URGENT: system outage',
        channelContext: { channelName: 'incidents-urgent' },
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Interrupt should bypass gate entirely
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          reason: 'interrupt intent bypasses PM pipeline',
        })
      );
      // Should NOT be deferred
      expect(signalIntakeService.getDeferredQueue()).toHaveLength(0);
    });

    it('should return deferred signals via getDeferredQueue', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      const activeFeatures = Array.from({ length: 50 }, (_, i) => ({
        id: `f-${i}`,
        title: `Feature ${i}`,
        status: 'backlog',
      }));
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(activeFeatures as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal1 = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-6', name: 'Dev' },
        content: 'First deferred signal',
      });
      const signal2 = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-7', name: 'Dev' },
        content: 'Second deferred signal',
      });

      mockEmitter.emit('signal:received', signal1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      mockEmitter.emit('signal:received', signal2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const deferred = signalIntakeService.getDeferredQueue();
      expect(deferred).toHaveLength(2);
      expect(deferred[0].title).toBe('First deferred signal');
      expect(deferred[1].title).toBe('Second deferred signal');
    });

    it('should set statusChangeReason on blocked features', async () => {
      vi.mocked(mockSettingsService.getGlobalSettings).mockResolvedValue({
        gtmEnabled: false,
        portfolioGate: true,
      });
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue([
        { id: 'f-dup', title: 'Fix login page', status: 'in_progress' },
      ] as any);

      const blockedFeature = {
        id: 'blocked-feat-2',
        title: '[github] Fix login page',
        status: 'blocked',
        statusChangeReason: 'Duplicate of: Fix login page',
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(blockedFeature as any);

      signalIntakeService = new SignalIntakeService(
        mockEmitter,
        mockFeatureLoader,
        '/test/path',
        mockSettingsService
      );

      const signal = createTestSignal({
        source: 'github',
        author: { id: 'gh-gate-8', name: 'Dev' },
        content: 'Fix login page',
      });

      mockEmitter.emit('signal:received', signal);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/path',
        expect.objectContaining({
          status: 'blocked',
          statusChangeReason: 'Duplicate of: Fix login page',
        })
      );
    });
  });

  describe('submitSignal public API', () => {
    it('should allow manual signal submission via public API', () => {
      const emitSpy = vi.spyOn(mockEmitter, 'emit');

      signalIntakeService.submitSignal({
        source: 'ui:manual',
        content: 'Manual signal',
        projectPath: '/custom/path',
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'signal:received',
        expect.objectContaining({
          source: 'ui:manual',
          content: 'Manual signal',
          channelContext: expect.objectContaining({
            projectPath: '/custom/path',
          }),
        })
      );
    });

    it('should enrich signal with file attachments', () => {
      const emitSpy = vi.spyOn(mockEmitter, 'emit');

      signalIntakeService.submitSignal({
        source: 'ui:manual',
        content: 'Signal with files',
        files: ['file1.txt', 'file2.js'],
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'signal:received',
        expect.objectContaining({
          content: expect.stringContaining('## Attached Files'),
        })
      );
    });

    it('should enrich signal with image attachments', () => {
      const emitSpy = vi.spyOn(mockEmitter, 'emit');

      signalIntakeService.submitSignal({
        source: 'ui:manual',
        content: 'Signal with images',
        images: ['img1.png', 'img2.jpg'],
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'signal:received',
        expect.objectContaining({
          content: expect.stringContaining('## Attached Images'),
        })
      );
    });
  });
});
