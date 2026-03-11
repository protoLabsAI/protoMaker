/**
 * PM ↔ LE Bidirectional Integration — unit tests
 *
 * Covers:
 * - PM can query LE for execution status (PM → LE direction)
 * - LE can query PM for next assignable phase (LE → PM direction)
 * - No circular dependencies: both directions wired via interface injection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';

// ────────────────────────── Module Mocks ──────────────────────────

vi.mock('node:fs/promises');

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual<typeof import('@protolabsai/utils')>('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

vi.mock('child_process', () => ({ exec: vi.fn(), execFile: vi.fn(), spawn: vi.fn() }));
vi.mock('util', () => ({ promisify: (fn: unknown) => fn }));
vi.mock('@/lib/settings-helpers.js', () => ({ getWorkflowSettings: vi.fn() }));

import {
  PMWorldStateBuilder,
  type ILeadEngineerStatusProvider,
  type LEExecutionStatusSummary,
} from '@/services/pm-world-state-builder.js';

import {
  LeadEngineerService,
  type IPMWorldStateProvider,
} from '@/services/lead-engineer-service.js';

import {
  createMockFeatureLoader,
  createMockSettingsService,
  createMockProjectService,
  createMockMetricsService,
} from '../../helpers/mock-factories.js';

import type { EventType } from '@protolabsai/types';

// ────────────────────────── Helpers ──────────────────────────

function createMockEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
}

function setupEmptyMockFs() {
  vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
}

function setupMilestoneFs(
  milestones: Array<{
    slug: string;
    title: string;
    phases: number;
    completed: number;
    dueAt?: string;
  }>
) {
  vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
    const p = String(dirPath);
    if (p.endsWith('projects')) {
      return [
        { name: 'test-project', isDirectory: () => true },
      ] as unknown as import('node:fs').Dirent[];
    }
    return [];
  });

  const projectJson = JSON.stringify({
    status: 'active',
    phase: 'development',
    milestones: milestones.map((ms) => ({
      slug: ms.slug,
      title: ms.title,
      dueAt: ms.dueAt,
      phases: Array.from({ length: ms.phases }, (_, i) => ({
        featureId: `f-${ms.slug}-${i}`,
        status: i < ms.completed ? 'done' : 'pending',
      })),
    })),
  });

  vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
    const p = String(filePath);
    if (p.endsWith('project.json')) return projectJson;
    throw new Error('ENOENT');
  });
}

// ────────────────────────── Tests ──────────────────────────

describe('PM → LE: queryLEExecutionStatus()', () => {
  let pm: PMWorldStateBuilder;

  beforeEach(() => {
    pm = new PMWorldStateBuilder({ projectRoot: '/fake/root' });
    setupEmptyMockFs();
  });

  it('returns null when no LE status provider is set', () => {
    expect(pm.queryLEExecutionStatus()).toBeNull();
  });

  it('returns the summary from the injected provider', () => {
    const summary: LEExecutionStatusSummary = {
      activeProjectCount: 2,
      activeFeaturesCount: 5,
      projectStatuses: [
        { projectPath: '/p1', projectSlug: 'proj-a', flowState: 'running' },
        { projectPath: '/p2', projectSlug: 'proj-b', flowState: 'running' },
      ],
    };

    const provider: ILeadEngineerStatusProvider = {
      getExecutionStatusSummary: vi.fn().mockReturnValue(summary),
    };

    pm.setLeadEngineerStatusProvider(provider);

    const result = pm.queryLEExecutionStatus();
    expect(result).toEqual(summary);
    expect(provider.getExecutionStatusSummary).toHaveBeenCalledOnce();
  });

  it('provider can be replaced and new provider is used', () => {
    const providerA: ILeadEngineerStatusProvider = {
      getExecutionStatusSummary: vi
        .fn()
        .mockReturnValue({ activeProjectCount: 1, activeFeaturesCount: 1, projectStatuses: [] }),
    };
    const providerB: ILeadEngineerStatusProvider = {
      getExecutionStatusSummary: vi
        .fn()
        .mockReturnValue({ activeProjectCount: 99, activeFeaturesCount: 99, projectStatuses: [] }),
    };

    pm.setLeadEngineerStatusProvider(providerA);
    pm.setLeadEngineerStatusProvider(providerB);

    const result = pm.queryLEExecutionStatus();
    expect(result?.activeProjectCount).toBe(99);
    expect(providerA.getExecutionStatusSummary).not.toHaveBeenCalled();
    expect(providerB.getExecutionStatusSummary).toHaveBeenCalledOnce();
  });
});

describe('PM.getNextAssignablePhase()', () => {
  let pm: PMWorldStateBuilder;

  beforeEach(() => {
    pm = new PMWorldStateBuilder({ projectRoot: '/fake/root' });
  });

  it('returns null when state has no milestones', () => {
    setupEmptyMockFs();
    expect(pm.getNextAssignablePhase()).toBeNull();
  });

  it('returns the first incomplete milestone after state is built', async () => {
    setupMilestoneFs([
      {
        slug: 'ms-one',
        title: 'Milestone One',
        phases: 3,
        completed: 1,
        dueAt: '2026-05-01T00:00:00.000Z',
      },
      { slug: 'ms-two', title: 'Milestone Two', phases: 2, completed: 0 },
    ]);

    await pm.buildState();

    const result = pm.getNextAssignablePhase();
    expect(result).not.toBeNull();
    expect(result?.milestoneSlug).toBe('ms-one');
    expect(result?.milestoneTitle).toBe('Milestone One');
    expect(result?.remainingPhases).toBe(2); // 3 - 1
    expect(result?.dueAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('returns null when all milestones are complete', async () => {
    setupMilestoneFs([{ slug: 'ms-done', title: 'Done Milestone', phases: 2, completed: 2 }]);

    await pm.buildState();

    expect(pm.getNextAssignablePhase()).toBeNull();
  });

  it('skips fully-complete milestones and returns first incomplete one', async () => {
    setupMilestoneFs([
      { slug: 'ms-complete', title: 'Complete', phases: 2, completed: 2 },
      { slug: 'ms-partial', title: 'Partial', phases: 4, completed: 1 },
    ]);

    await pm.buildState();

    const result = pm.getNextAssignablePhase();
    expect(result?.milestoneSlug).toBe('ms-partial');
    expect(result?.remainingPhases).toBe(3);
  });
});

describe('LE → PM: queryPMNextAssignment()', () => {
  let le: LeadEngineerService;

  beforeEach(() => {
    const events = createMockEvents();
    le = new LeadEngineerService(
      events as unknown as Parameters<
        typeof LeadEngineerService.prototype.initialize
      >[0] extends never
        ? never
        : any,
      createMockFeatureLoader(),
      { isRunning: vi.fn().mockReturnValue(false), getConfig: vi.fn() } as any,
      createMockProjectService(),
      { launch: vi.fn() } as any,
      createMockSettingsService(),
      createMockMetricsService()
    );
  });

  it('returns null when no PM provider is set', () => {
    expect(le.queryPMNextAssignment()).toBeNull();
  });

  it('returns the phase from the injected PM provider', () => {
    const provider: IPMWorldStateProvider = {
      getNextAssignablePhase: vi.fn().mockReturnValue({
        milestoneSlug: 'ms-alpha',
        milestoneTitle: 'Alpha Milestone',
        remainingPhases: 3,
        dueAt: '2026-06-01T00:00:00.000Z',
      }),
    };

    le.setPMWorldStateProvider(provider);

    const result = le.queryPMNextAssignment();
    expect(result).toEqual({
      milestoneSlug: 'ms-alpha',
      milestoneTitle: 'Alpha Milestone',
      remainingPhases: 3,
      dueAt: '2026-06-01T00:00:00.000Z',
    });
    expect(provider.getNextAssignablePhase).toHaveBeenCalledOnce();
  });

  it('returns null when PM provider reports no assignable phase', () => {
    const provider: IPMWorldStateProvider = {
      getNextAssignablePhase: vi.fn().mockReturnValue(null),
    };

    le.setPMWorldStateProvider(provider);

    expect(le.queryPMNextAssignment()).toBeNull();
  });
});

describe('LE.getExecutionStatusSummary()', () => {
  let le: LeadEngineerService;
  let events: ReturnType<typeof createMockEvents>;

  beforeEach(() => {
    events = createMockEvents();
    le = new LeadEngineerService(
      events as any,
      createMockFeatureLoader(),
      { isRunning: vi.fn().mockReturnValue(false), getConfig: vi.fn() } as any,
      createMockProjectService(),
      { launch: vi.fn() } as any,
      createMockSettingsService(),
      createMockMetricsService()
    );
  });

  it('returns zero counts when no sessions are active', () => {
    const summary = le.getExecutionStatusSummary();
    expect(summary.activeProjectCount).toBe(0);
    expect(summary.activeFeaturesCount).toBe(0);
    expect(summary.projectStatuses).toEqual([]);
  });

  it('satisfies ILeadEngineerStatusProvider interface (can be injected into PM)', () => {
    // Validate LE can be used as an ILeadEngineerStatusProvider without type errors.
    const provider: ILeadEngineerStatusProvider = {
      getExecutionStatusSummary: () => le.getExecutionStatusSummary(),
    };

    const pm = new PMWorldStateBuilder({ projectRoot: '/fake/root' });
    pm.setLeadEngineerStatusProvider(provider);

    const result = pm.queryLEExecutionStatus();
    expect(result).toBeDefined();
    expect(result?.activeProjectCount).toBe(0);
  });
});

describe('Full wiring: PM ↔ LE round-trip', () => {
  it('PM can call LE and LE can call PM with no circular import', async () => {
    setupEmptyMockFs();

    const pm = new PMWorldStateBuilder({ projectRoot: '/fake/root' });
    const events = createMockEvents();
    const le = new LeadEngineerService(
      events as any,
      createMockFeatureLoader(),
      { isRunning: vi.fn().mockReturnValue(false), getConfig: vi.fn() } as any,
      createMockProjectService(),
      { launch: vi.fn() } as any,
      createMockSettingsService(),
      createMockMetricsService()
    );

    // Wire LE → PM
    le.setPMWorldStateProvider(pm);

    // Wire PM → LE
    pm.setLeadEngineerStatusProvider({
      getExecutionStatusSummary: () => le.getExecutionStatusSummary(),
    });

    // PM queries LE
    const leStatus = pm.queryLEExecutionStatus();
    expect(leStatus).not.toBeNull();
    expect(leStatus?.activeProjectCount).toBe(0);

    // LE queries PM
    const pmPhase = le.queryPMNextAssignment();
    expect(pmPhase).toBeNull(); // no milestones loaded
  });
});
