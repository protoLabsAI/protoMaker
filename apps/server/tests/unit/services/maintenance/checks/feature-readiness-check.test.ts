import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FeatureReadinessCheck,
  scoreDescription,
  scoreAcceptanceCriteria,
  scoreFilesToModify,
  scoreDependencyCompleteness,
  computeReadinessScore,
  DEFAULT_READINESS_WEIGHTS,
  type EnhancementModel,
  type ProjectContextLoader,
} from '@/services/maintenance/checks/feature-readiness-check.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature>): Feature {
  return {
    id: 'feat-1',
    title: 'Test Feature',
    category: 'test',
    description: '',
    status: 'backlog',
    ...overrides,
  } as Feature;
}

// ---------------------------------------------------------------------------
// Dimension scorer unit tests
// ---------------------------------------------------------------------------

describe('scoreDescription', () => {
  it('returns 0 for empty or missing description', () => {
    expect(scoreDescription('')).toBe(0);
    expect(scoreDescription('   ')).toBe(0);
  });

  it('returns partial score for short description without technical detail', () => {
    const score = scoreDescription('Add a button');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns full length sub-score for description >= 100 chars', () => {
    const longDesc = 'a'.repeat(100);
    const score = scoreDescription(longDesc);
    // 0.6 for length (full) + 0 for no technical detail
    expect(score).toBeCloseTo(0.6, 1);
  });

  it('adds technical detail sub-score when patterns match', () => {
    const desc = 'Add a new API endpoint for user authentication in the service module';
    const score = scoreDescription(desc);
    // Should have both length contribution and technical detail (0.4)
    expect(score).toBeGreaterThan(0.6);
  });

  it('returns 1.0 for long, technically detailed description', () => {
    const desc =
      'Create a new service endpoint that handles user authentication. ' +
      'The API should validate JWT tokens and return the user profile from the database schema.';
    const score = scoreDescription(desc);
    expect(score).toBe(1);
  });

  it('detects file extensions as technical detail', () => {
    const desc = 'Modify the config.json to add new settings';
    const score = scoreDescription(desc);
    expect(score).toBeGreaterThan(0.4); // Has technical detail
  });

  it('detects file paths as technical detail', () => {
    const desc = 'Update src/services/auth to support OAuth2 flow';
    const score = scoreDescription(desc);
    expect(score).toBeGreaterThan(0.4);
  });
});

