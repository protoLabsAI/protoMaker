/**
 * Regression tests for external-repo PR merge → feature done transition.
 *
 * Root cause (issue #3115): the post-merge webhook handler only searched
 * settings.projects (user-added UI projects) to resolve the projectPath for a
 * merged PR. External repos registered in workspace/projects.yaml — like
 * protoLabsAI/mythxengine — were never found, so their features never
 * transitioned to done after a PR merged.
 *
 * The fix: pass ProjectRegistryService to the handler. When a PR merges, look
 * up repository.full_name in the registry FIRST to get the correct projectPath,
 * then fall back to the settings.projects scan.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { createMockExpressContext } from '../../utils/mocks.js';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockExecImpl: (
  cmd: string,
  opts: unknown,
  cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
) => void;

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    exec: (
      cmd: string,
      opts: unknown,
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
    ) => mockExecImpl(cmd, opts, cb),
  };
});

const mockFeatureLoaderUpdate = vi.fn().mockResolvedValue(undefined);
const mockFeatureLoaderGet = vi.fn();
const mockFeatureLoaderGetAll = vi.fn().mockResolvedValue([]);

vi.mock('@/services/feature-loader.js', () => ({
  FeatureLoader: vi.fn(),
}));

vi.mock('@/services/staging-promotion-service.js', () => ({
  StagingPromotionService: vi.fn(),
}));

vi.mock('@/lib/webhook-signature.js', () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('@/services/pr-watcher-service.js', () => ({
  getPRWatcherService: vi.fn(),
}));

vi.mock('@/services/webhook-delivery-service.js', () => ({
  getWebhookDeliveryService: vi.fn(),
}));

import { createGitHubWebhookHandler } from '@/routes/webhooks/routes/github.js';
import { FeatureLoader } from '@/services/feature-loader.js';
import { StagingPromotionService } from '@/services/staging-promotion-service.js';
import { verifyWebhookSignature } from '@/lib/webhook-signature.js';
import { getPRWatcherService } from '@/services/pr-watcher-service.js';
import { getWebhookDeliveryService } from '@/services/webhook-delivery-service.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSettingsService(projectPaths: string[] = []) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      githubWebhook: { enabled: true },
      projects: projectPaths.map((p) => ({ path: p })),
      promotion: {},
    }),
    getCredentials: vi.fn().mockResolvedValue({ webhookSecrets: {} }),
  };
}

/**
 * Minimal ProjectRegistryService stub with a pre-loaded entry for a given repo.
 */
function buildProjectRegistry(repoFullName: string, projectPath: string) {
  return {
    getProjectByGithub: vi.fn((repo: string) => {
      if (repo.toLowerCase() === repoFullName.toLowerCase()) {
        return { github: repoFullName, projectPath };
      }
      return null;
    }),
  };
}

function makePrMergedPayload(repoFullName: string, branchName = 'feature/external-feature') {
  return {
    action: 'closed',
    pull_request: {
      number: 184,
      title: 'feat: external repo feature',
      state: 'closed',
      merged: true,
      merged_at: '2026-01-01T00:00:00Z',
      merge_commit_sha: 'deadbeef1234',
      head: { ref: branchName },
      base: { ref: 'main' },
    },
    repository: { full_name: repoFullName },
  };
}

