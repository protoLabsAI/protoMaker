/**
 * Unit tests for epic auto-adoption logic
 *
 * Covers:
 * - extractEpicKeyword: bracket pattern parsing
 * - findCandidateEpic: pure matching logic against a feature list
 * - POST /features/create: adoption on create, no-match orphan, explicit null opt-out
 * - EpicAdoptionSweepCheck: periodic sweep adopts orphans
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';
import type { Request, Response } from 'express';

// --- Module mocks (before imports) ---

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
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/[\s\-]+/g, '-')),
}));

vi.mock('@protolabsai/platform', () => ({
  validatePath: vi.fn(),
  PathNotAllowedError: class PathNotAllowedError extends Error {},
  getAutomakerDir: vi.fn((p: string) => `${p}/.automaker`),
  getFeaturesDir: vi.fn((p: string) => `${p}/.automaker/features`),
  getFeatureDir: vi.fn((p: string, id: string) => `${p}/.automaker/features/${id}`),
  getFeatureImagesDir: vi.fn((p: string, id: string) => `${p}/.automaker/features/${id}/images`),
  getFeatureBackupDir: vi.fn((p: string, id: string) => `${p}/.automaker/backups/${id}`),
  getAppSpecPath: vi.fn((p: string) => `${p}/app_spec.txt`),
  ensureAutomakerDir: vi.fn(),
  isValidBranchName: vi.fn(() => true),
}));

vi.mock('@/lib/secure-fs.js', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn(),
}));

vi.mock('@/lib/xml-extractor.js', () => ({
  addImplementedFeature: vi.fn(),
}));

vi.mock('@/lib/debug-log.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('@/lib/prometheus.js', () => ({
  featuresByStatus: { inc: vi.fn(), dec: vi.fn(), set: vi.fn() },
}));

vi.mock('@/services/quarantine-service.js', () => ({
  QuarantineService: class MockQuarantineService {
    process(input: { title: string; description: string }) {
      return Promise.resolve({
        approved: true,
        sanitizedTitle: input.title,
        sanitizedDescription: input.description,
        entry: { id: 'q-1', result: 'approved', stage: 'passed', violations: [] },
      });
    }
  },
}));

// --- Imports ---

import { extractEpicKeyword, findCandidateEpic } from '@/services/feature-loader.js';
import { createCreateHandler } from '@/routes/features/routes/create.js';
import { EpicAdoptionSweepCheck } from '@/services/maintenance/checks/epic-adoption-sweep-check.js';
import { createMockExpressContext } from '../../utils/mocks.js';

// Helper to build a minimal Feature object
function makeFeature(overrides: Partial<Feature> & { id: string; title: string }): Feature {
  return {
    status: 'backlog',
    description: '',
    category: 'test',
    ...overrides,
  } as Feature;
}

// ---------------------------------------------------------------------------
// extractEpicKeyword
// ---------------------------------------------------------------------------

describe('extractEpicKeyword', () => {
  it('extracts keyword from [Arc 1.2] prefix', () => {
    expect(extractEpicKeyword('[Arc 1.2] Implement GOAP planner')).toBe('Arc');
  });

  it('extracts keyword from [Arc 0.1] prefix', () => {
    expect(extractEpicKeyword('[Arc 0.1] Scaffold types')).toBe('Arc');
  });

  it('extracts keyword from dash-separated [TR-1.2]', () => {
    expect(extractEpicKeyword('[TR-1.2] Some task')).toBe('TR');
  });

  it('extracts keyword from [DD-2.3] prefix', () => {
    expect(extractEpicKeyword('[DD-2.3] Deep dive analysis')).toBe('DD');
  });

  it('extracts hyphenated keyword from [Epic-Name 1.0]', () => {
    expect(extractEpicKeyword('[Epic-Name 1.0] Build the thing')).toBe('Epic-Name');
  });

  it('returns null when title has no bracket pattern', () => {
    expect(extractEpicKeyword('Implement auth flow')).toBeNull();
  });

  it('returns null when bracket content has no version number', () => {
    expect(extractEpicKeyword('[WIP] some task')).toBeNull();
  });

  it('returns null for empty title', () => {
    expect(extractEpicKeyword('')).toBeNull();
  });

  it('returns null when bracket is mid-title (not at start)', () => {
    expect(extractEpicKeyword('Some [Arc 1.2] task')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findCandidateEpic
// ---------------------------------------------------------------------------

describe('findCandidateEpic', () => {
  const arcEpic = makeFeature({
    id: 'epic-arc',
    title: 'Arc — Living Agent Orchestrator',
    isEpic: true,
  });

  it('returns the matching epic when exactly one epic contains the keyword', () => {
    const features = [arcEpic];
    const result = findCandidateEpic('[Arc 0.1] Scaffold types', features);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('epic-arc');
  });

  it('returns null when title has no bracket pattern', () => {
    const features = [arcEpic];
    expect(findCandidateEpic('Implement GOAP planner', features)).toBeNull();
  });

  it('returns null when no epic title matches the keyword', () => {
    const features = [arcEpic];
    expect(findCandidateEpic('[QZ-1.2] Unrelated task', features)).toBeNull();
  });

  it('returns null when multiple epics match the keyword (ambiguous)', () => {
    const arcEpic2 = makeFeature({ id: 'epic-arc-2', title: 'Arc Phase 2', isEpic: true });
    const features = [arcEpic, arcEpic2];
    expect(findCandidateEpic('[Arc 0.1] Some child', features)).toBeNull();
  });

  it('skips archived epics when matching', () => {
    const archivedArcEpic = makeFeature({
      id: 'epic-arc-archived',
      title: 'Arc — Old Orchestrator',
      isEpic: true,
      archived: true,
    });
    const features = [archivedArcEpic];
    expect(findCandidateEpic('[Arc 0.1] Child task', features)).toBeNull();
  });

  it('matches via slug when epic title uses different casing', () => {
    const upperEpic = makeFeature({ id: 'epic-dd', title: 'DD Deep Dive Analysis', isEpic: true });
    const features = [upperEpic];
    const result = findCandidateEpic('[DD-1.1] subtask', features);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('epic-dd');
  });

  it('returns null for empty title', () => {
    const features = [arcEpic];
    expect(findCandidateEpic('', features)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /features/create — auto-adoption
// ---------------------------------------------------------------------------

function createMockFeatureLoader(epicFeatures: Feature[] = [], createdFeature?: Partial<Feature>) {
  const defaultCreated = { id: 'feat-new', title: 'sanitized-title', status: 'backlog' };
  return {
    get: vi.fn(),
    getAll: vi.fn().mockResolvedValue(epicFeatures),
    update: vi.fn().mockResolvedValue({ ...defaultCreated }),
    create: vi.fn().mockResolvedValue({ ...defaultCreated, ...createdFeature }),
    findDuplicateTitle: vi.fn().mockResolvedValue(null),
    findCandidateEpicForTitle: vi.fn().mockImplementation((_path: string, title: string) => {
      return Promise.resolve(findCandidateEpic(title, epicFeatures));
    }),
  };
}

function createMockTrustTierService() {
  return { classifyTrust: vi.fn().mockReturnValue(1) };
}

const arcEpicFeature = makeFeature({
  id: 'epic-arc',
  title: 'Arc — Living Agent Orchestrator',
  isEpic: true,
});

describe('POST /features/create — epic auto-adoption', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createMockExpressContext();
    req = ctx.req;
    res = ctx.res;
  });

  it('auto-adopts a feature with [Arc 0.1] title into the matching epic', async () => {
    const mockLoader = createMockFeatureLoader([arcEpicFeature]);
    req.body = {
      projectPath: '/test/project',
      feature: {
        title: '[Arc 0.1] Scaffold types',
        description: 'Build the foundation types',
      },
    };

    const handler = createCreateHandler(mockLoader as any, createMockTrustTierService() as any);
    await handler(req, res);

    // Verify findCandidateEpicForTitle was called
    expect(mockLoader.findCandidateEpicForTitle).toHaveBeenCalledWith(
      '/test/project',
      expect.any(String)
    );

    // Verify create was called with epicId set to the arc epic
    expect(mockLoader.create).toHaveBeenCalledWith(
      '/test/project',
      expect.objectContaining({ epicId: 'epic-arc' })
    );

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('creates an orphan when no epic matches the title pattern', async () => {
    const mockLoader = createMockFeatureLoader([arcEpicFeature]);
    req.body = {
      projectPath: '/test/project',
      feature: {
        title: '[QZ-1.0] Unrelated task',
        description: 'Something unrelated',
      },
    };

    const handler = createCreateHandler(mockLoader as any, createMockTrustTierService() as any);
    await handler(req, res);

    // create called WITHOUT epicId set from auto-adoption
    const createCall = mockLoader.create.mock.calls[0];
    expect(createCall).toBeDefined();
    expect(createCall[1].epicId).toBeUndefined();

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('skips auto-adoption when epicId: null is explicitly provided (opt-out)', async () => {
    const mockLoader = createMockFeatureLoader([arcEpicFeature]);
    req.body = {
      projectPath: '/test/project',
      feature: {
        title: '[Arc 0.1] Scaffold types',
        description: 'Build the foundation types',
        epicId: null,
      },
    };

    const handler = createCreateHandler(mockLoader as any, createMockTrustTierService() as any);
    await handler(req, res);

    // findCandidateEpicForTitle must NOT be called
    expect(mockLoader.findCandidateEpicForTitle).not.toHaveBeenCalled();

    // create called without epicId override
    const createCall = mockLoader.create.mock.calls[0];
    expect(createCall).toBeDefined();
    expect(createCall[1].epicId == null).toBe(true);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('skips auto-adoption when epicId is already explicitly provided (non-null)', async () => {
    const mockLoader = createMockFeatureLoader([arcEpicFeature]);
    req.body = {
      projectPath: '/test/project',
      feature: {
        title: '[Arc 0.1] Scaffold types',
        description: 'Build the foundation types',
        epicId: 'explicit-epic-id',
      },
    };

    const handler = createCreateHandler(mockLoader as any, createMockTrustTierService() as any);
    await handler(req, res);

    // findCandidateEpicForTitle must NOT be called (already parented)
    expect(mockLoader.findCandidateEpicForTitle).not.toHaveBeenCalled();

    // epicId preserved as originally specified
    expect(mockLoader.create).toHaveBeenCalledWith(
      '/test/project',
      expect.objectContaining({ epicId: 'explicit-epic-id' })
    );
  });

  it('skips auto-adoption for epic containers (isEpic: true)', async () => {
    const mockLoader = createMockFeatureLoader([arcEpicFeature]);
    req.body = {
      projectPath: '/test/project',
      feature: {
        title: '[Arc 0.1] Some epic',
        description: 'Epic container',
        isEpic: true,
      },
    };

    // NOTE: isEpic + epicId is rejected (400). This test sends isEpic without epicId.
    const handler = createCreateHandler(mockLoader as any, createMockTrustTierService() as any);
    await handler(req, res);

    // findCandidateEpicForTitle must NOT be called for epics
    expect(mockLoader.findCandidateEpicForTitle).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// EpicAdoptionSweepCheck — periodic sweep
// ---------------------------------------------------------------------------

describe('EpicAdoptionSweepCheck', () => {
  it('adopts orphaned features with matching bracket patterns into their epics', async () => {
    const orphan = makeFeature({ id: 'feat-orphan', title: '[Arc 0.1] Orphaned task' });
    const epicArc = makeFeature({
      id: 'epic-arc',
      title: 'Arc — Living Agent Orchestrator',
      isEpic: true,
    });
    const mockLoader = {
      getAll: vi.fn().mockResolvedValue([orphan, epicArc]),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const check = new EpicAdoptionSweepCheck(mockLoader as any);
    const result = await check.run({ projectPaths: ['/test/project'] });

    expect(result.passed).toBe(true);
    expect(mockLoader.update).toHaveBeenCalledWith('/test/project', 'feat-orphan', {
      epicId: 'epic-arc',
    });
    expect(result.details?.totalAdopted).toBe(1);
  });

  it('does not adopt features with no matching epic pattern', async () => {
    const nonMatch = makeFeature({ id: 'feat-1', title: 'Regular feature without bracket' });
    const epicArc = makeFeature({
      id: 'epic-arc',
      title: 'Arc — Living Agent Orchestrator',
      isEpic: true,
    });
    const mockLoader = {
      getAll: vi.fn().mockResolvedValue([nonMatch, epicArc]),
      update: vi.fn(),
    };

    const check = new EpicAdoptionSweepCheck(mockLoader as any);
    const result = await check.run({ projectPaths: ['/test/project'] });

    expect(mockLoader.update).not.toHaveBeenCalled();
    expect(result.details?.totalAdopted).toBe(0);
  });

  it('does not re-adopt features that already have an epicId', async () => {
    const alreadyParented = makeFeature({
      id: 'feat-1',
      title: '[Arc 0.1] Already parented',
      epicId: 'epic-arc',
    });
    const epicArc = makeFeature({
      id: 'epic-arc',
      title: 'Arc — Living Agent Orchestrator',
      isEpic: true,
    });
    const mockLoader = {
      getAll: vi.fn().mockResolvedValue([alreadyParented, epicArc]),
      update: vi.fn(),
    };

    const check = new EpicAdoptionSweepCheck(mockLoader as any);
    await check.run({ projectPaths: ['/test/project'] });

    expect(mockLoader.update).not.toHaveBeenCalled();
  });

  it('sweeps across multiple project paths', async () => {
    const orphan1 = makeFeature({ id: 'feat-a', title: '[Arc 0.1] Task A' });
    const orphan2 = makeFeature({ id: 'feat-b', title: '[Arc 0.2] Task B' });
    const epicArc = makeFeature({
      id: 'epic-arc',
      title: 'Arc — Living Agent Orchestrator',
      isEpic: true,
    });

    const mockLoader = {
      getAll: vi
        .fn()
        .mockResolvedValueOnce([orphan1, epicArc])
        .mockResolvedValueOnce([orphan2, epicArc]),
      update: vi.fn().mockResolvedValue(undefined),
    };

    const check = new EpicAdoptionSweepCheck(mockLoader as any);
    const result = await check.run({
      projectPaths: ['/project/one', '/project/two'],
    });

    expect(mockLoader.update).toHaveBeenCalledTimes(2);
    expect(result.details?.totalAdopted).toBe(2);
  });
});
