/**
 * ceremony-flows.test.ts
 *
 * Verifies that CeremonyService registers all three ceremony flow factories
 * (standup-flow, retro-flow, project-retro-flow) in the global FlowRegistry
 * during service initialization — before any ceremony trigger can fire.
 *
 * This guards against the "Flow not registered: standup-flow" error that
 * appears when AutomationService.executeAutomation() dispatches a ceremony.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CeremonyService } from '../../../src/services/ceremony-service.js';
import { flowRegistry } from '../../../src/services/automation-service.js';
import { createEventEmitter } from '../../../src/lib/events.js';
import type { SettingsService } from '../../../src/services/settings-service.js';
import type { FeatureLoader } from '../../../src/services/feature-loader.js';
import type { ProjectService } from '../../../src/services/project-service.js';
import type { MetricsService } from '../../../src/services/metrics-service.js';

// Helper to clear the global flowRegistry singleton before each test
function clearFlowRegistry() {
  const flowIds = ['standup-flow', 'retro-flow', 'project-retro-flow'];
  for (const flowId of flowIds) {
    flowRegistry.unregister(flowId);
  }
}

// ---------------------------------------------------------------------------
// Module mocks — prevent real LLM calls and filesystem access
// ---------------------------------------------------------------------------

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@protolabsai/flows', () => ({
  createStandupFlow: vi.fn(),
  createRetroFlow: vi.fn(),
  createProjectRetroFlow: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CeremonyService — flow registry', () => {
  let service: CeremonyService;

  beforeEach(() => {
    // Clear the global flowRegistry singleton to prevent state leakage between tests
    clearFlowRegistry();
    service = new CeremonyService();
    vi.clearAllMocks();
  });

  it('registers standup-flow, retro-flow, and project-retro-flow on initialize()', () => {
    const emitter = createEventEmitter();
    const mockSettingsService = { getProjectSettings: vi.fn() } as unknown as SettingsService;
    const mockFeatureLoader = { getAll: vi.fn() } as unknown as FeatureLoader;
    const mockProjectService = { getProject: vi.fn() } as unknown as ProjectService;
    const mockMetricsService = {} as unknown as MetricsService;

    service.initialize(
      emitter,
      mockSettingsService,
      mockFeatureLoader,
      mockProjectService,
      mockMetricsService
    );

    expect(flowRegistry.has('standup-flow')).toBe(true);
    expect(flowRegistry.has('retro-flow')).toBe(true);
    expect(flowRegistry.has('project-retro-flow')).toBe(true);
  });

  it('standup-flow factory resolves without throwing', async () => {
    const emitter = createEventEmitter();
    const mockSettingsService = { getProjectSettings: vi.fn() } as unknown as SettingsService;
    const mockFeatureLoader = { getAll: vi.fn() } as unknown as FeatureLoader;
    const mockProjectService = { getProject: vi.fn() } as unknown as ProjectService;
    const mockMetricsService = {} as unknown as MetricsService;

    service.initialize(
      emitter,
      mockSettingsService,
      mockFeatureLoader,
      mockProjectService,
      mockMetricsService
    );

    const factory = flowRegistry.get('standup-flow');
    expect(factory).toBeDefined();
    // Verify the factory resolves without throwing
    await expect(factory!({})).resolves.toBeUndefined();
  });

  it('retro-flow factory resolves without throwing', async () => {
    const emitter = createEventEmitter();
    const mockSettingsService = { getProjectSettings: vi.fn() } as unknown as SettingsService;
    const mockFeatureLoader = { getAll: vi.fn() } as unknown as FeatureLoader;
    const mockProjectService = { getProject: vi.fn() } as unknown as ProjectService;
    const mockMetricsService = {} as unknown as MetricsService;

    service.initialize(
      emitter,
      mockSettingsService,
      mockFeatureLoader,
      mockProjectService,
      mockMetricsService
    );

    const factory = flowRegistry.get('retro-flow');
    expect(factory).toBeDefined();
    // Verify the factory resolves without throwing
    await expect(factory!({})).resolves.toBeUndefined();
  });

  it('project-retro-flow factory resolves without throwing', async () => {
    const emitter = createEventEmitter();
    const mockSettingsService = { getProjectSettings: vi.fn() } as unknown as SettingsService;
    const mockFeatureLoader = { getAll: vi.fn() } as unknown as FeatureLoader;
    const mockProjectService = { getProject: vi.fn() } as unknown as ProjectService;
    const mockMetricsService = {} as unknown as MetricsService;

    service.initialize(
      emitter,
      mockSettingsService,
      mockFeatureLoader,
      mockProjectService,
      mockMetricsService
    );

    const factory = flowRegistry.get('project-retro-flow');
    expect(factory).toBeDefined();
    // Verify the factory resolves without throwing
    await expect(factory!({})).resolves.toBeUndefined();
  });
});
