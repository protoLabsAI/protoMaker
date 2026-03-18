import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrajectoryQueryService } from '@/services/trajectory-query-service.js';
import type { VerifiedTrajectory } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTrajectory(overrides: Partial<VerifiedTrajectory> = {}): VerifiedTrajectory {
  return {
    featureId: 'feature-abc',
    domain: 'backend',
    complexity: 'medium',
    model: 'claude-sonnet-4-6',
    planSummary: 'Add REST endpoint for user profile',
    executionSummary: 'Created route handler and service layer',
    costUsd: 0.05,
    durationMs: 30000,
    retryCount: 0,
    verified: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    attemptNumber: 1,
    ...overrides,
  };
}

function makeFeatureJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'feature-abc',
    title: 'Add user profile endpoint',
    description: 'REST endpoint for reading and updating user profile data',
    filesToModify: ['apps/server/src/routes/user.ts', 'apps/server/src/services/user-service.ts'],
    domain: 'backend',
    complexity: 'medium',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Filesystem mock helpers
// ---------------------------------------------------------------------------

type FsPromises = typeof import('node:fs/promises');

function setupFsMock(config: {
  trajectoryFeatureIds?: string[];
  trajectoryFiles?: Record<string, string[]>;
  trajectoryContents?: Record<string, VerifiedTrajectory[]>;
  featureJsons?: Record<string, Record<string, unknown> | null>;
}): void {
  const {
    trajectoryFeatureIds = [],
    trajectoryFiles = {},
    trajectoryContents = {},
    featureJsons = {},
  } = config;

  vi.doMock(
    'node:fs/promises',
    (): Partial<FsPromises> => ({
      readdir: vi.fn((dirPath: unknown, opts?: unknown) => {
        const p = dirPath as string;
        // Top-level trajectory dir → feature dirs
        if (p.endsWith('trajectory')) {
          if (opts && typeof opts === 'object' && 'withFileTypes' in opts) {
            return Promise.resolve(
              trajectoryFeatureIds.map((id) => ({
                name: id,
                isDirectory: () => true,
                isFile: () => false,
              }))
            ) as ReturnType<FsPromises['readdir']>;
          }
          return Promise.resolve(trajectoryFeatureIds) as ReturnType<FsPromises['readdir']>;
        }
        // Feature trajectory dir → attempt files
        for (const featureId of trajectoryFeatureIds) {
          if (p.endsWith(`trajectory/${featureId}`)) {
            return Promise.resolve(trajectoryFiles[featureId] ?? []) as ReturnType<
              FsPromises['readdir']
            >;
          }
        }
        return Promise.resolve([]) as ReturnType<FsPromises['readdir']>;
      }),
      readFile: vi.fn((filePath: unknown) => {
        const p = filePath as string;
        // Attempt files
        for (const featureId of trajectoryFeatureIds) {
          const attempts = trajectoryContents[featureId] ?? [];
          for (const attempt of attempts) {
            if (p.includes(`trajectory/${featureId}/attempt-${attempt.attemptNumber}.json`)) {
              return Promise.resolve(JSON.stringify(attempt));
            }
          }
        }
        // Feature JSON files
        for (const [featureId, json] of Object.entries(featureJsons)) {
          if (p.includes(`features/${featureId}/feature.json`)) {
            if (json === null) return Promise.reject(new Error('ENOENT'));
            return Promise.resolve(JSON.stringify(json));
          }
        }
        return Promise.reject(new Error(`ENOENT: no such file: ${p}`));
      }),
    })
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrajectoryQueryService', () => {
  let service: TrajectoryQueryService;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    service = new TrajectoryQueryService();
  });

  // ---- Empty store --------------------------------------------------------

  it('returns empty array when trajectory directory does not exist', async () => {
    vi.doMock(
      'node:fs/promises',
      (): Partial<FsPromises> => ({
        readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
        readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      })
    );
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project' });
    expect(results).toEqual([]);
  });

  it('returns empty array when no feature directories exist', async () => {
    setupFsMock({ trajectoryFeatureIds: [] });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project' });
    expect(results).toEqual([]);
  });

  it('returns empty array when feature has no attempt files', async () => {
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': [] },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' });
    expect(results).toEqual([]);
  });

  // ---- Domain matching ---------------------------------------------------

  it('boosts score for exact domain match', async () => {
    const trajectory = makeTrajectory({
      featureId: 'feature-abc',
      domain: 'backend',
      verified: true,
    });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: { 'feature-abc': makeFeatureJson({ domain: 'backend' }) },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' });
    expect(results).toHaveLength(1);
    expect(results[0].similarityScore).toBeGreaterThanOrEqual(2); // domain match = +2
  });

  it('filters out zero-score results when a query signal is provided', async () => {
    const backendTrajectory = makeTrajectory({ featureId: 'feature-abc', domain: 'backend' });
    const frontendTrajectory = makeTrajectory({ featureId: 'feature-xyz', domain: 'frontend' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc', 'feature-xyz'],
      trajectoryFiles: {
        'feature-abc': ['attempt-1.json'],
        'feature-xyz': ['attempt-1.json'],
      },
      trajectoryContents: {
        'feature-abc': [backendTrajectory],
        'feature-xyz': [frontendTrajectory],
      },
      featureJsons: {
        'feature-abc': makeFeatureJson({ domain: 'backend' }),
        'feature-xyz': makeFeatureJson({ title: 'Frontend work', domain: 'frontend' }),
      },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({
      projectPath: '/test/project',
      domain: 'backend',
      complexity: 'large', // no match in test fixtures
    });
    // Only backend feature should match (frontend gets 0 score)
    expect(results.every((r) => r.featureId === 'feature-abc')).toBe(true);
  });

  // ---- Complexity matching -----------------------------------------------

  it('boosts score for exact complexity match', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-abc', complexity: 'large' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: { 'feature-abc': makeFeatureJson({ complexity: 'large' }) },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', complexity: 'large' });
    expect(results).toHaveLength(1);
    expect(results[0].similarityScore).toBeGreaterThanOrEqual(1); // complexity match = +1
  });

  // ---- Jaccard similarity ------------------------------------------------

  it('applies Jaccard score when filesToModify overlap exceeds threshold', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-abc', verified: true });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: {
        'feature-abc': makeFeatureJson({
          filesToModify: [
            'apps/server/src/routes/user.ts',
            'apps/server/src/services/user-service.ts',
            'apps/server/src/types/user.ts',
          ],
        }),
      },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({
      projectPath: '/test/project',
      filesToModify: [
        'apps/server/src/routes/user.ts', // overlap
        'apps/server/src/services/user-service.ts', // overlap
        'apps/server/src/services/other.ts', // no overlap
      ],
    });
    // Jaccard = 2/4 = 0.5, which is > 0.3 threshold → should be included
    expect(results).toHaveLength(1);
    expect(results[0].similarityScore).toBeGreaterThan(0);
  });

  it('excludes features below the Jaccard threshold', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-abc' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: {
        'feature-abc': makeFeatureJson({
          filesToModify: [
            'apps/server/src/routes/user.ts',
            'apps/server/src/services/user-service.ts',
            'apps/server/src/services/auth.ts',
            'apps/server/src/services/session.ts',
          ],
        }),
      },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({
      projectPath: '/test/project',
      // Jaccard = 1/8 = 0.125, below 0.3 threshold
      filesToModify: [
        'apps/server/src/routes/user.ts', // 1 overlap out of 8 union
        'completely/different/file.ts',
        'another/file.ts',
        'yet/another.ts',
        'and/one/more.ts',
      ],
    });
    // Should be filtered out (score = 0 from filesToModify, and no other signals)
    expect(results).toHaveLength(0);
  });

  it('respects custom jaccardThreshold', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-abc' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: {
        'feature-abc': makeFeatureJson({
          filesToModify: [
            'apps/server/src/routes/user.ts',
            'apps/server/src/services/user-service.ts',
          ],
        }),
      },
    });
    const svc = new TrajectoryQueryService();
    // Jaccard = 1/3 ≈ 0.333, above default 0.3 but this custom threshold is 0.4
    const results = await svc.findSimilar({
      projectPath: '/test/project',
      filesToModify: ['apps/server/src/routes/user.ts', 'different/file.ts', 'another/file.ts'],
      jaccardThreshold: 0.4,
    });
    expect(results).toHaveLength(0);
  });

  // ---- Keyword overlap ---------------------------------------------------

  it('scores keyword overlap between query title/description and stored feature', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-abc' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: {
        'feature-abc': makeFeatureJson({
          title: 'User profile endpoint REST API',
          description: 'Build a profile endpoint for user data',
        }),
      },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({
      projectPath: '/test/project',
      title: 'User profile API',
      description: 'REST endpoint for profile',
    });
    expect(results).toHaveLength(1);
    expect(results[0].similarityScore).toBeGreaterThan(0);
  });

  // ---- Top K ranking -----------------------------------------------------

  it('returns at most topK results sorted by score descending', async () => {
    // 4 features with different domain match quality
    const ids = ['f-backend-1', 'f-backend-2', 'f-backend-3', 'f-frontend'];
    const trajectoryFiles = Object.fromEntries(ids.map((id) => [id, ['attempt-1.json']]));
    const trajectoryContents = Object.fromEntries(
      ids.map((id) => [
        id,
        [
          makeTrajectory({
            featureId: id,
            domain: id.startsWith('f-backend') ? 'backend' : 'frontend',
          }),
        ],
      ])
    );
    const featureJsons = Object.fromEntries(
      ids.map((id) => [
        id,
        makeFeatureJson({ domain: id.startsWith('f-backend') ? 'backend' : 'frontend', title: id }),
      ])
    );

    setupFsMock({ trajectoryFeatureIds: ids, trajectoryFiles, trajectoryContents, featureJsons });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' }, 3);

    expect(results.length).toBeLessThanOrEqual(3);
    // All returned results should be backend (score >= 2)
    expect(results.every((r) => r.similarityScore >= 2)).toBe(true);
    // Scores should be in descending order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarityScore).toBeGreaterThanOrEqual(results[i + 1].similarityScore);
    }
  });

  // ---- Result structure --------------------------------------------------

  it('returns correctly structured result with feature metadata', async () => {
    const trajectory = makeTrajectory({
      featureId: 'feature-abc',
      model: 'claude-opus-4-6',
      executionSummary: 'Built the service layer successfully',
      verified: true,
      attemptNumber: 1,
    });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json'] },
      trajectoryContents: { 'feature-abc': [trajectory] },
      featureJsons: { 'feature-abc': makeFeatureJson({ title: 'Backend service' }) },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' });

    expect(results).toHaveLength(1);
    const result = results[0];
    expect(result.featureId).toBe('feature-abc');
    expect(result.featureTitle).toBe('Backend service');
    expect(result.complexity).toBe('medium');
    expect(result.model).toBe('claude-opus-4-6');
    expect(result.attemptCount).toBe(1);
    expect(result.executionSummary).toBe('Built the service layer successfully');
    expect(result.escalationReason).toBeUndefined();
  });

  it('includes escalationReason from failed attempt when present', async () => {
    const failedAttempt = makeTrajectory({
      featureId: 'feature-abc',
      verified: false,
      attemptNumber: 1,
      escalationReason: 'Type errors in generated code',
    });
    const verifiedAttempt = makeTrajectory({
      featureId: 'feature-abc',
      verified: true,
      attemptNumber: 2,
      escalationReason: undefined,
    });
    setupFsMock({
      trajectoryFeatureIds: ['feature-abc'],
      trajectoryFiles: { 'feature-abc': ['attempt-1.json', 'attempt-2.json'] },
      trajectoryContents: { 'feature-abc': [failedAttempt, verifiedAttempt] },
      featureJsons: { 'feature-abc': makeFeatureJson() },
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' });

    expect(results).toHaveLength(1);
    expect(results[0].attemptCount).toBe(2);
    expect(results[0].escalationReason).toBe('Type errors in generated code');
    // executionSummary should come from the verified attempt
    expect(results[0].executionSummary).toBe(verifiedAttempt.executionSummary);
  });

  it('uses featureId as featureTitle when feature.json is missing', async () => {
    const trajectory = makeTrajectory({ featureId: 'feature-xyz', domain: 'backend' });
    setupFsMock({
      trajectoryFeatureIds: ['feature-xyz'],
      trajectoryFiles: { 'feature-xyz': ['attempt-1.json'] },
      trajectoryContents: { 'feature-xyz': [trajectory] },
      featureJsons: { 'feature-xyz': null }, // will trigger ENOENT
    });
    const svc = new TrajectoryQueryService();
    const results = await svc.findSimilar({ projectPath: '/test/project', domain: 'backend' });
    expect(results).toHaveLength(1);
    expect(results[0].featureTitle).toBe('feature-xyz');
  });

  // ---- No-query returns all features -----------------------------------

  it('returns all features when no signals are provided (no filter applied)', async () => {
    const ids = ['feat-1', 'feat-2', 'feat-3'];
    const trajectoryFiles = Object.fromEntries(ids.map((id) => [id, ['attempt-1.json']]));
    const trajectoryContents = Object.fromEntries(
      ids.map((id) => [id, [makeTrajectory({ featureId: id })]])
    );
    const featureJsons = Object.fromEntries(ids.map((id) => [id, makeFeatureJson({ title: id })]));

    setupFsMock({ trajectoryFeatureIds: ids, trajectoryFiles, trajectoryContents, featureJsons });
    const svc = new TrajectoryQueryService();
    // No query signals — all features have score 0, but should still be returned since no filter
    const results = await svc.findSimilar({ projectPath: '/test/project' });
    // topK default is 3
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
