/**
 * Unit tests for FeatureLoader.generateBranchName
 *
 * Covers:
 * - Two features with a long common title prefix get distinct branch names
 * - Branch names are human-readable (contain slug of title)
 * - Untitled/empty features get unique branch names
 * - Determinism: same title + same featureId always yields the same branch
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

  it('branch name is human-readable and contains a slug of the title', () => {
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

  it('returns an untitled branch for undefined title', () => {
    const branch = loader.generateBranchName(undefined, 'feature-123-abc1234');
    expect(branch).toMatch(/^feature\/untitled-/);
  });

  it('returns an untitled branch for blank title', () => {
    const branch = loader.generateBranchName('   ', 'feature-123-abc1234');
    expect(branch).toMatch(/^feature\/untitled-/);
  });
});
