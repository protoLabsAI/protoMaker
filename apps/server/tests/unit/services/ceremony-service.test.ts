/**
 * CeremonyService Unit Tests
 *
 * Tests for the LangGraph-based ceremony service:
 * - Config gate checks (enabled/disabled, channel required)
 * - Flow factory invocation with correct arguments
 * - Discord adapter routing via integration:discord event
 * - Observability counters and status methods
 * - Project retro dedup guard and clearProcessedProject
 * - Error handling (flow throws → discordPostFailures++)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import readline from 'readline';
import { CeremonyService } from '../../../src/services/ceremony-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { ProjectService } from '../../../src/services/project-service.js';
import type { MetricsService } from '../../../src/services/metrics-service.js';
import type { ProjectSettings } from '@protolabsai/types';
import {
  createMockSettingsService,
  createMockFeatureLoader,
  createMockProjectService,
  createMockMetricsService,
} from '../../helpers/mock-factories.js';

// ---------------------------------------------------------------------------
// Module mocks — prevent real LLM calls
// ---------------------------------------------------------------------------

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@protolabsai/flows', () => ({
  createStandupFlow: vi.fn(),
  createRetroFlow: vi.fn(),
  createProjectRetroFlow: vi.fn(),
}));

import { createStandupFlow, createRetroFlow, createProjectRetroFlow } from '@protolabsai/flows';

/** Settings with ceremonies enabled and a Discord channel configured. */
const enabledSettings = (
  overrides: Partial<NonNullable<ProjectSettings['ceremonySettings']>> = {}
): ProjectSettings => ({
  ceremonySettings: {
    enabled: true,
    enableMilestoneUpdates: true,
    enableProjectRetros: true,
    discordChannelId: 'channel-123',
    ...overrides,
  },
});

