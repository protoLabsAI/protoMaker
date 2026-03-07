/**
 * Changelog and Escalation Artifact Persistence Tests
 *
 * Tests:
 * 1. ChangelogService saves a 'changelog' artifact via ProjectArtifactService after milestone:completed
 * 2. ChangelogService saves a 'changelog' artifact via ProjectArtifactService after project:completed
 * 3. EventLedgerService saves an 'escalation' artifact on escalation:signal-received when project context present
 * 4. EventLedgerService saves escalation artifacts for each distinct escalation event
 * 5. EventLedgerService skips artifact saving when no project context is available
 * 6. Changelog artifact appears in the artifact index after milestone:completed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Poll helper — retries assertion until it passes or timeout (default 5s)
// ---------------------------------------------------------------------------

async function poll(fn: () => void | Promise<void>, timeout = 5000, interval = 50): Promise<void> {
  const deadline = Date.now() + timeout;
  while (true) {
    try {
      await fn();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

/** Settle time for negative assertions (must NOT have been called). */
const settle = () => new Promise((r) => setTimeout(r, 200));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@protolabsai/platform', () => ({
  secureFs: {
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
  getProjectDir: vi.fn(
    (projectPath: string, slug: string) => `${projectPath}/.automaker/projects/${slug}`
  ),
}));

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type SubscribeCallback = (type: string, payload: unknown) => void;

function makeMockEvents() {
  let listener: SubscribeCallback | null = null;

  const subscribe = vi.fn((cb: SubscribeCallback) => {
    listener = cb;
    return () => {
      listener = null;
    };
  });

  const emit = (type: string, payload: unknown) => {
    listener?.(type, payload);
  };

  // Also expose emit on the mock as an event emitter method
  const emitFn = vi.fn();

  return {
    subscribe,
    emit,
    emitMcp: emitFn,
  };
}

