/**
 * Unit tests for FeatureLoader.generateBranchName and FeatureLoader.categoryToPrefix
 *
 * Covers:
 * - Two features with a long common title prefix get distinct branch names
 * - Branch names are human-readable (contain slug of title)
 * - Untitled/empty features get unique branch names
 * - Determinism: same title + same featureId always yields the same branch
 * - Category-aware prefix: each supported category maps to the correct prefix
 * - Fallback: unknown or missing categories default to feature/
 */

import { describe, it, expect, vi } from 'vitest';

// --- Module mocks (must be before imports) ---

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
  // Minimal slugify that collapses spaces/special chars to hyphens
  slugify: vi.fn((s: string, max?: number) => {
    let slug = s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (max !== undefined && slug.length > max) {
      slug = slug.slice(0, max).replace(/-$/, '');
    }
    return slug;
  }),
}));

vi.mock('../../../src/lib/secure-fs.js', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  copyFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/lib/prometheus.js', () => ({
  featuresByStatus: { inc: vi.fn(), dec: vi.fn(), reset: vi.fn(), set: vi.fn() },
}));

import { FeatureLoader } from '../../../src/services/feature-loader.js';

// ---------------------------------------------------------------------------

describe('FeatureLoader.categoryToPrefix', () => {
  it.each([
    // Bug / fix categories
    ['bug', 'fix/'],
    ['bugfix', 'fix/'],
    ['fix', 'fix/'],
    ['hotfix', 'fix/'],
    // Chore / maintenance categories
    ['chore', 'chore/'],
    ['maintenance', 'chore/'],
    ['ci', 'chore/'],
    ['build', 'chore/'],
    ['cleanup', 'chore/'],
    ['deps', 'chore/'],
    // Refactor
    ['refactor', 'refactor/'],
    // Docs
    ['docs', 'docs/'],
    ['documentation', 'docs/'],
    // Test
    ['test', 'test/'],
    // Feature / default
    ['feature', 'feature/'],
    ['enhancement', 'feature/'],
    ['story', 'feature/'],
    ['Uncategorized', 'feature/'],
    ['', 'feature/'],
  ])('category %j → prefix %j', (category, expected) => {
    expect(FeatureLoader.categoryToPrefix(category)).toBe(expected);
  });

  it('returns feature/ for undefined category', () => {
    expect(FeatureLoader.categoryToPrefix(undefined)).toBe('feature/');
  });

  it('is case-insensitive', () => {
    expect(FeatureLoader.categoryToPrefix('BUG')).toBe('fix/');
    expect(FeatureLoader.categoryToPrefix('Fix')).toBe('fix/');
    expect(FeatureLoader.categoryToPrefix('CHORE')).toBe('chore/');
    expect(FeatureLoader.categoryToPrefix('Refactor')).toBe('refactor/');
  });
});

