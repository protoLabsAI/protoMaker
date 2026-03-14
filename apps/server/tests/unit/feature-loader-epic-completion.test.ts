/**
 * Unit tests for FeatureLoader epic auto-completion
 *
 * When the last child feature of an epic transitions to 'done',
 * the epic should automatically transition to 'done' as well.
 *
 * Coverage:
 * - Auto-completes epic when all children are done
 * - Does NOT auto-complete when some children are still pending
 * - Does NOT auto-complete when epic is already done
 * - Sets completedAt and status history entry on the epic
 * - Handles missing epic gracefully (warn + no crash)
 * - Does NOT trigger for features without epicId
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

describe('FeatureLoader — epic auto-completion', () => {
  let loader: FeatureLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new FeatureLoader();
  });

  it('auto-completes the epic when the last child transitions to done', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'in_progress' });

    // Start: child2 is about to become done
    mockFeatureStore([epic, child1, child2]);
    const { getWritten } = captureWrites();

    // Update child2 to done — this should trigger epic auto-completion
    // We must re-stub readdir to allow getAll() to work
    const secureFs = await import('../../src/lib/secure-fs.js');
    vi.mocked(secureFs.readdir).mockResolvedValue(
      [epic, child1, child2].map((f) => ({
        name: f.id,
        isDirectory: () => true,
      })) as unknown as Awaited<ReturnType<typeof secureFs.readdir>>
    );

    // After child2 is written as 'done', getAll should reflect the updated state
    // We need the feature store to return child2 as done when re-queried
    const child2Done = { ...child2, status: 'done' as const };
    mockFeatureStore([epic, child1, child2Done]);

    await loader.update(PROJECT_PATH, 'child-2', { status: 'done' });

    // The epic should have been written with status 'done'
    const writtenEpic = getWritten('epic-1');
    expect(writtenEpic).toBeDefined();
    expect(writtenEpic?.status).toBe('done');
    expect(writtenEpic?.completedAt).toBeDefined();
  });

  it('adds "All child features completed" to epic status history', async () => {
    const epic = makeFeature({ id: 'epic-1', isEpic: true, status: 'in_progress' });
    const child1 = makeFeature({ id: 'child-1', epicId: 'epic-1', status: 'done' });
    const child2 = makeFeature({ id: 'child-2', epicId: 'epic-1', status: 'in_progress' });

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

    const writtenEpic = getWritten('epic-1');
    const lastTransition = writtenEpic?.statusHistory?.[writtenEpic.statusHistory.length - 1];
    expect(lastTransition?.reason).toBe('All child features completed');
    expect(lastTransition?.to).toBe('done');
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

    // Epic should NOT be written with done status
    const writtenEpic = getWritten('epic-1');
    // If epic was written (e.g. for some reason), it should not be 'done'
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