function makeFeature(branchName = 'feature/external-feature') {
  return {
    id: 'feature-ext-001',
    featureId: 'feature-ext-001',
    title: 'External Repo Feature',
    status: 'review',
    branchName,
    filesToModify: undefined,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('external-repo PR merge → feature done (issue #3115)', () => {
  let events: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new EventEmitter();

    vi.mocked(FeatureLoader).mockImplementation(function () {
      return {
        getAll: mockFeatureLoaderGetAll,
        get: mockFeatureLoaderGet,
        update: mockFeatureLoaderUpdate,
        findByBranch: vi.fn().mockResolvedValue(null),
        findByPRNumber: vi.fn().mockResolvedValue(null),
      };
    });

    vi.mocked(StagingPromotionService).mockImplementation(function () {
      return {
        detectDevMerge: vi.fn().mockReturnValue(false),
        createCandidate: vi.fn(),
      };
    });

    vi.mocked(verifyWebhookSignature).mockReturnValue({ valid: true });
    vi.mocked(getPRWatcherService).mockReturnValue({
      isWatching: vi.fn().mockReturnValue(false),
      triggerCheck: vi.fn().mockResolvedValue(undefined),
    } as any);
    vi.mocked(getWebhookDeliveryService).mockReturnValue(null as any);

    // Default exec: git diff returns a source file, gh pr list returns []
    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(null, { stdout: 'src/index.ts\n', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };
  });

  it('resolves projectPath from registry and marks feature done for external repo merge', async () => {
    const externalRepo = 'protoLabsAI/mythxengine';
    const externalProjectPath = '/home/josh/dev/labs/mythxengine';
    const feature = makeFeature();

    // Feature lives in the external project, not in settings.projects
    mockFeatureLoaderGetAll.mockImplementation((projectPath: string) => {
      if (projectPath === externalProjectPath) {
        return Promise.resolve([feature]);
      }
      return Promise.resolve([]);
    });
    mockFeatureLoaderGet.mockImplementation((projectPath: string, _id: string) => {
      if (projectPath === externalProjectPath) {
        return Promise.resolve(feature);
      }
      return Promise.resolve(null);
    });

    const settingsService = buildSettingsService([]); // external path NOT in settings.projects
    const projectRegistry = buildProjectRegistry(externalRepo, externalProjectPath);

    const handler = createGitHubWebhookHandler(
      events as any,
      settingsService as any,
      undefined,
      projectRegistry as any
    );
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload(externalRepo);

    await handler(req as Request, res as Response);

    // Registry lookup was called with the correct repo full name
    expect(projectRegistry.getProjectByGithub).toHaveBeenCalledWith(externalRepo);

    // Feature was updated to done in the EXTERNAL project path
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      externalProjectPath,
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('falls back to settings.projects scan when repo not in registry', async () => {
    const internalRepo = 'protoLabsAI/protoMaker';
    const internalProjectPath = '/home/josh/dev/ava';
    const feature = makeFeature();

    mockFeatureLoaderGetAll.mockImplementation((projectPath: string) => {
      if (projectPath === internalProjectPath) {
        return Promise.resolve([feature]);
      }
      return Promise.resolve([]);
    });
    mockFeatureLoaderGet.mockImplementation((projectPath: string, _id: string) => {
      if (projectPath === internalProjectPath) {
        return Promise.resolve(feature);
      }
      return Promise.resolve(null);
    });

    // Registry does NOT have an entry for this repo (returns null)
    const settingsService = buildSettingsService([internalProjectPath]);
    const projectRegistry = {
      getProjectByGithub: vi.fn().mockReturnValue(null),
    };

    const handler = createGitHubWebhookHandler(
      events as any,
      settingsService as any,
      undefined,
      projectRegistry as any
    );
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload(internalRepo);

    await handler(req as Request, res as Response);

    // Feature was still found and marked done via settings.projects fallback
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      internalProjectPath,
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
  });

  it('handles all three GitHub merge shapes (merge commit, squash, rebase) — all have merged=true', async () => {
    const externalRepo = 'protoLabsAI/mythxengine';
    const externalProjectPath = '/home/josh/dev/labs/mythxengine';

    const mergeShapes = [
      { label: 'merge commit', mergeCommitSha: 'merge111aaa' },
      { label: 'squash', mergeCommitSha: 'squash222bbb' },
      { label: 'rebase (last commit)', mergeCommitSha: 'rebase333ccc' },
    ];

    for (const shape of mergeShapes) {
      vi.clearAllMocks();
      const feature = makeFeature(`feature/shape-${shape.label.replace(/\s/g, '-')}`);

      mockFeatureLoaderGetAll.mockImplementation((projectPath: string) => {
        if (projectPath === externalProjectPath) return Promise.resolve([feature]);
        return Promise.resolve([]);
      });
      mockFeatureLoaderGet.mockImplementation((projectPath: string) => {
        if (projectPath === externalProjectPath) return Promise.resolve(feature);
        return Promise.resolve(null);
      });

      vi.mocked(FeatureLoader).mockImplementation(function () {
        return {
          getAll: mockFeatureLoaderGetAll,
          get: mockFeatureLoaderGet,
          update: mockFeatureLoaderUpdate,
          findByBranch: vi.fn().mockResolvedValue(null),
          findByPRNumber: vi.fn().mockResolvedValue(null),
        };
      });
      vi.mocked(StagingPromotionService).mockImplementation(function () {
        return { detectDevMerge: vi.fn().mockReturnValue(false), createCandidate: vi.fn() };
      });

      const settingsService = buildSettingsService([]);
      const projectRegistry = buildProjectRegistry(externalRepo, externalProjectPath);

      const handler = createGitHubWebhookHandler(
        events as any,
        settingsService as any,
        undefined,
        projectRegistry as any
      );
      const { req, res } = createMockExpressContext();
      req.headers = { 'x-github-event': 'pull_request' };
      req.body = {
        action: 'closed',
        pull_request: {
          number: 200,
          title: `PR via ${shape.label}`,
          state: 'closed',
          merged: true,
          merged_at: '2026-01-01T00:00:00Z',
          merge_commit_sha: shape.mergeCommitSha,
          head: { ref: feature.branchName },
          base: { ref: 'main' },
        },
        repository: { full_name: externalRepo },
      };

      await handler(req as Request, res as Response);

      expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
        externalProjectPath,
        feature.featureId,
        expect.objectContaining({ status: 'done' })
      );
    }
  });

  it('does not transition feature when no registry entry and no matching settings project', async () => {
    const unknownRepo = 'unknown-org/unknown-repo';
    const feature = makeFeature();

    // Feature exists but won't be found — no project path resolves to the right dir
    mockFeatureLoaderGetAll.mockResolvedValue([]);
    mockFeatureLoaderGet.mockResolvedValue(null);

    const settingsService = buildSettingsService([]);
    const projectRegistry = {
      getProjectByGithub: vi.fn().mockReturnValue(null),
    };

    const handler = createGitHubWebhookHandler(
      events as any,
      settingsService as any,
      undefined,
      projectRegistry as any
    );
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload(unknownRepo);

    await handler(req as Request, res as Response);

    // No update should have been called — feature not found
    expect(mockFeatureLoaderUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('No feature found'),
      })
    );
  });
});
