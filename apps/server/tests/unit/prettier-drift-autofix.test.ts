/**
 * Unit tests for PrettierDriftAutofixCheck
 *
 * Coverage:
 * - parsePrettierFiles: extracts file paths from GHA job log output
 * - run: skips when autoPrettierFix flag is disabled
 * - run: skips when no features are in review
 * - run: skips when checks job is not failing
 * - run: skips when other checks are also failing
 * - run: returns info issue on successful fix
 * - run: returns warning issue when fix fails
 * - run: returns no issue when already clean (idempotent)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';

// --- Module mocks (declared before imports) ---

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// --- Imports after mocks ---

import { PrettierDriftAutofixCheck } from '../../src/services/maintenance/checks/prettier-drift-autofix.js';
import { execFile } from 'child_process';
import * as fs from 'fs';

// Helper to create a promisified-style mock for execFile
const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

// Build a mock FeatureLoader
function makeMockFeatureLoader(features: Partial<Feature>[] = []) {
  return {
    getAll: vi.fn().mockResolvedValue(features),
  };
}

// Build a mock SettingsService
function makeMockSettingsService(autoPrettierFix = true) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      featureFlags: { autoPrettierFix },
    }),
  };
}

// Sample GHA job log with prettier failures
const PRETTIER_FAIL_LOG = `
2026-01-01T00:00:01.000Z ##[group]Run npm run format:check
2026-01-01T00:00:02.000Z Checking formatting...
2026-01-01T00:00:03.000Z [warn] apps/server/src/services/foo.ts
2026-01-01T00:00:04.000Z [warn] libs/types/src/bar.ts
2026-01-01T00:00:05.000Z Code style issues found in 2 files. Run Prettier with --write to fix.
2026-01-01T00:00:06.000Z ##[endgroup]
2026-01-01T00:00:07.000Z ##[error]Process completed with exit code 1.
`;

// Sample GHA job log with NO prettier failures
const NON_PRETTIER_FAIL_LOG = `
2026-01-01T00:00:01.000Z ##[group]Run npm run build:packages
2026-01-01T00:00:02.000Z error TS2345: Argument of type ...
2026-01-01T00:00:03.000Z ##[error]Process completed with exit code 2.
`;

describe('PrettierDriftAutofixCheck', () => {
  describe('parsePrettierFiles', () => {
    it('extracts file paths from prettier warn output', () => {
      const check = new PrettierDriftAutofixCheck(makeMockFeatureLoader() as any);
      const files = check.parsePrettierFiles(PRETTIER_FAIL_LOG);
      expect(files).toEqual(['apps/server/src/services/foo.ts', 'libs/types/src/bar.ts']);
    });

    it('returns empty array when no Code style issues marker', () => {
      const check = new PrettierDriftAutofixCheck(makeMockFeatureLoader() as any);
      const log = `[warn] some/file.ts\n[warn] other/file.ts\n`;
      const files = check.parsePrettierFiles(log);
      expect(files).toEqual([]);
    });

    it('returns empty array for non-prettier failure log', () => {
      const check = new PrettierDriftAutofixCheck(makeMockFeatureLoader() as any);
      const files = check.parsePrettierFiles(NON_PRETTIER_FAIL_LOG);
      expect(files).toEqual([]);
    });

    it('ignores [warn] lines that are not file paths', () => {
      const check = new PrettierDriftAutofixCheck(makeMockFeatureLoader() as any);
      const log = `[warn] some/file.ts\n[warn] From the output above, no files found.\nCode style issues found in 1 file.`;
      const files = check.parsePrettierFiles(log);
      // "From the output above, no files found." doesn't match WARN_FILE_RE (it has spaces and no extension at the end)
      expect(files).toEqual(['some/file.ts']);
    });

    it('handles logs without timestamps', () => {
      const check = new PrettierDriftAutofixCheck(makeMockFeatureLoader() as any);
      const log = `[warn] apps/ui/src/App.tsx\nCode style issues found in 1 file.`;
      const files = check.parsePrettierFiles(log);
      expect(files).toEqual(['apps/ui/src/App.tsx']);
    });
  });

  describe('run', () => {
    let featureLoader: ReturnType<typeof makeMockFeatureLoader>;
    let settingsService: ReturnType<typeof makeMockSettingsService>;

    const projectPath = '/test/project';

    const reviewFeature: Partial<Feature> = {
      id: 'feature-123',
      status: 'review',
      prNumber: 42,
      branchName: 'feature/my-feature',
      title: 'My Feature',
    };

    // Check runs response: only 'checks' failing
    const checkRunsOnlyChecksFailing = JSON.stringify([
      { id: 999, name: 'checks', status: 'completed', conclusion: 'failure' },
      { id: 1000, name: 'test', status: 'completed', conclusion: 'success' },
    ]);

    // Check runs response: 'checks' passing
    const checkRunsAllPassing = JSON.stringify([
      { id: 999, name: 'checks', status: 'completed', conclusion: 'success' },
    ]);

    // Check runs response: multiple failures
    const checkRunsMultipleFailing = JSON.stringify([
      { id: 999, name: 'checks', status: 'completed', conclusion: 'failure' },
      { id: 1001, name: 'test', status: 'completed', conclusion: 'failure' },
    ]);

    function setupExecFileMock(responses: Array<{ stdout: string } | Error>) {
      let callIndex = 0;
      mockExecFile.mockImplementation(
        (
          _file: string,
          _args: string[],
          _opts: unknown,
          callback: (err: Error | null, result: { stdout: string } | null) => void
        ) => {
          const response = responses[callIndex++];
          if (response instanceof Error) {
            callback(response, null);
          } else {
            callback(null, response);
          }
        }
      );
    }

    beforeEach(() => {
      featureLoader = makeMockFeatureLoader([reviewFeature]);
      settingsService = makeMockSettingsService(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ devDependencies: { prettier: '3.7.4' } })
      );
    });

    it('returns empty when autoPrettierFix flag is disabled', async () => {
      settingsService = makeMockSettingsService(false);
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
      expect(featureLoader.getAll).not.toHaveBeenCalled();
    });

    it('returns empty when no features are in review', async () => {
      featureLoader = makeMockFeatureLoader([]);
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([]);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
    });

    it('returns empty when no failing checks job', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view (headSha)
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs (all passing)
        { stdout: checkRunsAllPassing },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
    });

    it('returns empty when other checks are also failing', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view (headSha)
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs (multiple failing)
        { stdout: checkRunsMultipleFailing },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
    });

    it('returns empty when job logs have no prettier output', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs
        { stdout: checkRunsOnlyChecksFailing },
        // gh api job logs
        { stdout: NON_PRETTIER_FAIL_LOG },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
    });

    it('returns info issue on successful fix', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs
        { stdout: checkRunsOnlyChecksFailing },
        // gh api job logs
        { stdout: PRETTIER_FAIL_LOG },
        // git fetch origin
        { stdout: '' },
        // git worktree add
        { stdout: '' },
        // git checkout -B
        { stdout: '' },
        // npx prettier@3.7.4 --write
        { stdout: '' },
        // git diff --name-only (has changes)
        { stdout: 'apps/server/src/services/foo.ts\nlibs/types/src/bar.ts\n' },
        // git diff --ignore-all-space (empty = format only)
        { stdout: '' },
        // git commit
        { stdout: '' },
        // git push
        { stdout: '' },
        // gh pr comment
        { stdout: '' },
        // git worktree remove (cleanup)
        { stdout: '' },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('info');
      expect(issues[0].featureId).toBe('feature-123');
      expect(issues[0].message).toContain('PR #42');
      expect(issues[0].message).toContain('prettier formatting');
    });

    it('returns no issue when already clean (idempotent)', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs
        { stdout: checkRunsOnlyChecksFailing },
        // gh api job logs
        { stdout: PRETTIER_FAIL_LOG },
        // git fetch origin
        { stdout: '' },
        // git worktree add
        { stdout: '' },
        // git checkout -B
        { stdout: '' },
        // npx prettier@3.7.4 --write
        { stdout: '' },
        // git diff --name-only (empty = no changes)
        { stdout: '' },
        // git worktree remove (cleanup)
        { stdout: '' },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toEqual([]);
    });

    it('returns warning issue when non-whitespace changes detected', async () => {
      const check = new PrettierDriftAutofixCheck(featureLoader as any, settingsService as any);
      setupExecFileMock([
        // gh pr view
        { stdout: JSON.stringify({ headRefOid: 'abc123', headRefName: 'feature/my-feature' }) },
        // gh api check-runs
        { stdout: checkRunsOnlyChecksFailing },
        // gh api job logs
        { stdout: PRETTIER_FAIL_LOG },
        // git fetch origin
        { stdout: '' },
        // git worktree add
        { stdout: '' },
        // git checkout -B
        { stdout: '' },
        // npx prettier@3.7.4 --write
        { stdout: '' },
        // git diff --name-only (has changes)
        { stdout: 'apps/server/src/services/foo.ts\n' },
        // git diff --ignore-all-space (non-empty = substantive change!)
        { stdout: 'diff --git a/foo.ts b/foo.ts\n+const x = 1;\n' },
        // git worktree remove (cleanup)
        { stdout: '' },
      ]);
      const issues = await check.run(projectPath);
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('manual intervention');
    });
  });
});