function makeMockProjectArtifactService() {
  return {
    saveArtifact: vi.fn().mockResolvedValue('artifact-id-123'),
    listArtifacts: vi.fn().mockResolvedValue([]),
    getArtifact: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// ChangelogService Tests
// ---------------------------------------------------------------------------

describe('ChangelogService — changelog artifact persistence', () => {
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let mockArtifactService: ReturnType<typeof makeMockProjectArtifactService>;
  let ChangelogService: typeof import('../../../src/services/changelog-service.js').ChangelogService;

  beforeEach(async () => {
    vi.resetModules();
    mockEvents = makeMockEvents();
    mockArtifactService = makeMockProjectArtifactService();
    ({ ChangelogService } = await import('../../../src/services/changelog-service.js'));
  });

  function makeService() {
    const service = new ChangelogService();

    const mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        integrations: { discord: { enabled: false } },
        ceremonySettings: { enabled: false },
      }),
    };

    const mockFeatureLoader = {
      getAll: vi.fn().mockResolvedValue([
        {
          id: 'feat-1',
          title: 'Add new dashboard',
          status: 'done',
          prUrl: 'https://github.com/org/repo/pull/1',
          prNumber: 1,
          milestoneSlug: 'milestone-1',
          category: 'feature',
          costUsd: 5,
        },
      ]),
    };

    const mockProjectService = {
      getProject: vi.fn().mockResolvedValue({
        slug: 'test-project',
        title: 'Test Project',
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Milestone One',
          },
        ],
      }),
    };

    service.initialize(
      mockEvents as never,
      mockSettingsService as never,
      mockFeatureLoader as never,
      mockProjectService as never,
      mockArtifactService as never
    );

    // Bypass FS — we only test artifact persistence here
    vi.spyOn(service as any, 'storeChangelog').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'postToDiscord').mockResolvedValue(undefined);

    return { service, mockFeatureLoader, mockProjectService, mockSettingsService };
  }

  it('saves a changelog artifact after milestone:completed event', async () => {
    makeService();

    mockEvents.emit('milestone:completed', {
      projectPath: '/test/project',
      projectTitle: 'Test Project',
      projectSlug: 'test-project',
      milestoneTitle: 'Milestone One',
      milestoneNumber: 1,
    });

    await poll(() => {
      expect(mockArtifactService.saveArtifact).toHaveBeenCalledWith(
        '/test/project',
        'test-project',
        'changelog',
        expect.objectContaining({ scope: 'milestone', content: expect.any(String) })
      );
    });
  });

  it('saves a changelog artifact after project:completed event', async () => {
    makeService();

    mockEvents.emit('project:completed', {
      projectPath: '/test/project',
      projectTitle: 'Test Project',
      projectSlug: 'test-project',
      totalMilestones: 1,
      totalFeatures: 1,
      totalCostUsd: 5,
      failureCount: 0,
      milestoneSummaries: [],
    });

    await poll(() => {
      expect(mockArtifactService.saveArtifact).toHaveBeenCalledWith(
        '/test/project',
        'test-project',
        'changelog',
        expect.objectContaining({ scope: 'project', content: expect.any(String) })
      );
    });
  });

  it('does not call saveArtifact when no projectArtifactService is provided', async () => {
    const service = new ChangelogService();

    const mockSettingsService = {
      getProjectSettings: vi.fn().mockResolvedValue({
        integrations: { discord: { enabled: false } },
        ceremonySettings: { enabled: false },
      }),
    };

    const mockFeatureLoader = {
      getAll: vi.fn().mockResolvedValue([
        {
          id: 'feat-1',
          title: 'Add feature',
          status: 'done',
          prUrl: 'https://github.com/org/repo/pull/1',
          prNumber: 1,
          milestoneSlug: 'ms-1',
          category: 'feature',
          costUsd: 1,
        },
      ]),
    };

    const mockProjectService = {
      getProject: vi.fn().mockResolvedValue({
        slug: 'test-project',
        title: 'Test Project',
        milestones: [{ number: 1, slug: 'ms-1', title: 'MS 1' }],
      }),
    };

    // No artifact service provided
    service.initialize(
      mockEvents as never,
      mockSettingsService as never,
      mockFeatureLoader as never,
      mockProjectService as never
    );

    vi.spyOn(service as any, 'storeChangelog').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'postToDiscord').mockResolvedValue(undefined);

    mockEvents.emit('milestone:completed', {
      projectPath: '/test/project',
      projectTitle: 'Test Project',
      projectSlug: 'test-project',
      milestoneTitle: 'MS 1',
      milestoneNumber: 1,
    });

    await settle();

    expect(mockArtifactService.saveArtifact).not.toHaveBeenCalled();
  });

  it('changelog artifact appears in index after milestone:completed', async () => {
    // Use real ProjectArtifactService with temp directory
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { ProjectArtifactService } =
      await import('../../../src/services/project-artifact-service.js');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-artifact-test-'));

    try {
      const realArtifactService = new ProjectArtifactService();
      const service = new ChangelogService();

      const mockSettingsService = {
        getProjectSettings: vi.fn().mockResolvedValue({
          integrations: { discord: { enabled: false } },
          ceremonySettings: { enabled: false },
        }),
      };

      const mockFeatureLoader = {
        getAll: vi.fn().mockResolvedValue([
          {
            id: 'feat-a',
            title: 'Implement auth',
            status: 'done',
            prUrl: 'https://github.com/org/repo/pull/42',
            prNumber: 42,
            milestoneSlug: 'v1',
            category: 'feature',
            costUsd: 3,
          },
        ]),
      };

      const mockProjectService = {
        getProject: vi.fn().mockResolvedValue({
          slug: 'my-project',
          title: 'My Project',
          milestones: [{ number: 1, slug: 'v1', title: 'v1.0' }],
        }),
      };

      service.initialize(
        mockEvents as never,
        mockSettingsService as never,
        mockFeatureLoader as never,
        mockProjectService as never,
        realArtifactService
      );

      vi.spyOn(service as any, 'storeChangelog').mockResolvedValue(undefined);
      vi.spyOn(service as any, 'postToDiscord').mockResolvedValue(undefined);

      mockEvents.emit('milestone:completed', {
        projectPath: tmpDir,
        projectTitle: 'My Project',
        projectSlug: 'my-project',
        milestoneTitle: 'v1.0',
        milestoneNumber: 1,
      });

      // Poll until artifact appears in the index
      let entries: Awaited<ReturnType<typeof realArtifactService.listArtifacts>> = [];
      await poll(async () => {
        entries = await realArtifactService.listArtifacts(tmpDir, 'my-project', 'changelog');
        expect(entries).toHaveLength(1);
      });

      expect(entries[0]).toMatchObject({
        type: 'changelog',
        id: expect.any(String),
        timestamp: expect.any(String),
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// EventLedgerService — escalation artifact persistence
// ---------------------------------------------------------------------------

describe('EventLedgerService — escalation artifact persistence', () => {
  let mockEvents: ReturnType<typeof makeMockEvents>;
  let mockArtifactService: ReturnType<typeof makeMockProjectArtifactService>;
  let EventLedgerService: typeof import('../../../src/services/event-ledger-service.js').EventLedgerService;

  beforeEach(async () => {
    vi.resetModules();
    mockEvents = makeMockEvents();
    mockArtifactService = makeMockProjectArtifactService();
    ({ EventLedgerService } = await import('../../../src/services/event-ledger-service.js'));
  });

  function makeService() {
    const service = new EventLedgerService(
      '/tmp/test-ledger-artifact',
      mockArtifactService as never
    );
    // Spy on append to prevent FS writes
    vi.spyOn(service, 'append').mockImplementation(() => undefined);
    service.subscribeToLifecycleEvents(mockEvents as never);
    return service;
  }

  it('saves an escalation artifact when project context is present in context field', async () => {
    makeService();

    mockEvents.emit('escalation:signal-received', {
      source: 'lead_engineer',
      severity: 'high',
      type: 'feature_escalated',
      featureId: 'feat-123',
      context: {
        featureId: 'feat-123',
        featureTitle: 'Fix login bug',
        reason: 'Max retries exceeded',
        projectPath: '/my/project',
        projectSlug: 'my-project',
      },
      deduplicationKey: 'esc-1',
      timestamp: '2026-03-07T00:00:00.000Z',
    });

    await poll(() => {
      expect(mockArtifactService.saveArtifact).toHaveBeenCalledWith(
        '/my/project',
        'my-project',
        'escalation',
        expect.objectContaining({
          signal: 'feature_escalated',
          reason: 'Max retries exceeded',
          featureId: 'feat-123',
          featureContext: expect.objectContaining({
            projectPath: '/my/project',
            projectSlug: 'my-project',
          }),
        })
      );
    });
  });

  it('saves separate artifacts for each escalation event', async () => {
    makeService();

    mockEvents.emit('escalation:signal-received', {
      source: 'lead_engineer',
      severity: 'high',
      type: 'feature_escalated',
      featureId: 'feat-1',
      context: {
        featureId: 'feat-1',
        reason: 'Reason A',
        projectPath: '/proj',
        projectSlug: 'proj-slug',
      },
      deduplicationKey: 'esc-a',
    });

    mockEvents.emit('escalation:signal-received', {
      source: 'lead_engineer',
      severity: 'medium',
      type: 'feature_reset',
      featureId: 'feat-2',
      context: {
        featureId: 'feat-2',
        reason: 'Reason B',
        projectPath: '/proj',
        projectSlug: 'proj-slug',
      },
      deduplicationKey: 'esc-b',
    });

    await poll(() => {
      expect(mockArtifactService.saveArtifact).toHaveBeenCalledTimes(2);
    });
  });

  it('skips artifact saving when no project context is available', async () => {
    makeService();

    mockEvents.emit('escalation:signal-received', {
      source: 'auto_mode_health_sweep',
      severity: 'low',
      type: 'stale_gate',
      featureId: 'feat-999',
      context: {
        featureId: 'feat-999',
        // No projectPath or projectSlug
        message: 'Feature is stale',
      },
      deduplicationKey: 'esc-no-project',
    });

    await settle();

    expect(mockArtifactService.saveArtifact).not.toHaveBeenCalled();
  });

  it('skips artifact saving when projectArtifactService is not provided', async () => {
    // Constructor without projectArtifactService
    const service = new EventLedgerService('/tmp/test-no-artifact');
    vi.spyOn(service, 'append').mockImplementation(() => undefined);
    service.subscribeToLifecycleEvents(mockEvents as never);

    mockEvents.emit('escalation:signal-received', {
      source: 'lead_engineer',
      severity: 'high',
      type: 'feature_escalated',
      featureId: 'feat-x',
      context: {
        projectPath: '/proj',
        projectSlug: 'proj',
      },
      deduplicationKey: 'esc-x',
    });

    await settle();

    expect(mockArtifactService.saveArtifact).not.toHaveBeenCalled();
  });
});
