/**
 * Unit tests for FeatureLoader epic completion behavior
 *
 * Epic auto-completion has been moved to CompletionDetectorService.
 * FeatureLoader no longer directly marks epics as done when children complete.
 * Instead, it emits feature:status-changed events that CompletionDetectorService
 * listens to, which then creates an epic-to-dev PR and manages the lifecycle.
 *
 * These tests verify that FeatureLoader does NOT auto-complete epics itself.
 *
 * Coverage:
 * - Does NOT auto-complete epic in FeatureLoader (delegated to CompletionDetectorService)
 * - Does NOT trigger for features without epicId
 * - Handles missing epic gracefully (warn + no crash)
 * - Does NOT trigger for blocked children
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// --- Module mocks (must be declared before imports) ---

vi.mock('@protolabsai/platform', () => ({
  validatePath: vi.fn(),
  PathNotAllowedError: class PathNotAllowedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PathNotAllowedError';
    }
  },
  getAutomakerDir: vi.fn((p: string) => `${p}/.automaker`),
  getFeaturesDir: vi.fn((p: string) => `${p}/.automaker/features`),
  getFeatureDir: vi.fn((p: string, id: string) => `${p}/.automaker/features/${id}`),
  getFeatureImagesDir: vi.fn((p: string, id: string) => `${p}/.automaker/features/${id}/images`),
  getFeatureBackupDir: vi.fn((p: string, id: string) => `${p}/.automaker/backups/${id}`),
  getAppSpecPath: vi.fn((p: string) => `${p}/app_spec.txt`),
  ensureAutomakerDir: vi.fn(),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  atomicWriteJson: vi.fn().mockResolvedValue(undefined),
  readJsonWithRecovery: vi.fn(),
  logRecoveryWarning: vi.fn(),
  DEFAULT_BACKUP_COUNT: 3,
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('../../src/lib/secure-fs.js', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/prometheus.js', () => ({
  featuresByStatus: {
    inc: vi.fn(),
    dec: vi.fn(),
    reset: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../src/lib/debug-log.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/lib/xml-extractor.js', () => ({
  addImplementedFeature: vi.fn((spec: string) => spec),
}));

// --- Imports (after mocks) ---

import { readJsonWithRecovery, atomicWriteJson } from '@protolabsai/utils';
import { FeatureLoader } from '../../src/services/feature-loader.js';

// --- Helpers ---

const PROJECT_PATH = '/fake/project';

function makeFeature(overrides: Partial<Feature>): Feature {
  return {
    id: overrides.id ?? 'feature-123',
    title: overrides.title ?? 'Test Feature',
    description: overrides.description ?? 'A test feature',
    category: overrides.category ?? 'Test',
    status: overrides.status ?? 'backlog',
    featureType: 'code',
    createdAt: new Date().toISOString(),
    statusHistory: [],
    ...overrides,
  };
}

/** Configure readJsonWithRecovery to return the given feature when its path is queried */
function mockFeatureStore(features: Feature[]): void {
  const featureMap = new Map<string, Feature>(features.map((f) => [f.id, f]));
  const mockRead = vi.mocked(readJsonWithRecovery);
  mockRead.mockImplementation(async (filePath: string) => {
    // Extract featureId from path like /fake/project/.automaker/features/{featureId}/feature.json
    const match = /features\/([^/]+)\/feature\.json$/.exec(filePath);
    if (match) {
      const featureId = match[1];
      const feature = featureMap.get(featureId) ?? null;
      return { data: feature, recovered: false };
    }
    return { data: null, recovered: false };
  });
}

/** Capture all atomicWriteJson calls and build a record of written features */
function captureWrites(): { getWritten: (featureId: string) => Feature | undefined } {
  const written = new Map<string, Feature>();
  vi.mocked(atomicWriteJson).mockImplementation(async (filePath: string, data: unknown) => {
    const match = /features\/([^/]+)\/feature\.json$/.exec(filePath);
    if (match) {
      written.set(match[1], data as Feature);
    }
  });
  return {
    getWritten: (id: string) => written.get(id),
  };
}

// --- Tests ---