describe('FeatureLoader.generateBranchName', () => {
  const loader = new FeatureLoader();

  it('generates distinct branch names for features sharing a long common title prefix', () => {
    const titleA = 'audit: deep quality audit of hx-breadcrumb';
    const titleB = 'audit: deep quality audit of hx-pagination';
    const idA = 'feature-1700000000000-aaa1111';
    const idB = 'feature-1700000000001-bbb2222';

    const branchA = loader.generateBranchName(titleA, idA);
    const branchB = loader.generateBranchName(titleB, idB);

    expect(branchA).not.toBe(branchB);
    expect(branchA).toMatch(/^feature\//);
    expect(branchB).toMatch(/^feature\//);
  });

  it('generates distinct branch names for same title with different featureIds', () => {
    const title = 'audit: deep quality audit of hx-component';
    const idA = 'feature-111-aaaaaaa';
    const idB = 'feature-222-bbbbbbb';

    const branchA = loader.generateBranchName(title, idA);
    const branchB = loader.generateBranchName(title, idB);

    expect(branchA).not.toBe(branchB);
    // Both should contain a human-readable slug portion
    expect(branchA).toContain('audit');
    expect(branchB).toContain('audit');
  });

  it('branch name is human-readable and contains a slug of the title (no category → feature/)', () => {
    const branch = loader.generateBranchName('Fix login button', 'feature-123-abc1234');
    expect(branch).toMatch(/^feature\//);
    expect(branch).toContain('fix-login-button');
  });

  it('is deterministic: same title + same featureId always yields the same branch name', () => {
    const title = 'My Feature Title';
    const id = 'feature-1234567890-xyz9876';

    const branch1 = loader.generateBranchName(title, id);
    const branch2 = loader.generateBranchName(title, id);

    expect(branch1).toBe(branch2);
  });

  it('returns an untitled branch for undefined title (no category)', () => {
    const branch = loader.generateBranchName(undefined, 'feature-123-abc1234');
    expect(branch).toMatch(/^feature\/untitled-/);
  });

  it('returns an untitled branch for blank title', () => {
    const branch = loader.generateBranchName('   ', 'feature-123-abc1234');
    expect(branch).toMatch(/^feature\/untitled-/);
  });

  // --- Category-aware prefix tests ---

  it('uses fix/ prefix for bug category', () => {
    const branch = loader.generateBranchName(
      'Fix null pointer crash',
      'feature-123-abc1234',
      'bug'
    );
    expect(branch).toMatch(/^fix\//);
    expect(branch).toContain('fix-null-pointer-crash');
  });

  it('uses fix/ prefix for fix category', () => {
    const branch = loader.generateBranchName('Fix login redirect', 'feature-123-abc1234', 'fix');
    expect(branch).toMatch(/^fix\//);
  });

  it('uses fix/ prefix for hotfix category', () => {
    const branch = loader.generateBranchName('Hotfix memory leak', 'feature-456-def5678', 'hotfix');
    expect(branch).toMatch(/^fix\//);
  });

  it('uses chore/ prefix for chore category', () => {
    const branch = loader.generateBranchName('Update dependencies', 'feature-789-ghi9012', 'chore');
    expect(branch).toMatch(/^chore\//);
  });

  it('uses chore/ prefix for ci category', () => {
    const branch = loader.generateBranchName(
      'Fix branch naming in CI',
      'feature-789-ghi9012',
      'ci'
    );
    expect(branch).toMatch(/^chore\//);
  });

  it('uses chore/ prefix for maintenance category', () => {
    const branch = loader.generateBranchName(
      'Cleanup old logs',
      'feature-789-ghi9012',
      'maintenance'
    );
    expect(branch).toMatch(/^chore\//);
  });

  it('uses refactor/ prefix for refactor category', () => {
    const branch = loader.generateBranchName(
      'Refactor auth service',
      'feature-abc-xyz1234',
      'refactor'
    );
    expect(branch).toMatch(/^refactor\//);
  });

  it('uses docs/ prefix for docs category', () => {
    const branch = loader.generateBranchName('Update API docs', 'feature-abc-xyz1234', 'docs');
    expect(branch).toMatch(/^docs\//);
  });

  it('uses docs/ prefix for documentation category', () => {
    const branch = loader.generateBranchName(
      'Improve getting started guide',
      'feature-abc-xyz1234',
      'documentation'
    );
    expect(branch).toMatch(/^docs\//);
  });

  it('uses test/ prefix for test category', () => {
    const branch = loader.generateBranchName(
      'Add e2e tests for checkout',
      'feature-abc-xyz1234',
      'test'
    );
    expect(branch).toMatch(/^test\//);
  });

  it('uses feature/ prefix for feature category', () => {
    const branch = loader.generateBranchName(
      'Add dark mode toggle',
      'feature-abc-xyz1234',
      'feature'
    );
    expect(branch).toMatch(/^feature\//);
  });

  it('uses feature/ prefix for Uncategorized category (fallback)', () => {
    const branch = loader.generateBranchName(
      'Add dark mode toggle',
      'feature-abc-xyz1234',
      'Uncategorized'
    );
    expect(branch).toMatch(/^feature\//);
  });

  it('returns fix/-prefixed untitled branch when title is blank and category is bug', () => {
    const branch = loader.generateBranchName('   ', 'feature-123-abc1234', 'bug');
    expect(branch).toMatch(/^fix\/untitled-/);
  });

  it('is deterministic with category: same inputs always yield the same branch name', () => {
    const title = 'Fix login redirect';
    const id = 'feature-1234567890-xyz9876';
    const category = 'fix';

    expect(loader.generateBranchName(title, id, category)).toBe(
      loader.generateBranchName(title, id, category)
    );
  });
});
