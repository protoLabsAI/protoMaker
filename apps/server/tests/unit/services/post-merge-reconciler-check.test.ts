/**
 * Tests for PostMergeReconcilerCheck — poll-based fallback for missed PR merge webhooks.
 *
 * Verifies that features stuck in 'review' on ANY tracked repo (not just protoMaker)
 * are correctly transitioned to 'done' when the reconciler detects a merged PR.
 *
 * See: protoLabsAI/protoMaker#3115
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  PostMergeReconcilerCheck,
  extractRepoFromPrUrl,
} from '@/services/maintenance/checks/post-merge-reconciler-check.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feature-001',
    title: 'PC Speech Bubbles in Chat',
    status: 'review',
    branchName: 'feature/pc-speech-bubbles-in-chat',
    prNumber: 184,
    prUrl: 'https://github.com/protoLabsAI/mythxengine/pull/184',
    ...overrides,
  };
}

function makeExecFileAsync(responses: Record<string, { stdout: string } | Error>) {
  return async (
    _file: string,
    args: string[],
    _opts: { encoding: string; timeout: number }
  ): Promise<{ stdout: string; stderr: string }> => {
    // Find the --repo arg to build the key
    const repoIdx = args.indexOf('--repo');
    const prIdx = args.indexOf('view') + 1;
    const prNum = args[prIdx];
    const repo = repoIdx >= 0 ? args[repoIdx + 1] : 'unknown';
    const key = `${repo}#${prNum}`;

    const response = responses[key] ?? responses['*'];
    if (!response) throw new Error(`No mock response for ${key}`);
    if (response instanceof Error) throw response;
    return { stdout: response.stdout, stderr: '' };
  };
}

// ── extractRepoFromPrUrl unit tests ───────────────────────────────────────

describe('extractRepoFromPrUrl', () => {
  it('extracts owner/repo from a standard GitHub PR URL', () => {
    expect(extractRepoFromPrUrl('https://github.com/protoLabsAI/mythxengine/pull/184')).toBe(
      'protoLabsAI/mythxengine'
    );
  });

  it('extracts owner/repo from protoMaker PR URL', () => {
    expect(extractRepoFromPrUrl('https://github.com/protoLabsAI/protoMaker/pull/42')).toBe(
      'protoLabsAI/protoMaker'
    );
  });

  it('returns null for non-GitHub URLs', () => {
    expect(extractRepoFromPrUrl('https://gitlab.com/owner/repo/merge_requests/1')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(extractRepoFromPrUrl('not-a-url')).toBeNull();
  });
});

// ── PostMergeReconcilerCheck integration tests ────────────────────────────

describe('PostMergeReconcilerCheck', () => {
  let events: EventEmitter;
  let mockFeatureLoaderGetAll: ReturnType<typeof vi.fn>;
  let mockFeatureLoaderUpdate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    events = new EventEmitter();
    mockFeatureLoaderGetAll = vi.fn().mockResolvedValue([]);
    mockFeatureLoaderUpdate = vi.fn().mockResolvedValue(undefined);
  });

  function makeLoader() {
    return {
      getAll: mockFeatureLoaderGetAll,
      update: mockFeatureLoaderUpdate,
    } as unknown as Parameters<typeof PostMergeReconcilerCheck>[0];
  }

  // ── Core scenario: non-protoMaker repo (the original bug) ───────────────

  it('transitions a mythxengine feature to done when the PR is merged — missed webhook scenario', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = makeExecFileAsync({
      'protoLabsAI/mythxengine#184': {
        stdout: JSON.stringify({ state: 'MERGED', merged: true }),
      },
    });

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);
    const emittedEvents: unknown[] = [];
    events.on('feature:pr-merged', (e) => emittedEvents.push(e));

    const result = await check.run('/home/josh/dev/labs/mythxengine');

    expect(result.checked).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      '/home/josh/dev/labs/mythxengine',
      'feature-001',
      { status: 'done', statusChangeReason: 'merged PR detected via poll reconciliation' }
    );
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toMatchObject({ featureId: 'feature-001', prNumber: 184 });
  });

  it('does NOT re-transition a feature already in done status (idempotency guard)', async () => {
    const feature = makeFeature({ status: 'done' });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = vi.fn();
    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);

    const result = await check.run('/home/josh/dev/labs/mythxengine');

    expect(result.checked).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(mockFeatureLoaderUpdate).not.toHaveBeenCalled();
    // execFile should never be called — feature is filtered out before checking GitHub
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('skips features without prNumber AND without branchName', async () => {
    // Phase 2 (branch-fallback) requires branchName. With neither, the feature
    // can't be looked up at all and is skipped silently.
    const feature = makeFeature({ prNumber: undefined, branchName: undefined });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = vi.fn();
    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);

    const result = await check.run('/project');

    expect(result.checked).toBe(0);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('falls back to branchName lookup when prNumber is missing (Phase 2)', async () => {
    // Phase 2: feature has branchName but no prNumber → `gh pr list --head <branch> --state merged`
    // discovers the merged PR and writes prNumber/prUrl back. This catches the
    // case where the PR-creation write path dropped the metadata (#3613).
    const feature = makeFeature({ prNumber: undefined, prUrl: undefined });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = vi.fn(async (_file: string, args: string[]) => {
      // Only `gh pr list ... --state merged ... --head <branch>` is expected.
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          stdout: JSON.stringify([
            {
              number: 184,
              url: 'https://github.com/protoLabsAI/mythxengine/pull/184',
              mergedAt: '2026-05-22T12:00:00Z',
            },
          ]),
          stderr: '',
        };
      }
      throw new Error(`Unexpected gh invocation: ${args.join(' ')}`);
    });
    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync as any);

    const result = await check.run('/project');

    expect(result.checked).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      '/project',
      'feature-001',
      expect.objectContaining({
        status: 'done',
        prNumber: 184,
        prUrl: 'https://github.com/protoLabsAI/mythxengine/pull/184',
      })
    );
  });

  it('falls back to branchName lookup when prUrl is missing (Phase 2)', async () => {
    const feature = makeFeature({ prUrl: undefined });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = vi.fn(async (_file: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          stdout: JSON.stringify([
            {
              number: 184,
              url: 'https://github.com/protoLabsAI/mythxengine/pull/184',
              mergedAt: '2026-05-22T12:00:00Z',
            },
          ]),
          stderr: '',
        };
      }
      throw new Error(`Unexpected gh invocation: ${args.join(' ')}`);
    });
    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync as any);

    const result = await check.run('/project');

    expect(result.checked).toBe(1);
    expect(result.reconciled).toBe(1);
  });

  it('does not transition a feature whose PR is still open', async () => {
    const feature = makeFeature();
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = makeExecFileAsync({
      'protoLabsAI/mythxengine#184': {
        stdout: JSON.stringify({ state: 'OPEN', merged: false }),
      },
    });

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);

    const result = await check.run('/home/josh/dev/labs/mythxengine');

    expect(result.checked).toBe(1);
    expect(result.reconciled).toBe(0);
    expect(mockFeatureLoaderUpdate).not.toHaveBeenCalled();
  });

  it('handles GitHub CLI errors gracefully (non-fatal, continues to next feature)', async () => {
    const features = [
      makeFeature({ id: 'f-001', prNumber: 184 }),
      makeFeature({
        id: 'f-002',
        prNumber: 185,
        prUrl: 'https://github.com/protoLabsAI/mythxengine/pull/185',
      }),
    ];
    mockFeatureLoaderGetAll.mockResolvedValue(features);

    const execFileAsync = makeExecFileAsync({
      'protoLabsAI/mythxengine#184': new Error('gh: API rate limit exceeded'),
      'protoLabsAI/mythxengine#185': {
        stdout: JSON.stringify({ state: 'MERGED', merged: true }),
      },
    });

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);

    const result = await check.run('/home/josh/dev/labs/mythxengine');

    // First feature errored (not reconciled), second was successfully reconciled
    expect(result.checked).toBe(2);
    expect(result.reconciled).toBe(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledTimes(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(expect.any(String), 'f-002', {
      status: 'done',
      statusChangeReason: 'merged PR detected via poll reconciliation',
    });
  });

  it('reconciles a backlog feature whose PR merged after auto-decay (issue #3467)', async () => {
    // Feature was auto-decayed from review → backlog while PR was pending.
    // The PR then merged. The reconciler must catch this even though status is backlog.
    const feature = makeFeature({
      status: 'backlog',
      statusChangeReason: 'Auto-decayed: stalled in review for 58min with failing CI',
    });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = makeExecFileAsync({
      'protoLabsAI/mythxengine#184': {
        stdout: JSON.stringify({ state: 'MERGED', merged: true }),
      },
    });

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);
    const emittedEvents: unknown[] = [];
    events.on('feature:pr-merged', (e) => emittedEvents.push(e));

    const result = await check.run('/home/josh/dev/labs/mythxengine');

    expect(result.checked).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      '/home/josh/dev/labs/mythxengine',
      'feature-001',
      { status: 'done', statusChangeReason: 'merged PR detected via poll reconciliation' }
    );
    expect(emittedEvents).toHaveLength(1);
  });

  it('reconciles a blocked feature whose PR merged after being blocked (issue #3467)', async () => {
    const feature = makeFeature({ status: 'blocked' });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const execFileAsync = makeExecFileAsync({
      'protoLabsAI/mythxengine#184': {
        stdout: JSON.stringify({ state: 'MERGED', merged: true }),
      },
    });

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);
    const result = await check.run('/home/josh/dev/labs/mythxengine');

    expect(result.reconciled).toBe(1);
    expect(mockFeatureLoaderUpdate).toHaveBeenCalledWith(
      expect.any(String),
      'feature-001',
      expect.objectContaining({ status: 'done' })
    );
  });

  it('returns zero counts when no features have any reconcilable identifier', async () => {
    // Only features with prNumber+prUrl (Phase 1) OR a branchName (Phase 2) are
    // checked. A backlog feature with neither prNumber nor branchName can't be
    // looked up, and a done feature is filtered by the terminal-status guard.
    mockFeatureLoaderGetAll.mockResolvedValue([
      makeFeature({
        status: 'backlog',
        prNumber: undefined,
        prUrl: undefined,
        branchName: undefined,
      }),
      makeFeature({ status: 'done' }),
    ]);

    const execFileAsync = vi.fn();
    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);

    const result = await check.run('/project');

    expect(result.checked).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it('passes the correct --repo flag derived from prUrl to gh CLI', async () => {
    const feature = makeFeature({
      prUrl: 'https://github.com/some-org/some-other-repo/pull/99',
      prNumber: 99,
    });
    mockFeatureLoaderGetAll.mockResolvedValue([feature]);

    const calls: string[][] = [];
    const execFileAsync = async (
      _file: string,
      args: string[],
      _opts: unknown
    ): Promise<{ stdout: string; stderr: string }> => {
      calls.push(args);
      return { stdout: JSON.stringify({ state: 'OPEN', merged: false }), stderr: '' };
    };

    const check = new PostMergeReconcilerCheck(makeLoader(), events as any, execFileAsync);
    await check.run('/project');

    expect(calls).toHaveLength(1);
    const repoIdx = calls[0].indexOf('--repo');
    expect(calls[0][repoIdx + 1]).toBe('some-org/some-other-repo');
    expect(calls[0]).toContain('99');
  });
});