/** A mock flow that calls discordBot.sendMessage when invoked. */
const makeFlow = (
  discordBot?: { sendMessage: (channelId: string, content: string) => Promise<{ id: string }> },
  channelId = 'channel-123'
) => ({
  invoke: vi.fn(async () => {
    if (discordBot) {
      await discordBot.sendMessage(channelId, 'mock ceremony message');
    }
  }),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CeremonyService', () => {
  let ceremonyService: CeremonyService;
  let emitter: EventEmitter;
  let mockSettingsService: SettingsService;
  let mockFeatureLoader: FeatureLoader;
  let mockProjectService: ProjectService;
  let mockMetricsService: MetricsService;

  beforeEach(() => {
    ceremonyService = new CeremonyService();
    emitter = createEventEmitter();
    mockSettingsService = createMockSettingsService() as unknown as SettingsService;
    mockFeatureLoader = createMockFeatureLoader() as unknown as FeatureLoader;
    mockProjectService = createMockProjectService() as unknown as ProjectService;
    mockMetricsService = createMockMetricsService() as unknown as MetricsService;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  describe('initialization', () => {
    it('initializes without throwing', () => {
      expect(() =>
        ceremonyService.initialize(
          emitter,
          mockSettingsService,
          mockFeatureLoader,
          mockProjectService,
          mockMetricsService
        )
      ).not.toThrow();
    });

    it('subscribes to the emitter on initialization', () => {
      const spy = vi.spyOn(emitter, 'subscribe');
      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );
      expect(spy).toHaveBeenCalledOnce();
    });

    it('unsubscribes on destroy', () => {
      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );
      expect(() => ceremonyService.destroy()).not.toThrow();
    });

    it('getStatus returns zeroed counts before any ceremonies', () => {
      const { counts, total } = ceremonyService.getStatus();
      expect(total).toBe(0);
      expect(counts.standup).toBe(0);
      expect(counts.milestoneRetro).toBe(0);
      expect(counts.projectRetro).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Config gates — standup (milestone:started)
  // -------------------------------------------------------------------------

  describe('standup config gates', () => {
    it('skips standup when ceremonies are disabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ enabled: false })
      );
      vi.mocked(createStandupFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:started', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M1',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createStandupFlow).not.toHaveBeenCalled();
    });

    it('skips standup when discordChannelId is not set', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ discordChannelId: undefined })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:started', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M1',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createStandupFlow).not.toHaveBeenCalled();
    });

    it('invokes standup flow with correct arguments when enabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createStandupFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:started', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        milestoneTitle: 'Milestone One',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(createStandupFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/test',
          projectSlug: 'my-project',
          milestoneSlug: 'milestone-one',
          discordChannelId: 'channel-123',
        })
      );
      expect(ceremonyService.getStatus().counts.standup).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Config gates — retro (milestone:completed)
  // -------------------------------------------------------------------------

  describe('retro config gates', () => {
    it('skips retro when ceremonies are disabled', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ enabled: false })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M1',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createRetroFlow).not.toHaveBeenCalled();
    });

    it('skips retro when enableMilestoneUpdates is false', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ enableMilestoneUpdates: false })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M1',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createRetroFlow).not.toHaveBeenCalled();
    });

    it('skips retro when discordChannelId is not set', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ discordChannelId: undefined })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M1',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createRetroFlow).not.toHaveBeenCalled();
    });

    it('invokes retro flow and routes discord via integration:discord event', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());

      const emitSpy = vi.spyOn(emitter, 'emit');

      // Flow captures discordBot and calls sendMessage when invoked
      vi.mocked(createRetroFlow).mockImplementation(
        ({ discordBot, discordChannelId }) => makeFlow(discordBot, discordChannelId) as any
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        milestoneTitle: 'Foundation',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(createRetroFlow).toHaveBeenCalledWith(
        expect.objectContaining({ projectPath: '/test', discordChannelId: 'channel-123' })
      );

      // Discord adapter emits integration:discord when flow calls sendMessage
      expect(emitSpy).toHaveBeenCalledWith(
        'integration:discord',
        expect.objectContaining({ channelId: 'channel-123', action: 'send_message' })
      );
      expect(ceremonyService.getStatus().counts.milestoneRetro).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Config gates — project retro (project:completed)
  // -------------------------------------------------------------------------

  describe('project retro config gates', () => {
    it('skips project retro when enableProjectRetros is false', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ enableProjectRetros: false })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createProjectRetroFlow).not.toHaveBeenCalled();
    });

    it('skips project retro when discordChannelId is not set', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ discordChannelId: undefined })
      );

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createProjectRetroFlow).not.toHaveBeenCalled();
    });

    it('runs project retro independently of enableMilestoneUpdates', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(
        enabledSettings({ enableMilestoneUpdates: false })
      );
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 2,
        totalFeatures: 5,
        totalCostUsd: 10,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createProjectRetroFlow).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Dedup guard
  // -------------------------------------------------------------------------

  describe('project retro dedup guard', () => {
    it('skips project retro if already processed', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      const payload = {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      };

      emitter.emit('project:completed', payload);
      await new Promise((r) => setTimeout(r, 20));

      // Second emission — should be deduped
      emitter.emit('project:completed', payload);
      await new Promise((r) => setTimeout(r, 20));

      expect(createProjectRetroFlow).toHaveBeenCalledTimes(1);
    });

    it('clearProcessedProject allows re-running the retro', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      const payload = {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      };

      emitter.emit('project:completed', payload);
      await new Promise((r) => setTimeout(r, 20));

      // Clear dedup and re-emit
      ceremonyService.clearProcessedProject('/test', 'my-project');
      emitter.emit('project:completed', payload);
      await new Promise((r) => setTimeout(r, 20));

      expect(createProjectRetroFlow).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Observability
  // -------------------------------------------------------------------------

  describe('observability', () => {
    it('increments lastCeremonyAt after a standup', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createStandupFlow).mockReturnValue(makeFlow() as any);

      const before = ceremonyService.getStatus().lastCeremonyAt;
      expect(before).toBeNull();

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );
      emitter.emit('milestone:started', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M',
        milestoneNumber: 1,
      });
      await new Promise((r) => setTimeout(r, 20));

      expect(ceremonyService.getStatus().lastCeremonyAt).not.toBeNull();
    });

    it('tracks active reflection during project retro', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());

      let resolveFlow!: () => void;
      const flowPromise = new Promise<void>((res) => {
        resolveFlow = res;
      });

      vi.mocked(createProjectRetroFlow).mockReturnValue({
        invoke: vi.fn(() => flowPromise),
      } as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      // While flow is running, reflection should be active
      await new Promise((r) => setTimeout(r, 10));
      const status = ceremonyService.getReflectionStatus();
      expect(status.active).toBe(true);
      expect(status.activeProject).toBe('My Project');

      // Complete the flow
      resolveFlow();
      await new Promise((r) => setTimeout(r, 10));

      const after = ceremonyService.getReflectionStatus();
      expect(after.active).toBe(false);
      expect(after.reflectionCount).toBe(1);
      expect(after.lastReflection?.projectSlug).toBe('my-project');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('increments discordPostFailures when a flow throws', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createRetroFlow).mockReturnValue({
        invoke: vi.fn().mockRejectedValue(new Error('LLM error')),
      } as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );

      emitter.emit('milestone:completed', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(ceremonyService.getStatus().counts.discordPostFailures).toBe(1);
    });

    it('does not throw when destroyed before any event', () => {
      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );
      expect(() => ceremonyService.destroy()).not.toThrow();
    });

    it('safely no-ops on events after destroy', async () => {
      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService
      );
      ceremonyService.destroy();

      // emitter still has subscribers from before — but service's unsubscribe was called
      emitter.emit('milestone:started', {
        projectPath: '/test',
        projectTitle: 'T',
        projectSlug: 'test',
        milestoneTitle: 'M',
        milestoneNumber: 1,
      });

      await new Promise((r) => setTimeout(r, 20));
      // No flow should have been called
      expect(createStandupFlow).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Ledger persistence — cold start and warm restart
  // -------------------------------------------------------------------------

  describe('ledger persistence', () => {
    const TEST_DATA_DIR = '/mock/data';

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cold start: processedProjects is empty when no ledger file exists', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      vi.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined as any);

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService,
        TEST_DATA_DIR
      );

      // Wait for loadLedger to complete (fire-and-forget async)
      await new Promise((r) => setTimeout(r, 50));

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      // Cold start: processedProjects was empty → flow should run
      expect(createProjectRetroFlow).toHaveBeenCalledTimes(1);
    });

    it('warm restart: pre-populates processedProjects from existing ledger file', async () => {
      const existingKey = '/test:my-project';
      const ledgerLines = [
        JSON.stringify({ key: existingKey, timestamp: '2026-01-01T00:00:00.000Z' }),
      ];

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'createReadStream').mockReturnValue({} as any);
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      vi.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined as any);
      vi.spyOn(readline, 'createInterface').mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const line of ledgerLines) yield line;
        },
      } as any);

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService,
        TEST_DATA_DIR
      );

      // Wait for ledger load to complete
      await new Promise((r) => setTimeout(r, 50));

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      // Warm restart: key already in processedProjects from ledger → flow skipped
      expect(createProjectRetroFlow).not.toHaveBeenCalled();
    });

    it('warm restart: skips malformed lines and loads valid ones', async () => {
      const validKey = '/test:good-project';
      const ledgerLines = [
        'not valid json {{{',
        '',
        JSON.stringify({ key: validKey, timestamp: '2026-01-01T00:00:00.000Z' }),
        JSON.stringify({ timestamp: '2026-01-02T00:00:00.000Z' }), // missing key field
      ];

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'createReadStream').mockReturnValue({} as any);
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      vi.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined as any);
      vi.spyOn(readline, 'createInterface').mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const line of ledgerLines) yield line;
        },
      } as any);

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService,
        TEST_DATA_DIR
      );

      await new Promise((r) => setTimeout(r, 50));

      // The valid key should be loaded → blocked
      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'Good Project',
        projectSlug: 'good-project',
        totalMilestones: 1,
        totalFeatures: 1,
        totalCostUsd: 1,
        failureCount: 0,
        milestoneSummaries: [],
      });

      await new Promise((r) => setTimeout(r, 20));
      expect(createProjectRetroFlow).not.toHaveBeenCalled();
    });

    it('appends a JSONL entry to the ledger when a project retro fires', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
      const appendFileSpy = vi.spyOn(fs.promises, 'appendFile').mockResolvedValue(undefined as any);

      vi.mocked(mockSettingsService.getProjectSettings).mockResolvedValue(enabledSettings());
      vi.mocked(createProjectRetroFlow).mockReturnValue(makeFlow() as any);

      ceremonyService.initialize(
        emitter,
        mockSettingsService,
        mockFeatureLoader,
        mockProjectService,
        mockMetricsService,
        TEST_DATA_DIR
      );

      await new Promise((r) => setTimeout(r, 50));

      emitter.emit('project:completed', {
        projectPath: '/test',
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        totalMilestones: 1,
        totalFeatures: 2,
        totalCostUsd: 5,
        failureCount: 0,
        milestoneSummaries: [],
      });

      // Wait for both the ceremony handler and the fire-and-forget appendFile
      await new Promise((r) => setTimeout(r, 50));

      expect(appendFileSpy).toHaveBeenCalledOnce();
      const [writtenPath, writtenContent] = appendFileSpy.mock.calls[0] as [string, string];
      expect(writtenPath).toContain('ceremony-processed.jsonl');
      const parsed = JSON.parse(writtenContent.trim()) as { key: string; timestamp: string };
      expect(parsed.key).toBe('/test:my-project');
      expect(parsed.timestamp).toBeDefined();
    });
  });
});
