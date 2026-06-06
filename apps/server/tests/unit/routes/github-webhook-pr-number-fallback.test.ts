/**
 * Tests for the webhook PR-number fallback in github.ts
 *
 * When a merged PR webhook arrives and findFeatureByBranch() returns null
 * (no feature matches the branch name), the handler falls back to scanning
 * all projects via findByPRNumber(). This covers board-only features where
 * prNumber was linked but branchName was not.
 *
 * See: feature-1780725971226-omzw4h685
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

// Mock child_process.exec (used by git diff for source-change verification)
const mockExec = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({
  exec: mockExec,
  execFile: vi.fn(),
  spawn: vi.fn(),
  fork: vi.fn(),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

// Mock FeatureLoader
const mockFeatureLoaderGetAll = vi.hoisted(() => vi.fn());
const mockFeatureLoaderGet = vi.hoisted(() => vi.fn());
const mockFeatureLoaderUpdate = vi.hoisted(() => vi.fn());
const mockFeatureLoaderFindByPRNumber = vi.hoisted(() => vi.fn());
const mockFeatureLoaderFindByIssueNumber = vi.hoisted(() => vi.fn());

vi.mock('@/services/feature-loader.js', () => {
  return {
    FeatureLoader: vi.fn(() => ({
      getAll: mockFeatureLoaderGetAll,
      get: mockFeatureLoaderGet,
      update: mockFeatureLoaderUpdate,
      findByPRNumber: mockFeatureLoaderFindByPRNumber,
      findByIssueNumber: mockFeatureLoaderFindByIssueNumber,
    })),
  };
});

// Mock SettingsService
const mockGetGlobalSettings = vi.hoisted(() => vi.fn());
const mockGetCredentials = vi.hoisted(() => vi.fn());

vi.mock('@/services/settings-service.js', () => ({
  SettingsService: vi.fn(() => ({
    getGlobalSettings: mockGetGlobalSettings,
    getCredentials: mockGetCredentials,
  })),
}));

// Mock events
const mockEventsEmit = vi.hoisted(() => vi.fn());

// Mock webhook delivery service
vi.mock('@/services/webhook-delivery-service.js', () => ({
  getWebhookDeliveryService: vi.fn(() => ({
    isDuplicate: vi.fn(() => false),
    trackDelivery: vi.fn(),
  })),
}));

import { createGitHubWebhookHandler } from '@/routes/webhooks/routes/github.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides = {}) {
  return {
    id: 'feature-001',
    title: 'Test Feature',
    status: 'review',
    branchName: 'feature/test-branch',
    prNumber: 42,
    prUrl: 'https://github.com/owner/repo/pull/42',
    ...overrides,
  };
}

function makeMergedPRPayload(overrides = {}) {
  return {
    action: 'closed',
    pull_request: {
      number: 42,
      title: 'Test PR',
      state: 'closed',
      merged: true,
      merged_at: '2026-06-06T12:00:00Z',
      merge_commit_sha: 'abc123',
      head: { ref: 'feature/test-branch' },
      base: { ref: 'main' },
    },
    repository: { full_name: 'owner/repo' },
    ...overrides,
  };
}

function setupDefaults() {
  mockGetGlobalSettings.mockResolvedValue({
    githubWebhook: {},
    projects: [{ path: '/project-a' }, { path: '/project-b' }],
  });
  mockGetCredentials.mockResolvedValue({ webhookSecrets: undefined });

  // git diff returns source files (not metadata-only)
  mockExec.mockImplementation((cmd, opts, cb) => {
    cb(null, { stdout: 'src/foo.ts\nsrc/bar.ts', stderr: '' });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHub webhook handler — PR number fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('transitions feature to done when found by branchName (existing path)', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);
    mockFeatureLoaderGet.mockResolvedValue(feature);
    mockFeatureLoaderFindByPRNumber.mockResolvedValue(null);

    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makeMergedPRPayload();

    const handler = createGitHubWebhookHandler(
      { emit: mockEventsEmit } as any,
      { getGlobalSettings: mockGetGlobalSettings, getCredentials: mockGetCredentials } as any
    );

    await handler(req as Request, res as Response);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith('/project-a', 'feature-001', {
      status: 'done',
    });
    expect(mockEventsEmit).toHaveBeenCalledWith('feature:pr-merged', expect.any(Object));
    expect(res.json).toHaveBeenCalled();
  });

  it('falls back to findByPRNumber when no feature matches branchName', async () => {
    // No feature in /project-a matches the branch name
    mockFeatureLoaderGetAll
      .mockResolvedValueOnce([{ id: 'other', branchName: 'feature/other' }]) // project-a
      .mockResolvedValueOnce([{ id: 'other2', branchName: 'feature/other2' }]); // project-b

    // findByPRNumber finds the feature in /project-b
    mockFeatureLoaderFindByPRNumber
      .mockResolvedValueOnce(null) // project-a
      .mockResolvedValueOnce(
        makeFeature({ id: 'feature-pr-only', branchName: undefined, prNumber: 42 })
      ); // project-b

    // get() returns the full feature
    const fullFeature = makeFeature({
      id: 'feature-pr-only',
      branchName: undefined,
      prNumber: 42,
    });
    mockFeatureLoaderGet.mockResolvedValue(fullFeature);

    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makeMergedPRPayload();

    const handler = createGitHubWebhookHandler(
      { emit: mockEventsEmit } as any,
      { getGlobalSettings: mockGetGlobalSettings, getCredentials: mockGetCredentials } as any
    );

    await handler(req as Request, res as Response);

    // Feature should be updated to done
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith('/project-b', 'feature-pr-only', {
      status: 'done',
    });
    // Event should be emitted
    expect(mockEventsEmit).toHaveBeenCalledWith(
      'feature:pr-merged',
      expect.objectContaining({
        featureId: 'feature-pr-only',
        prNumber: 42,
      })
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('returns "no feature found" when neither branchName nor prNumber match', async () => {
    mockFeatureLoaderGetAll.mockResolvedValue([{ id: 'other', branchName: 'feature/other' }]);
    mockFeatureLoaderFindByPRNumber.mockResolvedValue(null);

    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makeMergedPRPayload({ pull_request: { number: 999 } });

    const handler = createGitHubWebhookHandler(
      { emit: mockEventsEmit } as any,
      { getGlobalSettings: mockGetGlobalSettings, getCredentials: mockGetCredentials } as any
    );

    await handler(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('No feature found'),
      })
    );
    expect(mockFeatureLoaderUpdate).not.toHaveBeenCalled();
    expect(mockEventsEmit).not.toHaveBeenCalled();
  });

  it('skips transition when feature found by prNumber is already terminal (idempotency)', async () => {
    mockFeatureLoaderGetAll.mockResolvedValue([{ id: 'other', branchName: 'feature/other' }]);

    mockFeatureLoaderFindByPRNumber
      .mockResolvedValueOnce(null) // project-a
      .mockResolvedValueOnce(
        makeFeature({ id: 'feature-done', branchName: undefined, status: 'done' })
      ); // project-b

    mockFeatureLoaderGet.mockResolvedValue(
      makeFeature({
        id: 'feature-done',
        branchName: undefined,
        status: 'done',
      })
    );

    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makeMergedPRPayload();

    const handler = createGitHubWebhookHandler(
      { emit: mockEventsEmit } as any,
      { getGlobalSettings: mockGetGlobalSettings, getCredentials: mockGetCredentials } as any
    );

    await handler(req as Request, res as Response);

    // Should NOT update an already-done feature
    expect(mockFeatureLoaderUpdate).not.toHaveBeenCalled();
    expect(mockEventsEmit).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('terminal'),
      })
    );
  });

  it('scans all configured projects when falling back to prNumber', async () => {
    mockFeatureLoaderGetAll.mockResolvedValue([]);

    // First project has no match, second project matches
    mockFeatureLoaderFindByPRNumber
      .mockResolvedValueOnce(null) // project-a
      .mockResolvedValueOnce(makeFeature({ id: 'found-in-b', branchName: undefined })); // project-b

    mockFeatureLoaderGet.mockResolvedValue(
      makeFeature({
        id: 'found-in-b',
        branchName: undefined,
      })
    );

    const { req, res } = createMockExpressContext();
    req.headers = { 'x-github-event': 'pull_request' };
    req.body = makeMergedPRPayload();

    const handler = createGitHubWebhookHandler(
      { emit: mockEventsEmit } as any,
      { getGlobalSettings: mockGetGlobalSettings, getCredentials: mockGetCredentials } as any
    );

    await handler(req as Request, res as Response);

    // findByPRNumber was called for both projects
    expect(mockFeatureLoaderFindByPRNumber).toHaveBeenCalledTimes(2);
    expect(mockFeatureLoaderFindByPRNumber).toHaveBeenNthCalledWith(1, '/project-a', 42);
    expect(mockFeatureLoaderFindByPRNumber).toHaveBeenNthCalledWith(2, '/project-b', 42);

    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith('/project-b', 'found-in-b', {
      status: 'done',
    });
  });
});
