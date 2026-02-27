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
import type { Feature, ProjectSettings } from '@protolabs-ai/types';

// Mock factories
const createMockEventEmitter = (): EventEmitter => {
  const listeners: Array<(type: string, payload: any) => void> = [];

  return {
    emit: vi.fn((type: string, payload: any) => {
      // Call all subscribed handlers with the event type and payload
      listeners.forEach((handler) => handler(type, payload));
    }),
    subscribe: vi.fn((handler: (type: string, payload: any) => void) => {
      listeners.push(handler);
      return () => {
        const index = listeners.indexOf(handler);
        if (index > -1) listeners.splice(index, 1);
      };
    }),
  } as unknown as EventEmitter;
};

const createMockFeatureLoader = (): FeatureLoader => {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'feature-123',
      title: 'Test Feature',
      status: 'backlog',
    }),
    findByLinearIssueId: vi.fn().mockResolvedValue(null),
  } as unknown as FeatureLoader;
};

const createMockSettingsService = (): SettingsService => {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      gtmEnabled: true,
    }),
  } as unknown as SettingsService;
};

// Test data factories
const createTestSignal = (overrides: any = {}) => ({
  source: 'linear',
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
    mockEmitter = createMockEventEmitter();
    mockFeatureLoader = createMockFeatureLoader();
    mockSettingsService = createMockSettingsService();

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
          reason: expect.stringContaining('GitHub'),
        })
      );

      // Should NOT route to GTM
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.any(Object)
      );
    });

    it('should classify Linear signals with GTM labels as gtm', async () => {
      const signal = createTestSignal({
        source: 'linear',
        content: 'Marketing campaign needed',
        channelContext: {
          labels: ['marketing', 'campaign'],
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify GTM routing
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
        expect.objectContaining({
          projectPath: '/test/path',
        })
      );

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'signal:routed',
        expect.objectContaining({
          category: 'gtm',
          reason: expect.stringContaining('GTM label'),
        })
      );

      // Should NOT route to ops
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'authority:idea-injected',
        expect.any(Object)
      );
    });

    it('should classify Linear signals with ops labels as ops', async () => {
      const signal = createTestSignal({
        source: 'linear',
        content: 'Bug fix needed',
        channelContext: {
          labels: ['bug', 'feature'],
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
          reason: expect.stringContaining('Ops label'),
        })
      );
    });

    it('should default Linear signals without labels to ops', async () => {
      const signal = createTestSignal({
        source: 'linear',
        content: 'Some task',
        channelContext: {
          labels: [],
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
          reason: expect.stringContaining('Discord channel is GTM'),
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
          reason: expect.stringContaining('Discord channel is Ops'),
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
          reason: expect.stringContaining('MCP create_feature'),
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
        source: 'linear',
        content: 'Marketing campaign',
        channelContext: {
          labels: ['marketing', 'content'],
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
    it('should prevent duplicate Linear signals by issue ID', async () => {
      const signal = createTestSignal({
        source: 'linear',
        author: {
          id: 'issue-123',
          name: 'Test Issue',
        },
        content: 'Bug report',
      });

      // Send same signal twice
      mockEmitter.emit('signal:received', signal);
      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Feature should only be created once
      expect(mockFeatureLoader.create).toHaveBeenCalledTimes(1);
    });

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
        source: 'linear',
        author: { id: 'issue-123', name: 'Test' },
        content: 'Bug A',
      });

      // Different author ID - should NOT dedupe
      const signal2 = createTestSignal({
        source: 'linear',
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

  describe('Linear integration guard', () => {
    it('should skip feature creation if Linear issue already exists', async () => {
      // Mock existing feature
      vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue({
        id: 'existing-feature-123',
        title: 'Existing Feature',
      } as Feature);

      const signal = createTestSignal({
        source: 'linear',
        channelContext: {
          issueId: 'LINEAR-123',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should NOT create a new feature
      expect(mockFeatureLoader.create).not.toHaveBeenCalled();
    });

    it('should create feature if Linear issue does not exist', async () => {
      // Mock no existing feature
      vi.mocked(mockFeatureLoader.findByLinearIssueId).mockResolvedValue(null);

      const signal = createTestSignal({
        source: 'linear',
        channelContext: {
          issueId: 'LINEAR-456',
        },
      });

      mockEmitter.emit('signal:received', signal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should create a new feature
      expect(mockFeatureLoader.create).toHaveBeenCalledWith(
        '/test/path',
        expect.objectContaining({
          workItemState: 'idea',
          linearIssueId: 'LINEAR-456',
        })
      );
    });
  });

  describe('signal statistics', () => {
    it('should track signal counts by source', async () => {
      const linearSignal = createTestSignal({
        source: 'linear',
        author: { id: 'linear-1', name: 'Test' },
      });

      const githubSignal = createTestSignal({
        source: 'github',
        author: { id: 'github-1', name: 'Test' },
      });

      const discordSignal = createTestSignal({
        source: 'discord',
        author: { id: 'discord-1', name: 'Test' },
      });

      mockEmitter.emit('signal:received', linearSignal);
      mockEmitter.emit('signal:received', githubSignal);
      mockEmitter.emit('signal:received', discordSignal);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const status = signalIntakeService.getStatus();
      expect(status.signalCounts.linear).toBe(1);
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
    it('should create a feature with workItemState idea before emitting authority:gtm-signal-received', async () => {
      const createdFeature = {
        id: 'gtm-feature-456',
        title: '[linear] Marketing campaign needed',
        status: 'backlog',
        workItemState: 'idea',
      };
      vi.mocked(mockFeatureLoader.create).mockResolvedValue(createdFeature as Feature);

      const signal = createTestSignal({
        source: 'linear',
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

      // authority:gtm-signal-received must include featureId and projectPath
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'authority:gtm-signal-received',
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
