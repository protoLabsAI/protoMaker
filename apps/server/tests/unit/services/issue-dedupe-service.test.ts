/**
 * IssueDedupeService — dedup decision logic tests
 *
 * Verifies that the dedupe service correctly identifies duplicates by:
 * 1. Title similarity (Jaccard word-set overlap)
 * 2. Fingerprint matching
 * 3. Source ID matching
 * 4. Cooldown for recently closed features
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueDedupeService } from '@/services/issue-dedupe-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { Feature } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-test-1',
    title: 'System Improvement: recurring test_failure failures',
    description: 'Test feature',
    category: 'infra',
    status: 'backlog',
    tags: ['system-improvement', 'friction-tracker'],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeFeatureLoader(features: Feature[]): FeatureLoader {
  return {
    getAll: vi.fn().mockResolvedValue(features),
    findByTitle: vi.fn().mockResolvedValue(null),
  } as unknown as FeatureLoader;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueDedupeService', () => {
  let service: IssueDedupeService;
  let features: Feature[];
  let featureLoader: ReturnType<typeof makeFeatureLoader>;

  const projectPath = '/test/project';

  beforeEach(() => {
    features = [];
    featureLoader = makeFeatureLoader(features);
    service = new IssueDedupeService(featureLoader);
  });

  // -----------------------------------------------------------------------
  // Title similarity matching
  // -----------------------------------------------------------------------

  describe('title similarity (Jaccard)', () => {
    it('detects similar automation-filed titles as duplicates', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'System Improvement: recurring test_failure failures',
          tags: ['system-improvement', 'friction-tracker'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures',
        undefined
      );

      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.match.reason).toBe('title_similarity');
        expect(result.match.feature.id).toBe('feature-existing');
        expect(result.match.similarity).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('detects partially similar titles as duplicates', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'auto-remediate: stuck on test_failure / checks / ts_error',
          tags: ['auto-remediation', 'hitl-pattern', 'self-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'auto-remediate: stuck on test_failure / checks / ts_error',
        'hitl:test_failure:checks:ts_error'
      );

      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.match.reason).toBe('title_similarity');
      }
    });

    it('does NOT match user features against automation titles', async () => {
      features.push(
        makeFeature({
          id: 'feature-user',
          title: 'Add test failure reporting',
          tags: ['feature'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('does NOT match dissimilar titles', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'System Improvement: recurring merge_conflict failures',
          tags: ['system-improvement', 'friction-tracker'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring authentication failures'
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('strips common prefixes before comparing titles', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: '[Auto] System Improvement: recurring test_failure failures',
          tags: ['system-improvement', 'friction-tracker'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(true);
    });

    it('matches features with [Auto] prefix tag', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: '[Auto] Fix recurring build failures',
          tags: ['feature'],
        })
      );

      const result = await service.check(projectPath, 'Fix recurring build failures');

      expect(result.isDuplicate).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Fingerprint matching
  // -----------------------------------------------------------------------

  describe('fingerprint matching', () => {
    it('matches by fingerprint in description', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'System Improvement: recurring test failures',
          description: 'fp:friction:test_failure Auto-filed feature',
        })
      );

      const result = await service.check(
        projectPath,
        'Completely different title',
        'friction:test_failure'
      );

      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.match.reason).toBe('fingerprint');
        expect(result.match.feature.id).toBe('feature-existing');
      }
    });

    it('does NOT match closed features by fingerprint', async () => {
      features.push(
        makeFeature({
          id: 'feature-closed',
          title: 'Old feature',
          status: 'done',
          description: 'fp:friction:test_failure Auto-filed feature',
        })
      );

      const result = await service.check(projectPath, 'New feature', 'friction:test_failure');

      expect(result.isDuplicate).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Source ID matching
  // -----------------------------------------------------------------------

  describe('source ID matching', () => {
    it('matches by githubIssueNumber', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'Different title',
          githubIssueNumber: 123,
        })
      );

      const result = await service.check(projectPath, 'New title', undefined, '123');

      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.match.reason).toBe('source_id');
      }
    });

    it('does NOT match different source IDs', async () => {
      features.push(
        makeFeature({
          id: 'feature-existing',
          title: 'Existing',
          githubIssueNumber: 456,
        })
      );

      const result = await service.check(projectPath, 'New', undefined, '789');

      expect(result.isDuplicate).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Cooldown for recently closed features
  // -----------------------------------------------------------------------

  describe('cooldown for recently closed features', () => {
    it('suppresses re-filing when similar feature was recently closed', async () => {
      features.push(
        makeFeature({
          id: 'feature-closed',
          title: 'System Improvement: recurring test_failure failures',
          status: 'done',
          updatedAt: new Date().toISOString(),
          tags: ['system-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.noMatch?.cooldown).toBe(true);
      if (result.noMatch?.closedFeature) {
        expect(result.noMatch.closedFeature.id).toBe('feature-closed');
      }
    });

    it('does NOT suppress when closed feature is outside cooldown window', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago

      features.push(
        makeFeature({
          id: 'feature-old-closed',
          title: 'System Improvement: recurring test_failure failures',
          status: 'done',
          updatedAt: oldDate,
          tags: ['system-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.noMatch?.cooldown).toBe(undefined);
    });

    it('does NOT suppress when titles are dissimilar', async () => {
      features.push(
        makeFeature({
          id: 'feature-closed',
          title: 'System Improvement: recurring merge_conflict failures',
          status: 'done',
          updatedAt: new Date().toISOString(),
          tags: ['system-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring authentication failures'
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.noMatch?.cooldown).toBe(undefined);
    });

    it('does NOT suppress for interrupted status', async () => {
      features.push(
        makeFeature({
          id: 'feature-interrupted',
          title: 'System Improvement: recurring test_failure failures',
          status: 'interrupted',
          updatedAt: new Date().toISOString(),
          tags: ['system-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.noMatch?.cooldown).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // No match cases
  // -----------------------------------------------------------------------

  describe('no match cases', () => {
    it('returns no match when feature store is empty', async () => {
      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
    });

    it('returns no match when all features are closed and outside cooldown', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      features.push(
        makeFeature({
          id: 'feature-closed',
          title: 'Some old feature',
          status: 'done',
          updatedAt: oldDate,
        })
      );

      const result = await service.check(projectPath, 'New feature title');

      expect(result.isDuplicate).toBe(false);
    });

    it('falls back to empty array when featureLoader.getAll throws', async () => {
      vi.mocked(featureLoader.getAll).mockRejectedValue(new Error('FS error'));

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures'
      );

      expect(result.isDuplicate).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Cache invalidation
  // -----------------------------------------------------------------------

  describe('cache', () => {
    it('caches feature list within TTL', async () => {
      features.push(
        makeFeature({
          id: 'feature-1',
          title: 'System Improvement: recurring test_failure failures',
          tags: ['system-improvement'],
        })
      );

      await service.check(projectPath, 'System Improvement: recurring test_failure failures');
      await service.check(projectPath, 'System Improvement: recurring test_failure failures');

      expect(featureLoader.getAll).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache on demand', async () => {
      features.push(
        makeFeature({
          id: 'feature-1',
          title: 'Existing',
          tags: ['system-improvement'],
        })
      );

      await service.check(projectPath, 'Existing');
      expect(featureLoader.getAll).toHaveBeenCalledTimes(1);

      service.invalidateCache(projectPath);

      // Add a new feature
      features.push(
        makeFeature({
          id: 'feature-2',
          title: 'New feature',
          tags: ['system-improvement'],
        })
      );

      await service.check(projectPath, 'New feature');
      expect(featureLoader.getAll).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Priority: fingerprint > source_id > title_similarity
  // -----------------------------------------------------------------------

  describe('match priority', () => {
    it('prefers fingerprint match over title similarity', async () => {
      features.push(
        makeFeature({
          id: 'feature-fp',
          title: 'Some title',
          description: 'Auto-filed system improvement.\n\nfp:friction:test_failure',
          tags: ['system-improvement'],
        }),
        makeFeature({
          id: 'feature-similar',
          title: 'System Improvement: recurring test_failure failures',
          tags: ['system-improvement'],
        })
      );

      const result = await service.check(
        projectPath,
        'System Improvement: recurring test_failure failures',
        'friction:test_failure'
      );

      expect(result.isDuplicate).toBe(true);
      if (result.isDuplicate) {
        expect(result.match.reason).toBe('fingerprint');
        expect(result.match.feature.id).toBe('feature-fp');
      }
    });
  });
});