describe('FeatureLoader — epic completion delegation', () => {
  let loader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
  });

  it('does NOT auto-complete epic in FeatureLoader when last child transitions to done', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'in_progress' });

    // child2 is about to become done — all children will be done after this
    const child2Done = { ...child2, status: 'done' as const };
    mockFeatureStore([epic, child1, child2Done]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [epic, child1, child2].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    const { getWritten } = captureWrites();

    await loader.update(PROJECT_PATH, 'child-2', { status: 'done' });

    // FeatureLoader should NOT write the epic as done — that's CompletionDetectorService's job
    const writtenEpic = getWritten('epic-1');
    expect(writtenEpic?.status).not.toBe('done');
  });

  it('does NOT auto-complete epic when some children are still in progress', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'in_progress' });
    const child3 = makeFeature({ id: 'child-3', epicId: 'epic-1', status: 'backlog' });

    // child1 just moved to done, but child2 and child3 are not done
    mockFeatureStore([epic, child1, child2, child3]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [epic, child1, child2, child3].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    const { getWritten } = captureWrites();

    await loader.update(PROJECT_PATH, 'child-1', { status: 'done' });

    const writtenEpic = getWritten('epic-1');
    expect(writtenEpic?.status).not.toBe('done');
  });

  it('does NOT auto-complete epic when it is already done', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'done' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2Done = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'done' });

    mockFeatureStore([epic, child1, child2Done]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [epic, child1, child2Done].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    const mockWrite = vi.mocked(atomicWriteJson);
    const callsBefore = mockWrite.mock.calls.length;

    await loader.update(PROJECT_PATH, 'child-2', { status: 'done' });

    // atomicWriteJson should only have been called once (for child-2 update itself),
    // not an additional call for the epic (which is already done)
    const epicWriteCalls = mockWrite.mock.calls
      .slice(callsBefore)
      .filter((call) => (call[0] as string).includes('epic-1'));
    expect(epicWriteCalls).toHaveLength(0);
  });

  it('does NOT trigger epic check for features without epicId', async () => {
    const standalone = makeFeature({ id: 'standalone-1', status: 'in_progress' });
    // No epicId on the feature

    mockFeatureStore([standalone]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [standalone].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    const mockWrite = vi.mocked(atomicWriteJson);

    await loader.update(PROJECT_PATH, 'standalone-1', { status: 'done' });

    // Only one write — for the standalone feature itself
    const totalCalls = mockWrite.mock.calls.length;
    expect(totalCalls).toBe(1);
  });

  it('handles a missing epic gracefully (no crash)', async () => {
    // Child feature references a non-existent epicId
    const child = makeFeature({ id: 'child-1', epicId: 'ghost-epic', status: 'in_progress' });

    // Store has no ghost-epic
    mockFeatureStore([child]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [child].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    // Should not throw
    await expect(loader.update(PROJECT_PATH, 'child-1', { status: 'done' })).resolves.toBeDefined();
  });

  it('does NOT auto-complete epic when blocked children exist', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'blocked' });

    mockFeatureStore([epic, child1, child2]);

    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [epic, child1, child2].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    const { getWritten } = captureWrites();

    await loader.update(PROJECT_PATH, 'child-1', { status: 'done' });

    const writtenEpic = getWritten('epic-1');
    expect(writtenEpic?.status).not.toBe('done');
  });
});

describe('FeatureLoader — promote-to-delivery (#4073)', () => {
  let loader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
  });

  it('clears stale read-only gitWorkflow + workflow overrides when promoting executionMode to standard', async () => {
    const feature = makeFeature({
      id: 'ro-1',
      status: 'backlog',
      executionMode: 'read-only',
      workflow: 'read-only',
      gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    });
    mockFeatureStore([feature]);
    const { getWritten } = captureWrites();

    const result = await loader.update(PROJECT_PATH, 'ro-1', { executionMode: 'standard' });

    // The stale all-false gitWorkflow and the read-only workflow pin must be cleared so the
    // feature re-inherits delivery defaults and re-resolves cleanly (not snap back to read-only).
    expect(result.executionMode).toBe('standard');
    expect(result.gitWorkflow).toBeUndefined();
    expect(result.workflow).toBeUndefined();

    const written = getWritten('ro-1');
    expect(written?.gitWorkflow).toBeUndefined();
    expect(written?.workflow).toBeUndefined();
  });

  it('does NOT clobber gitWorkflow/workflow that the caller sets explicitly in the same update', async () => {
    const feature = makeFeature({
      id: 'ro-2',
      status: 'backlog',
      executionMode: 'read-only',
      gitWorkflow: { autoCommit: false, autoPush: false, autoCreatePR: false },
    });
    mockFeatureStore([feature]);
    const { getWritten } = captureWrites();

    const result = await loader.update(PROJECT_PATH, 'ro-2', {
      executionMode: 'standard',
      gitWorkflow: { autoCommit: true, autoPush: true, autoCreatePR: false },
      workflow: 'audit',
    });

    expect(result.gitWorkflow).toEqual({ autoCommit: true, autoPush: true, autoCreatePR: false });
    expect(result.workflow).toBe('audit');
    const written = getWritten('ro-2');
    expect(written?.gitWorkflow).toEqual({ autoCommit: true, autoPush: true, autoCreatePR: false });
  });

  it('leaves gitWorkflow untouched for a normal (non-promoting) update', async () => {
    const feature = makeFeature({
      id: 'std-1',
      status: 'backlog',
      executionMode: 'standard',
      gitWorkflow: { autoCommit: true, autoPush: true, autoCreatePR: true },
    });
    mockFeatureStore([feature]);
    const { getWritten } = captureWrites();

    await loader.update(PROJECT_PATH, 'std-1', { title: 'Renamed' });

    const written = getWritten('std-1');
    expect(written?.gitWorkflow).toEqual({ autoCommit: true, autoPush: true, autoCreatePR: true });
    expect(written?.executionMode).toBe('standard');
  });
});