describe('scoreAcceptanceCriteria', () => {
  it('returns 0 for undefined criteria', () => {
    expect(scoreAcceptanceCriteria(undefined)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(scoreAcceptanceCriteria([])).toBe(0);
  });

  it('returns 0 for array of empty strings', () => {
    expect(scoreAcceptanceCriteria(['', '  '])).toBe(0);
  });

  it('returns 0.5 for 1 criterion (threshold is 2)', () => {
    expect(scoreAcceptanceCriteria(['Tests pass'])).toBe(0.5);
  });

  it('returns 1.0 for 2 or more criteria', () => {
    expect(scoreAcceptanceCriteria(['Tests pass', 'Build succeeds'])).toBe(1);
    expect(scoreAcceptanceCriteria(['A', 'B', 'C'])).toBe(1);
  });
});

describe('scoreFilesToModify', () => {
  it('returns 0 for undefined', () => {
    expect(scoreFilesToModify(undefined)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(scoreFilesToModify([])).toBe(0);
  });

  it('returns 0 for array of empty strings', () => {
    expect(scoreFilesToModify(['', '  '])).toBe(0);
  });

  it('returns 1 when at least one file is present', () => {
    expect(scoreFilesToModify(['src/index.ts'])).toBe(1);
  });
});

describe('scoreDependencyCompleteness', () => {
  const allIds = new Set(['a', 'b', 'c']);

  it('returns 1 for no dependencies', () => {
    expect(scoreDependencyCompleteness(undefined, allIds)).toBe(1);
    expect(scoreDependencyCompleteness([], allIds)).toBe(1);
  });

  it('returns 1 when all dependencies exist', () => {
    expect(scoreDependencyCompleteness(['a', 'b'], allIds)).toBe(1);
  });

  it('returns 0.5 when half of dependencies exist', () => {
    expect(scoreDependencyCompleteness(['a', 'missing'], allIds)).toBe(0.5);
  });

  it('returns 0 when no dependencies exist', () => {
    expect(scoreDependencyCompleteness(['x', 'y'], allIds)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Composite scorer tests
// ---------------------------------------------------------------------------

describe('computeReadinessScore', () => {
  const allIds = new Set(['feat-1', 'feat-2']);

  it('returns 0 for a completely empty feature', () => {
    const feature = makeFeature({ description: '' });
    const result = computeReadinessScore(feature, allIds);
    // description=0, criteria=0, files=0, deps=1 (no deps)
    expect(result.total).toBe(DEFAULT_READINESS_WEIGHTS.dependencyCompleteness);
  });

  it('returns 100 for a fully specified feature', () => {
    const feature = makeFeature({
      description:
        'Create a new service endpoint that handles user authentication. ' +
        'The API should validate JWT tokens and return the user profile from the database schema.',
      successCriteria: ['Tests pass', 'Build succeeds'],
      filesToModify: ['src/auth.ts'],
      dependencies: ['feat-2'],
    });
    const result = computeReadinessScore(feature, allIds);
    expect(result.total).toBe(100);
  });

  it('includes dimension breakdown', () => {
    const feature = makeFeature({
      description: 'Short desc',
      successCriteria: ['One'],
    });
    const result = computeReadinessScore(feature, allIds);
    expect(result.dimensions).toHaveProperty('description');
    expect(result.dimensions).toHaveProperty('acceptanceCriteria');
    expect(result.dimensions).toHaveProperty('filesToModify');
    expect(result.dimensions).toHaveProperty('dependencyCompleteness');
  });

  it('respects custom weights', () => {
    const feature = makeFeature({
      description: '',
      filesToModify: ['src/index.ts'],
    });
    const customWeights = {
      description: 0,
      acceptanceCriteria: 0,
      filesToModify: 100,
      dependencyCompleteness: 0,
    };
    const result = computeReadinessScore(feature, allIds, customWeights);
    expect(result.total).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// FeatureReadinessCheck.run() tests
// ---------------------------------------------------------------------------

describe('FeatureReadinessCheck', () => {
  let check: FeatureReadinessCheck;
  let mockFeatureLoader: {
    getAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let mockEnhancementModel: EnhancementModel;
  let mockContextLoader: ProjectContextLoader;

  beforeEach(() => {
    mockFeatureLoader = {
      getAll: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    mockEnhancementModel = {
      enhance: vi
        .fn()
        .mockResolvedValue(
          'Enriched description with technical details about the API endpoint and service module.'
        ),
    };
    mockContextLoader = {
      load: vi.fn().mockResolvedValue('Project context: This is a TypeScript monorepo.'),
    };
    check = new FeatureReadinessCheck(
      mockFeatureLoader as any,
      mockEnhancementModel,
      mockContextLoader,
      undefined,
      60
    );
  });

  it('returns no issues when all backlog features score above threshold', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({
        id: 'a',
        description:
          'Create a new service endpoint that handles user authentication. ' +
          'The API should validate JWT tokens and return the user profile from the database schema.',
        successCriteria: ['Tests pass', 'Build succeeds'],
        filesToModify: ['src/auth.ts'],
      }),
    ]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for non-backlog features', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'a', status: 'in_progress', description: '' }),
      makeFeature({ id: 'b', status: 'done', description: '' }),
      makeFeature({ id: 'c', status: 'review', description: '' }),
    ]);

    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('detects under-specified backlog features', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({ id: 'a', description: 'Fix the bug' }),
    ]);

    const issues = await check.run('/project');

    expect(issues).toHaveLength(1);
    expect(issues[0].checkId).toBe('feature-readiness');
    expect(issues[0].featureId).toBe('a');
    expect(issues[0].autoFixable).toBe(true);
    expect(issues[0].message).toContain('threshold: 60');
  });

  it('persists readiness score on each backlog feature', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Fix it' })]);

    await check.run('/project');

    expect(mockFeatureLoader.update).toHaveBeenCalledWith(
      '/project',
      'a',
      expect.objectContaining({ readinessScore: expect.any(Number) })
    );
  });

  it('skips score update when score has not changed', async () => {
    const feature = makeFeature({ id: 'a', description: '' });
    // Pre-compute what the score would be
    const allIds = new Set(['a']);
    const breakdown = computeReadinessScore(feature, allIds);
    feature.readinessScore = breakdown.total;

    mockFeatureLoader.getAll.mockResolvedValue([feature]);

    await check.run('/project');

    // update should NOT have been called for the score itself (only issue context would differ)
    const scoreCalls = mockFeatureLoader.update.mock.calls.filter(
      (c: any[]) => c[2]?.readinessScore !== undefined
    );
    expect(scoreCalls).toHaveLength(0);
  });

  it('uses warning severity for very low scores', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: '' })]);

    const issues = await check.run('/project');
    expect(issues[0].severity).toBe('warning');
  });

  it('uses info severity for scores near threshold', async () => {
    // Give it some score but below 60
    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({
        id: 'a',
        description: 'A moderately described feature that needs more technical detail added',
        filesToModify: ['src/index.ts'],
      }),
    ]);

    const issues = await check.run('/project');
    if (issues.length > 0) {
      // Score should be above 30 but below 60
      expect(issues[0].severity).toBe('info');
    }
  });

  it('includes deficit details in message', async () => {
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Short' })]);

    const issues = await check.run('/project');
    expect(issues[0].message).toContain('thin description');
    expect(issues[0].message).toContain('insufficient acceptance criteria');
    expect(issues[0].message).toContain('no filesToModify');
  });

  it('marks issues as not autoFixable when no enhancement model provided', async () => {
    const checkNoModel = new FeatureReadinessCheck(mockFeatureLoader as any);
    mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Short' })]);

    const issues = await checkNoModel.run('/project');
    expect(issues[0].autoFixable).toBe(false);
  });

  it('returns empty array when featureLoader throws', async () => {
    mockFeatureLoader.getAll.mockRejectedValue(new Error('disk error'));
    const issues = await check.run('/project');
    expect(issues).toHaveLength(0);
  });

  it('respects custom threshold', async () => {
    const lowThresholdCheck = new FeatureReadinessCheck(
      mockFeatureLoader as any,
      mockEnhancementModel,
      mockContextLoader,
      undefined,
      10
    );

    mockFeatureLoader.getAll.mockResolvedValue([
      makeFeature({
        id: 'a',
        description: 'Short but dependency completeness gives 20 points',
      }),
    ]);

    const issues = await lowThresholdCheck.run('/project');
    expect(issues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // fix() tests
  // -------------------------------------------------------------------------

  describe('fix', () => {
    it('enriches description using enhancement model', async () => {
      const feature = makeFeature({ id: 'a', description: 'Fix the bug' });
      mockFeatureLoader.getAll.mockResolvedValue([feature]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: true,
        context: { featureId: 'a', projectPath: '/project' },
      };

      await check.fix('/project', issue);

      expect(mockEnhancementModel.enhance).toHaveBeenCalledOnce();
      expect(mockFeatureLoader.update).toHaveBeenCalledWith(
        '/project',
        'a',
        expect.objectContaining({
          description: expect.stringContaining('Enriched description'),
        }),
        'enhance'
      );
    });

    it('loads project context for enrichment', async () => {
      mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Fix it' })]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);

      expect(mockContextLoader.load).toHaveBeenCalledWith('/project');
      const prompt = (mockEnhancementModel.enhance as any).mock.calls[0][0];
      expect(prompt).toContain('Project Context');
    });

    it('recomputes score after enrichment', async () => {
      const feature = makeFeature({ id: 'a', description: 'Fix it' });
      // First call: run-time getAll for fix
      // Second call: recompute score
      mockFeatureLoader.getAll.mockResolvedValueOnce([feature]).mockResolvedValueOnce([
        makeFeature({
          id: 'a',
          description:
            'Enriched description with technical details about the API endpoint and service module.',
        }),
      ]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);

      // Should have called update with readinessScore
      const scoreCalls = mockFeatureLoader.update.mock.calls.filter(
        (c: any[]) => c[2]?.readinessScore !== undefined
      );
      expect(scoreCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('does nothing when no enhancement model is provided', async () => {
      const checkNoModel = new FeatureReadinessCheck(mockFeatureLoader as any);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: false,
      };

      await checkNoModel.fix('/project', issue);
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('does nothing when feature is not found', async () => {
      mockFeatureLoader.getAll.mockResolvedValue([]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'missing',
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);
      expect(mockFeatureLoader.update).not.toHaveBeenCalled();
    });

    it('does nothing when enhancement model returns empty string', async () => {
      (mockEnhancementModel.enhance as any).mockResolvedValue('');
      mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Short' })]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);

      // Should NOT update description
      const descCalls = mockFeatureLoader.update.mock.calls.filter(
        (c: any[]) => c[2]?.description !== undefined
      );
      expect(descCalls).toHaveLength(0);
    });

    it('continues without context when contextLoader fails', async () => {
      (mockContextLoader.load as any).mockRejectedValue(new Error('no context'));
      mockFeatureLoader.getAll.mockResolvedValue([makeFeature({ id: 'a', description: 'Short' })]);

      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        featureId: 'a',
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);

      // Should still call enhance (just without context)
      expect(mockEnhancementModel.enhance).toHaveBeenCalledOnce();
    });

    it('does nothing when featureId is not provided in issue', async () => {
      const issue = {
        checkId: 'feature-readiness',
        severity: 'info' as const,
        message: 'Low score',
        autoFixable: true,
      };

      await check.fix('/project', issue);
      expect(mockFeatureLoader.getAll).not.toHaveBeenCalled();
    });
  });
});
