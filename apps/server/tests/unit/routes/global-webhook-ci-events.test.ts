/**
 * Tests for check_suite and check_run CI event handling on the global webhook route
 * (POST /webhooks/github).
 *
 * Verifies:
 * - check_suite completed+failure emits pr:ci-failure for each associated PR
 * - check_suite non-failure actions are ignored
 * - check_suite with no PRs is ignored
 * - check_run completed triggers PRWatcherService.triggerCheck for watched PRs
 * - check_run non-completed actions are ignored
 * - Deduplication is left to PRFeedbackService (checkSuiteId is forwarded in payload)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { createMockExpressContext } from '../../utils/mocks.js';

// Mock heavy dependencies before importing the module under test
vi.mock('@/services/feature-loader.js', () => ({
  FeatureLoader: vi.fn().mockImplementation(() => ({
    getAll: vi.fn().mockResolvedValue([]),
    findByPRNumber: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/services/pr-watcher-service.js');

import { createGitHubWebhookHandler } from '@/routes/webhooks/routes/github.js';
import { getPRWatcherService } from '@/services/pr-watcher-service.js';

const mockGetPRWatcherService = vi.mocked(getPRWatcherService);

function buildMockSettingsService(overrides: Record<string, unknown> = {}) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      githubWebhook: { enabled: true },
      projects: [],
      promotion: {},
      ...overrides,
    }),
    getCredentials: vi.fn().mockResolvedValue({
      webhookSecrets: {},
    }),
  };
}

function makeCheckSuitePayload(
  overrides: {
    action?: string;
    conclusion?: string | null;
    suiteId?: number;
    headSha?: string;
    prs?: Array<{ number: number; head: { ref: string } }>;
  } = {}
) {
  const {
    action = 'completed',
    conclusion = 'failure',
    suiteId = 9999,
    headSha = 'abc123',
    prs = [{ number: 42, head: { ref: 'feature/my-feature' } }],
  } = overrides;

  return {
    action,
    check_suite: {
      id: suiteId,
      conclusion,
      head_sha: headSha,
      url: `https://api.github.com/repos/org/repo/check-suites/${suiteId}`,
      check_runs_url: `https://api.github.com/repos/org/repo/check-suites/${suiteId}/check-runs`,
      pull_requests: prs,
    },
    repository: { full_name: 'org/repo' },
  };
}

function makeCheckRunPayload(
  overrides: {
    action?: string;
    runId?: number;
    name?: string;
    prs?: Array<{ number: number }>;
  } = {}
) {
  const { action = 'completed', runId = 555, name = 'ci/test', prs = [{ number: 42 }] } = overrides;

  return {
    action,
    check_run: {
      id: runId,
      name,
      pull_requests: prs,
    },
    repository: { full_name: 'org/repo' },
  };
}

describe('Global webhook route — CI events', () => {
  let events: EventEmitter;
  let settingsService: ReturnType<typeof buildMockSettingsService>;
  let mockTriggerCheck: ReturnType<typeof vi.fn>;
  let mockIsWatching: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    events = new EventEmitter();
    settingsService = buildMockSettingsService();

    mockTriggerCheck = vi.fn().mockResolvedValue(undefined);
    mockIsWatching = vi.fn().mockReturnValue(false);

    mockGetPRWatcherService.mockReturnValue({
      isWatching: mockIsWatching,
      triggerCheck: mockTriggerCheck,
    } as any);
  });

  // ── check_suite ────────────────────────────────────────────────────────────

  describe('check_suite events', () => {
    it('emits pr:ci-failure for completed+failure check suite with associated PRs', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload();

      const emittedEvents: unknown[] = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents).toHaveLength(1);
      const evt = emittedEvents[0] as Record<string, unknown>;
      expect(evt.prNumber).toBe(42);
      expect(evt.checkSuiteId).toBe(9999);
      expect(evt.headSha).toBe('abc123');
      expect(evt.repository).toBe('org/repo');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('emits one pr:ci-failure event per associated PR', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload({
        prs: [
          { number: 10, head: { ref: 'feature/a' } },
          { number: 20, head: { ref: 'feature/b' } },
        ],
      });

      const emittedEvents: unknown[] = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents).toHaveLength(2);
      const prNumbers = (emittedEvents as Array<Record<string, unknown>>).map((e) => e.prNumber);
      expect(prNumbers).toContain(10);
      expect(prNumbers).toContain(20);
    });

    it('does not emit pr:ci-failure for non-failure conclusions', async () => {
      for (const conclusion of ['success', 'neutral', 'cancelled', null]) {
        const handler = createGitHubWebhookHandler(events as any, settingsService as any);
        const { req, res } = createMockExpressContext();

        req.headers = { 'x-github-event': 'check_suite' };
        req.body = makeCheckSuitePayload({ conclusion });

        const emittedEvents: unknown[] = [];
        events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

        await handler(req as Request, res as Response);

        expect(emittedEvents).toHaveLength(0);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      }
    });

    it('does not emit pr:ci-failure when action is not completed', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload({ action: 'requested' });

      const emittedEvents: unknown[] = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents).toHaveLength(0);
    });

    it('does not emit pr:ci-failure when check suite has no PRs', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload({ prs: [] });

      const emittedEvents: unknown[] = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents).toHaveLength(0);
    });

    it('forwards checkSuiteId in pr:ci-failure payload for deduplication', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload({ suiteId: 77777 });

      const emittedEvents: Array<Record<string, unknown>> = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents[0].checkSuiteId).toBe(77777);
    });
  });

  // ── check_run ──────────────────────────────────────────────────────────────

  describe('check_run events', () => {
    it('triggers PRWatcher check for watched PRs on completed check run', async () => {
      mockIsWatching.mockImplementation((prNumber: number) => prNumber === 42);

      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload();

      await handler(req as Request, res as Response);

      expect(mockTriggerCheck).toHaveBeenCalledWith(42);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('does not trigger PRWatcher check for unwatched PRs', async () => {
      mockIsWatching.mockReturnValue(false);

      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload();

      await handler(req as Request, res as Response);

      expect(mockTriggerCheck).not.toHaveBeenCalled();
    });

    it('does not trigger PRWatcher for non-completed check_run actions', async () => {
      mockIsWatching.mockReturnValue(true);

      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload({ action: 'created' });

      await handler(req as Request, res as Response);

      expect(mockTriggerCheck).not.toHaveBeenCalled();
    });

    it('does not trigger PRWatcher when check run has no associated PRs', async () => {
      mockIsWatching.mockReturnValue(true);

      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload({ prs: [] });

      await handler(req as Request, res as Response);

      expect(mockTriggerCheck).not.toHaveBeenCalled();
    });

    it('does not trigger PRWatcher when watcher service is not available', async () => {
      mockGetPRWatcherService.mockReturnValueOnce(null);

      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload();

      // Should not throw
      await expect(handler(req as Request, res as Response)).resolves.toBeUndefined();
      expect(mockTriggerCheck).not.toHaveBeenCalled();
    });

    it('returns 200 with success for check_run events', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_run' };
      req.body = makeCheckRunPayload();

      await handler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'check_run event processed' })
      );
    });
  });

  // ── Integration: both routes ───────────────────────────────────────────────

  describe('route parity', () => {
    it('global route emits same pr:ci-failure shape as per-project route', async () => {
      const handler = createGitHubWebhookHandler(events as any, settingsService as any);
      const { req, res } = createMockExpressContext();

      req.headers = { 'x-github-event': 'check_suite' };
      req.body = makeCheckSuitePayload({
        suiteId: 1234,
        headSha: 'deadbeef',
        prs: [{ number: 99, head: { ref: 'feature/test' } }],
      });

      const emittedEvents: Array<Record<string, unknown>> = [];
      events.on('pr:ci-failure', (payload) => emittedEvents.push(payload));

      await handler(req as Request, res as Response);

      expect(emittedEvents).toHaveLength(1);
      const evt = emittedEvents[0];
      // These fields mirror the per-project route shape used by PRFeedbackService
      expect(evt).toHaveProperty('prNumber', 99);
      expect(evt).toHaveProperty('headBranch', 'feature/test');
      expect(evt).toHaveProperty('headSha', 'deadbeef');
      expect(evt).toHaveProperty('checkSuiteId', 1234);
      expect(evt).toHaveProperty('checkSuiteUrl');
      expect(evt).toHaveProperty('repository', 'org/repo');
      expect(evt).toHaveProperty('checksUrl');
    });
  });
});
