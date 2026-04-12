/**
 * Regression tests for the post-merge source-code verification gate.
 *
 * When a PR merges but contains only metadata files (.automaker-lock, lock files,
 * markdown), the feature should transition to `blocked` — not `done`. This prevents
 * the silent failure mode where an agent committed to the wrong base (e.g., missing
 * epic branch fallback) and the board incorrectly showed 100% completion.
 *
 * See: protoLabsAI/protoMaker#3376
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

vi.mock('child_process', () => ({
  exec: (
    cmd: string,
    opts: unknown,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
  ) => mockExecImpl(cmd, opts, cb),
}));

const mockFeatureLoaderUpdate = vi.fn().mockResolvedValue(undefined);
const mockFeatureLoaderGet = vi.fn();
const mockFeatureLoaderGetAll = vi.fn().mockResolvedValue([]);

vi.mock('@/services/feature-loader.js', () => ({
  FeatureLoader: vi.fn().mockImplementation(() => ({
    getAll: mockFeatureLoaderGetAll,
    get: mockFeatureLoaderGet,
    update: mockFeatureLoaderUpdate,
    findByBranch: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('@/services/staging-promotion-service.js', () => ({
  StagingPromotionService: vi.fn().mockImplementation(() => ({
    detectDevMerge: vi.fn().mockReturnValue(false),
    createCandidate: vi.fn(),
  })),
}));

vi.mock('@/lib/webhook-signature.js', () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/services/pr-watcher-service.js', () => ({
  getPRWatcherService: vi.fn().mockReturnValue({
    isWatching: vi.fn().mockReturnValue(false),
    triggerCheck: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/services/webhook-delivery-service.js', () => ({
  getWebhookDeliveryService: vi.fn().mockReturnValue(null),
}));

import { createGitHubWebhookHandler } from '@/routes/webhooks/routes/github.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSettingsService() {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      githubWebhook: { enabled: true },
      projects: [{ path: '/project' }],
      promotion: {},
    }),
    getCredentials: vi.fn().mockResolvedValue({ webhookSecrets: {} }),
  };
}

function makePrMergedPayload(overrides: {
  branchName?: string;
  baseBranch?: string;
  mergeCommitSha?: string;
  prNumber?: number;
} = {}) {
  return {
    action: 'closed',
    pull_request: {
      number: overrides.prNumber ?? 42,
      title: 'test: feature PR',
      state: 'closed',
      merged: true,
      merged_at: '2026-01-01T00:00:00Z',
      merge_commit_sha: overrides.mergeCommitSha ?? 'abc123def456',
      head: { ref: overrides.branchName ?? 'feature/test-feature' },
      base: { ref: overrides.baseBranch ?? 'dev' },
    },
    repository: { full_name: 'org/repo' },
  };
}

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feature-001',
    featureId: 'feature-001',
    title: 'Test Feature',
    status: 'review',
    branchName: 'feature/test-feature',
    filesToModify: undefined,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PR merge source-code verification gate', () => {
  let events: EventEmitter;
  let settingsService: ReturnType<typeof buildSettingsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new EventEmitter();
    settingsService = buildSettingsService();

    // Default exec: git diff returns empty, gh pr list returns []
    mockExecImpl = (_cmd, _opts, cb) => {
      cb(null, { stdout: '', stderr: '' });
    };
  });

  it('sets feature to blocked when PR contains only .automaker-lock', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    // git diff returns only .automaker-lock
    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(null, { stdout: '.automaker-lock\n', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload();

    await handler(req as Request, res as Response);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({ status: 'blocked' })
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('sets feature to blocked when PR contains only lock files and markdown', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(null, { stdout: 'pnpm-lock.yaml\nREADME.md\n.automaker-lock\n', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload();

    await handler(req as Request, res as Response);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({
        status: 'blocked',
        statusChangeReason: expect.stringContaining('no source code changes'),
      })
    );
  });

  it('sets feature to done when PR contains source files', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(null, { stdout: 'src/services/my-service.ts\npnpm-lock.yaml\n', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload();

    await handler(req as Request, res as Response);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
  });

  it('treats files in filesToModify as source files even if they are markdown', async () => {
    const feature = makeFeature({ filesToModify: ['docs/api.md'] });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    // PR only contains docs/api.md — normally metadata, but it's in filesToModify
    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(null, { stdout: 'docs/api.md\n', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload();

    await handler(req as Request, res as Response);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
  });

  it('defaults to done when git diff fails (non-fatal failure mode)', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        cb(new Error('git not available'), { stdout: '', stderr: '' });
      } else {
        cb(null, { stdout: '[]', stderr: '' });
      }
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload();

    await handler(req as Request, res as Response);

    // Should not block on diff failure — fail open to done
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
  });

  it('skips diff check and marks done when mergeCommitSha is empty', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);

    const gitDiffCalled = vi.fn();
    mockExecImpl = (cmd, _opts, cb) => {
      if (cmd.includes('git diff')) {
        gitDiffCalled();
      }
      cb(null, { stdout: '[]', stderr: '' });
    };

    const handler = createGitHubWebhookHandler(events as any, settingsService as any);
    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makePrMergedPayload({ mergeCommitSha: '' });

    await handler(req as Request, res as Response);

    expect(gitDiffCalled).not.toHaveBeenCalled();
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      feature.featureId,
      expect.objectContaining({ status: 'done' })
    );
  });
});
