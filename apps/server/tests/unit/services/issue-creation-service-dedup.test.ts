/**
 * IssueCreationService — per-key in-flight dedup regression tests
 *
 * Verifies that concurrent failure events for the same featureId produce
 * exactly ONE bug feature (race window between issuedFeatures check and
 * storage write is guarded by an in-flight Set).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueCreationService } from '@/services/issue-creation-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { TriageService, TriageResult } from '@/services/triage-service.js';
import type { SettingsService } from '@/services/settings-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
  };
}

function makeDelayedMockFeatureLoader(delayMs = 50) {
  const mock = {
    get: vi.fn().mockImplementation(
      (_projectPath: string, id: string) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id,
              title: 'Test Feature',
              status: 'in_progress',
              description: 'A test feature',
            });
          }, delayMs);
        })
    ),
    create: vi.fn().mockImplementation(
      (_projectPath: string, data: unknown) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id: 'bug-feature-1',
              title: (data as { title?: string })?.title ?? '',
              status: 'backlog',
              category: 'bug',
            });
          }, delayMs);
        })
    ),
  };
  return mock as unknown as FeatureLoader;
}

function makeMockTriageService(): TriageService {
  return {
    triage: vi.fn().mockReturnValue({
      priority: 3,
      priorityLabel: 'Medium',
      team: 'backend',
      reason: 'Auto-triage',
    } as TriageResult),
  };
}

function makeMockSettingsService(): SettingsService {
  return {
    getProjectSettings: vi.fn().mockResolvedValue({
      integrations: { discord: { channels: { bugs: '' } } },
    }),
  } as unknown as SettingsService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueCreationService — per-key in-flight dedup', () => {
  let service: IssueCreationService;
  let featureLoader: ReturnType<typeof makeDelayedMockFeatureLoader>;
  const projectPath = '/test/project';
  const featureId = 'feature-123';

  beforeEach(() => {
    featureLoader = makeDelayedMockFeatureLoader(50);
    const events = createMockEvents();
    const triage = makeMockTriageService();
    const settings = makeMockSettingsService();

    service = new IssueCreationService(events as any, featureLoader, triage, settings);
    service.initialize();
  });

  it('two concurrent permanently-blocked events for same featureId produce ONE bug', async () => {
    const payload = {
      projectPath,
      featureId,
      retryCount: 3,
      lastError: 'Something broke',
      failureCategory: 'unknown',
    };

    // Fire two events concurrently
    // We need to trigger the internal handler — use events.subscribe callback
    // Since initialize() sets up a subscriber, we can emit events
    // However, the service subscribes via events.subscribe which is mocked.
    // We need to call the handler directly.

    // Access private method via any cast for testing
    const handler = (service as any).handlePermanentlyBlocked.bind(service);

    const p1 = handler(payload);
    const p2 = handler(payload);
    await Promise.all([p1, p2]);

    // featureLoader.create should be called exactly once
    expect(featureLoader.create).toHaveBeenCalledTimes(1);
  });

  it('two concurrent recovery_escalated events for same featureId produce ONE bug', async () => {
    const payload = {
      featureId,
      reason: 'Recovery failed',
      timestamp: new Date().toISOString(),
      projectPath,
    };

    const handler = (service as any).handleRecoveryEscalated.bind(service);

    const p1 = handler(payload);
    const p2 = handler(payload);
    await Promise.all([p1, p2]);

    expect(featureLoader.create).toHaveBeenCalledTimes(1);
  });

  it('two concurrent pr:ci-failure events for same featureId produce ONE bug', async () => {
    const payload = {
      projectPath,
      featureId,
      prNumber: 42,
      failedChecks: [{ name: 'ci', conclusion: 'failure' }],
    };

    const handler = (service as any).handleCIFailure.bind(service);

    const p1 = handler(payload);
    const p2 = handler(payload);
    await Promise.all([p1, p2]);

    expect(featureLoader.create).toHaveBeenCalledTimes(1);
  });

  it('concurrent events for different featureIds each produce their own bug', async () => {
    const payloadA = {
      projectPath,
      featureId: 'feature-a',
      retryCount: 3,
      lastError: 'Error A',
    };
    const payloadB = {
      projectPath,
      featureId: 'feature-b',
      retryCount: 3,
      lastError: 'Error B',
    };

    const handler = (service as any).handlePermanentlyBlocked.bind(service);

    await Promise.all([handler(payloadA), handler(payloadB)]);

    expect(featureLoader.create).toHaveBeenCalledTimes(2);
  });

  it('in-flight guard is cleared after failure so retries can succeed', async () => {
    // Make featureLoader.get throw to simulate a failure
    const getMock = vi
      .fn()
      .mockImplementation(() => Promise.reject(Object.assign(new Error(), { message: 'DB down' })));
    const createMock = vi.fn();
    const failingLoader = {
      get: getMock,
      create: createMock,
    } as unknown as FeatureLoader;

    const events = createMockEvents();
    const triage = makeMockTriageService();
    const settings = makeMockSettingsService();

    const failingService = new IssueCreationService(events as any, failingLoader, triage, settings);
    failingService.initialize();

    const payload = {
      projectPath,
      featureId,
      retryCount: 3,
      lastError: 'Something broke',
    };

    const handler = (failingService as any).handlePermanentlyBlocked.bind(failingService);

    // First call fails — error propagates, but guard is cleared in finally
    await expect(handler(payload)).rejects.toThrow('DB down');
    expect(getMock).toHaveBeenCalledTimes(1);

    // Now make it succeed
    getMock.mockResolvedValue({
      id: featureId,
      title: 'Test',
      status: 'in_progress',
    });
    createMock.mockResolvedValue({ id: 'bug-1', title: 'Bug', status: 'backlog' });

    // Second call should succeed — guard was cleared
    await handler(payload);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
