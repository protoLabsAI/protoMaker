import { describe, it, expect } from 'vitest';
import { analyzeScopeBudget } from '@/services/lead-engineer-review-merge-processors.js';

describe('analyzeScopeBudget', () => {
  describe('empty inputs', () => {
    it('returns within_budget when no changed files', () => {
      const result = analyzeScopeBudget([], ['src/foo.ts']);
      expect(result.withinBudget).toBe(true);
      expect(result.outOfScopeFiles).toEqual([]);
      expect(result.totalSourceFiles).toBe(0);
    });

    it('returns within_budget when filesToModify is empty (no declared scope)', () => {
      const result = analyzeScopeBudget(['src/foo.ts', 'src/bar.ts'], []);
      expect(result.withinBudget).toBe(true);
      expect(result.outOfScopeFiles).toEqual([]);
    });
  });

  describe('metadata file exclusion', () => {
    it('excludes lock files from analysis', () => {
      const result = analyzeScopeBudget(
        ['src/foo.ts', 'package-lock.json', 'pnpm-lock.yaml'],
        ['src/foo.ts']
      );
      expect(result.totalSourceFiles).toBe(1);
      expect(result.withinBudget).toBe(true);
    });

    it('excludes .automaker files from analysis', () => {
      const result = analyzeScopeBudget(
        ['src/foo.ts', '.automaker/features/123/feature.json'],
        ['src/foo.ts']
      );
      expect(result.totalSourceFiles).toBe(1);
    });

    it('excludes .md files from analysis', () => {
      const result = analyzeScopeBudget(
        ['src/foo.ts', 'docs/README.md', 'CHANGELOG.md'],
        ['src/foo.ts']
      );
      expect(result.totalSourceFiles).toBe(1);
    });

    it('does NOT exclude a declared .md file', () => {
      // Files explicitly in filesToModify are never treated as metadata
      const result = analyzeScopeBudget(
        ['docs/guide.md', 'src/foo.ts'],
        ['docs/guide.md', 'src/foo.ts']
      );
      expect(result.totalSourceFiles).toBe(2);
      expect(result.withinBudget).toBe(true);
    });
  });

  describe('within-scope detection', () => {
    it('treats exact match as in-scope', () => {
      const result = analyzeScopeBudget(['src/foo.ts', 'src/bar.ts'], ['src/foo.ts', 'src/bar.ts']);
      expect(result.outOfScopeFiles).toEqual([]);
      expect(result.withinBudget).toBe(true);
    });

    it('treats subdirectory match as in-scope', () => {
      const result = analyzeScopeBudget(
        ['src/services/auth/auth.ts', 'src/services/auth/utils.ts'],
        ['src/services/auth']
      );
      expect(result.outOfScopeFiles).toEqual([]);
      expect(result.withinBudget).toBe(true);
    });
  });

  describe('test file tolerance (±2)', () => {
    it('tolerates up to 2 adjacent test files without counting them out-of-scope', () => {
      const result = analyzeScopeBudget(
        [
          'src/services/auth.ts', // in scope
          'src/services/auth.test.ts', // adjacent test - tolerated
          'src/services/auth.spec.ts', // adjacent test - tolerated
        ],
        ['src/services/auth.ts']
      );
      expect(result.toleratedFiles).toHaveLength(2);
      expect(result.outOfScopeFiles).toHaveLength(0);
      expect(result.withinBudget).toBe(true);
    });

    it('counts 3rd out-of-scope test file against budget', () => {
      const result = analyzeScopeBudget(
        [
          'src/services/auth.ts',
          'src/services/auth.test.ts', // tolerated
          'src/services/auth.spec.ts', // tolerated
          'src/services/other.test.ts', // 3rd test - not adjacent, over tolerance
        ],
        ['src/services/auth.ts']
      );
      expect(result.toleratedFiles).toHaveLength(2);
      expect(result.outOfScopeFiles).toHaveLength(1);
      expect(result.outOfScopeFiles[0]).toBe('src/services/other.test.ts');
    });

    it('tolerates test files in tests/ subdirectory of declared directory', () => {
      const result = analyzeScopeBudget(
        ['src/auth/index.ts', 'src/auth/tests/auth.test.ts'],
        ['src/auth/index.ts']
      );
      expect(result.toleratedFiles).toContain('src/auth/tests/auth.test.ts');
      expect(result.outOfScopeFiles).toHaveLength(0);
    });
  });

  describe('scope budget threshold (20%)', () => {
    it('is within budget when out-of-scope is exactly 20%', () => {
      // 1 out-of-scope / 5 total = 20%
      const result = analyzeScopeBudget(
        [
          'src/a.ts',
          'src/b.ts',
          'src/c.ts',
          'src/d.ts',
          'dashboard/unrelated.ts', // out-of-scope
        ],
        ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts']
      );
      expect(result.outOfScopePercent).toBeCloseTo(20, 1);
      expect(result.withinBudget).toBe(true);
    });

    it('is over budget when out-of-scope exceeds 20%', () => {
      // 2 out-of-scope / 5 total = 40%
      const result = analyzeScopeBudget(
        [
          'src/a.ts',
          'src/b.ts',
          'src/c.ts',
          'dashboard/widget.ts', // out-of-scope
          'docs/tutorials/guide.ts', // out-of-scope
        ],
        ['src/a.ts', 'src/b.ts', 'src/c.ts']
      );
      expect(result.withinBudget).toBe(false);
      expect(result.outOfScopeFiles).toContain('dashboard/widget.ts');
      expect(result.outOfScopeFiles).toContain('docs/tutorials/guide.ts');
    });

    it('flags improve-adjacent-docs anti-pattern (docs/ out of scope)', () => {
      const result = analyzeScopeBudget(
        [
          'src/services/auth.ts',
          'src/services/auth.test.ts',
          'docs/tutorials/auth-guide.ts', // improve-adjacent-docs
          'docs/tutorials/overview.ts', // improve-adjacent-docs
          'docs/tutorials/advanced.ts', // improve-adjacent-docs
        ],
        ['src/services/auth.ts']
      );
      // 1 test file tolerated (within 2), remaining 2 docs files + 1 extra test = out of scope
      expect(result.withinBudget).toBe(false);
    });

    it('flags dashboard-version-bump anti-pattern (dashboard/ out of scope)', () => {
      // 1 out-of-scope dashboard file / 2 total = 50% over budget
      const result = analyzeScopeBudget(
        ['src/services/feature.ts', 'dashboard/package.json'],
        ['src/services/feature.ts']
      );
      // dashboard/package.json would be excluded as metadata (.json lock pattern doesn't match)
      // but package.json IS a real file that doesn't match lock file patterns
      // Actually, isMergeOnlyMetadata only excludes: package-lock.json, yarn.lock, pnpm-lock.yaml
      // So dashboard/package.json is a real source file = out of scope
      expect(result.outOfScopeFiles).toContain('dashboard/package.json');
      expect(result.withinBudget).toBe(false);
    });
  });
});
