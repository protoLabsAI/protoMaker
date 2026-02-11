/**
 * Ceremony Service Unit Tests
 *
 * Tests for milestone completion ceremony generation:
 * - Milestone update content generation
 * - Message splitting at 2000 character limit
 * - Config loading (enabled/disabled)
 * - Channel override functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CeremonyService } from '../../../src/services/ceremony-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { ProjectService } from '../../../src/services/project-service.js';
import type { Feature, Project, CeremonySettings, ProjectSettings } from '@automaker/types';

// Mock dependencies
const createMockSettingsService = (): SettingsService => {
  return {
    getProjectSettings: vi.fn(),
  } as unknown as SettingsService;
};

const createMockFeatureLoader = (): FeatureLoader => {
  return {
    getAll: vi.fn(),
  } as unknown as FeatureLoader;
};

const createMockProjectService = (): ProjectService => {
  return {
    getProject: vi.fn(),
  } as unknown as ProjectService;
};

// Test data factories
const createTestFeature = (overrides: Partial<Feature> = {}): Feature => ({
  id: 'feature-123',
  title: 'Test Feature',
  description: 'A test feature',
  status: 'done',
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
  prUrl: 'https://github.com/test/repo/pull/123',
  prNumber: 123,
  costUsd: 1.5,
  startedAt: '2026-02-09T00:00:00.000Z',
  milestoneSlug: 'milestone-1',
  ...overrides,
});

const createTestProject = (overrides: Partial<Project> = {}): Project => ({
  title: 'Test Project',
  slug: 'test-project',
  goal: 'Test project goal',
  status: 'active',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
  milestones: [
    {
      number: 1,
      slug: 'milestone-1',
      title: 'Foundation',
      description: 'Core infrastructure',
      phases: [
        {
          title: 'Phase 1',
          description: 'First phase',
          filesToModify: [],
          acceptanceCriteria: [],
          complexity: 'small',
        },
      ],
    },
    {
      number: 2,
      slug: 'milestone-2',
      title: 'Features',
      description: 'Main features',
      phases: [
        {
          title: 'Phase 2',
          description: 'Second phase',
          filesToModify: [],
          acceptanceCriteria: [],
          complexity: 'medium',
        },
      ],
    },
  ],
  ...overrides,
});

describe('CeremonyService', () => {
  let ceremonyService: CeremonyService;
  let emitter: EventEmitter;
  let mockSettingsService: SettingsService;
  let mockFeatureLoader: FeatureLoader;
  let mockProjectService: ProjectService;

  beforeEach(() => {
    ceremonyService = new CeremonyService();
    emitter = createEventEmitter();
    mockSettingsService = createMockSettingsService();
    mockFeatureLoader = createMockFeatureLoader();
    mockProjectService = createMockProjectService();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with dependencies', () => {
      expect(() => {
        ceremonyService.initialize(
          emitter,
          mockSettingsService,
          mockFeatureLoader,
          mockProjectService
        );
      }).not.toThrow();
    });

    it('should subscribe to milestone:completed events on initialization', () => {
      const subscribeSpy = vi.spyOn(emitter, 'subscribe');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      expect(subscribeSpy).toHaveBeenCalledOnce();
    });

    it('should cleanup subscriptions on destroy', () => {
      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      expect(() => {
        ceremonyService.destroy();
      }).not.toThrow();
    });
  });

  describe('config loading', () => {
    it('should skip ceremony when config is disabled', async () => {
      // Setup: ceremonies disabled
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: false,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
      };

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      // Trigger milestone:completed event
      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      // Allow async handlers to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not emit integration:discord event
      expect(emitSpy).toHaveBeenCalledWith('milestone:completed', expect.any(Object));
      expect(emitSpy).not.toHaveBeenCalledWith('integration:discord', expect.any(Object));
    });

    it('should skip ceremony when enableMilestoneUpdates is false', async () => {
      // Setup: milestone updates disabled
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: false,
          enableProjectRetros: true,
        },
      };

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      // Trigger milestone:completed event
      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      // Allow async handlers to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not emit integration:discord event
      expect(emitSpy).not.toHaveBeenCalledWith('integration:discord', expect.any(Object));
    });

    it('should process ceremony when config is enabled', async () => {
      // Setup: ceremonies enabled
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      // Trigger milestone:completed event
      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      // Allow async handlers to run
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should emit integration:discord event
      expect(emitSpy).toHaveBeenCalledWith(
        'integration:discord',
        expect.objectContaining({
          projectPath: '/test/path',
          action: 'send_message',
        })
      );
    });
  });

  describe('milestone update generation', () => {
    it('should generate milestone update with features shipped', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [
        createTestFeature({ title: 'Feature A', prNumber: 101 }),
        createTestFeature({ title: 'Feature B', prNumber: 102 }),
      ];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify Discord event was emitted with content
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBeGreaterThan(0);

      const discordPayload = discordCalls[0][1] as any;
      expect(discordPayload.content).toContain('Test Project');
      expect(discordPayload.content).toContain('Foundation');
      expect(discordPayload.content).toContain('**Features Shipped:** 2');
      expect(discordPayload.content).toContain('Feature A');
      expect(discordPayload.content).toContain('Feature B');
    });

    it('should include cost metrics in milestone update', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [
        createTestFeature({ costUsd: 2.5 }),
        createTestFeature({ costUsd: 3.5 }),
      ];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      expect(discordPayload.content).toContain('**Total Cost:** $6.00');
      expect(discordPayload.content).toContain('**Avg per Feature:** $3.00');
    });

    it('should include blockers in milestone update', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [
        createTestFeature({ title: 'Feature A' }),
        createTestFeature({
          title: 'Feature B',
          status: 'blocked',
          error: 'Test failed',
        }),
      ];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      expect(discordPayload.content).toContain('**Blockers Encountered:** 1');
      expect(discordPayload.content).toContain('Feature B');
    });

    it('should include next milestone info', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      expect(discordPayload.content).toContain("**What's Next:** Milestone 2 — Features");
      expect(discordPayload.content).toContain('1 phases planned');
    });

    it('should indicate project completion when no more milestones', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Foundation',
            description: 'Core infrastructure',
            phases: [],
          },
        ],
      });
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      expect(discordPayload.content).toContain('All milestones complete!');
    });
  });

  describe('message splitting', () => {
    it('should not split messages under 2000 characters', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should emit only one Discord event (message not split)
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBe(1);
    });

    it('should split messages over 2000 characters into multiple chunks', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();

      // Create many features to exceed 2000 chars
      const mockFeatures: Feature[] = [];
      for (let i = 0; i < 100; i++) {
        mockFeatures.push(
          createTestFeature({
            title: `Feature ${i} with a very long description that takes up space`,
            prNumber: 1000 + i,
            costUsd: i * 0.5,
          })
        );
      }

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should emit multiple Discord events (message split)
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBeGreaterThan(1);

      // Each message should be under 2000 chars
      for (const call of discordCalls) {
        const payload = call[1] as any;
        expect(payload.content.length).toBeLessThanOrEqual(2000);
      }
    });

    it('should preserve line boundaries when splitting', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();

      // Create many features
      const mockFeatures: Feature[] = [];
      for (let i = 0; i < 100; i++) {
        mockFeatures.push(
          createTestFeature({
            title: `Feature ${i} with description`,
            prNumber: 1000 + i,
          })
        );
      }

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');

      // Each chunk should contain complete lines (no mid-line splits)
      for (const call of discordCalls) {
        const payload = call[1] as any;
        const content = payload.content;

        // Should not start or end with partial lines
        // (Lines starting with "- " should be complete)
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.startsWith('- ')) {
            // Feature list item should have complete format
            expect(line).toMatch(/- .+ — \[PR#\d+\]\(https:\/\/.+\)/);
          }
        }
      }
    });
  });

  describe('channel override', () => {
    it('should use channel override from ceremony settings', async () => {
      const customChannelId = 'custom-channel-456';

      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
          discordChannelId: customChannelId,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'default-channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      // Should use custom channel, not default
      expect(discordPayload.channelId).toBe(customChannelId);
    });

    it('should use default channel when no override specified', async () => {
      const defaultChannelId = 'default-channel-123';

      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
          // No discordChannelId override
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: defaultChannelId,
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      const discordPayload = discordCalls[0][1] as any;

      // Should use default channel
      expect(discordPayload.channelId).toBe(defaultChannelId);
    });
  });

  describe('error handling', () => {
    it('should handle missing project gracefully', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(null);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not emit Discord event on error
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBe(0);
    });

    it('should handle missing milestone gracefully', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: true,
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      // Request non-existent milestone
      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'NonExistent',
        milestoneNumber: 999,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not emit Discord event on error
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBe(0);
    });

    it('should skip ceremony when Discord integration is disabled', async () => {
      const mockSettings: ProjectSettings = {
        ceremonySettings: {
          enabled: true,
          enableMilestoneUpdates: true,
          enableProjectRetros: true,
        },
        integrations: {
          discord: {
            enabled: false, // Discord disabled
            serverId: 'server-123',
            channelId: 'channel-123',
            webhookId: 'webhook-123',
            webhookToken: 'token-123',
          },
        },
      };

      const mockProject = createTestProject();
      const mockFeatures = [createTestFeature()];

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(mockSettings);
      vi.mocked(mockProjectService.getProject).mockResolvedValue(mockProject);
      vi.mocked(mockFeatureLoader.getAll).mockResolvedValue(mockFeatures);

      const emitSpy = vi.spyOn(emitter, 'emit');

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test/path',
        projectTitle: 'Test Project',
        projectSlug: 'test-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not emit Discord event when integration is disabled
      const discordCalls = emitSpy.mock.calls.filter((call) => call[0] === 'integration:discord');
      expect(discordCalls.length).toBe(0);
    });
  });
});
