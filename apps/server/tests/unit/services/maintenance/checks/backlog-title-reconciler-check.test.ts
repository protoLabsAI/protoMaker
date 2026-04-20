/**
 * Unit tests for BacklogTitleReconcilerCheck.
 *
 * Covers:
 *   - normalizeTitle + jaccardSimilarity primitives
 *   - sweepProject happy path: zombie feature matches merged PR → marked done
 *   - threshold gate: low-similarity candidate NOT reconciled
 *   - skip rules: features with prNumber / assignee / already-claimed PR
 *   - mass-mutation cap: stops at 5 per sweep
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promisify } from 'util';

const execFileMock = vi.fn();
(execFileMock as unknown as Record<symbol, unknown>)[promisify.custom] = (
  file: string,
  args: string[],
  opts?: unknown
) =>
  new Promise((resolve, reject) => {
    execFileMock(file, args, opts, (err: Error | null, stdout: string, stderr: string) =>
      err ? reject(err) : resolve({ stdout, stderr })
    );
  });

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFile: execFileMock };
});

const { BacklogTitleReconcilerCheck, normalizeTitle, jaccardSimilarity } =
  await import('@/services/maintenance/checks/backlog-title-reconciler-check.js');

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

function respondMergedPrs(prs: Array<{ number: number; title: string; mergedAt: string }>) {
  execFileMock.mockImplementationOnce(
    (_file: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
      cb(null, JSON.stringify(prs), '');
    }
  );
}

type FakeFeature = {
  id: string;
  title: string;
  status: string;
  prNumber?: number | null;
  assignee?: string | null;
};

function createFeatureLoader(features: FakeFeature[]) {
  return {
    getAll: vi.fn(async () => features as unknown as unknown[]),
    update: vi.fn(async (_p: string, id: string, updates: Record<string, unknown>) => {
      const f = features.find((x) => x.id === id)!;
      Object.assign(f, updates);
      return f;
    }),
  } as unknown as Parameters<typeof BacklogTitleReconcilerCheck>[0];
}

function createEvents() {
  return { emit: vi.fn() } as unknown as Parameters<typeof BacklogTitleReconcilerCheck>[1];
}

describe('normalizeTitle', () => {
  it('strips conventional-commit prefix, punctuation, stopwords', () => {
    const tokens = normalizeTitle(
      'fix(intake): dedup issue-triage across A2A re-dispatches (#3503)'
    );
    expect(tokens.has('dedup')).toBe(true);
    expect(tokens.has('issue')).toBe(true);
    expect(tokens.has('triage')).toBe(true);
    expect(tokens.has('fix')).toBe(false); // stripped as prefix
    expect(tokens.has('the')).toBe(false); // stopword
    expect(tokens.has('3503')).toBe(false); // pure digits dropped
  });

  it('strips [tag] prefixes', () => {
    const tokens = normalizeTitle('[github] Quinn bug_triage non-idempotent');
    expect(tokens.has('github')).toBe(false);
    expect(tokens.has('quinn')).toBe(true);
    expect(tokens.has('idempotent')).toBe(true);
  });

  it('returns empty set for empty input', () => {
    expect(normalizeTitle('').size).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1.0 for identical sets', () => {
    const s = new Set(['a', 'b', 'c']);
    expect(jaccardSimilarity(s, s)).toBe(1);
  });

  it('returns 0 when either set is empty', () => {
    expect(jaccardSimilarity(new Set(), new Set(['a']))).toBe(0);
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
  });

  it('returns intersection/union for partial overlap', () => {
    const a = new Set(['a', 'b', 'c']);
    const b = new Set(['b', 'c', 'd']);
    // intersection=2, union=4
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });
});

describe('BacklogTitleReconcilerCheck.sweepProject', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('reconciles a zombie backlog feature to a matching merged PR', async () => {
    // Use a real-world near-duplicate pattern — the zombie feature-1776651219427
    // matches PR #3498 almost word-for-word.
    const now = new Date().toISOString();
    const loader = createFeatureLoader([
      {
        id: 'feat-zombie',
        title:
          'PipelineCheckpointService resumes at REVIEW without validating PR existence — ghost PR loop',
        status: 'backlog',
        prNumber: null,
      },
    ]);
    const events = createEvents();
    // Use a realistic threshold for the titles at hand: humans read these as
    // clearly about the same issue, but token Jaccard lands around 0.28 due to
    // word-form divergence (loop vs loops, without vs deleted, etc.). The
    // default threshold (0.6) is intentionally conservative; this test exercises
    // the reconciler logic with a tunable threshold the caller can configure.
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.25);

    respondMergedPrs([
      {
        number: 3498,
        title:
          'PipelineCheckpointService resumes at REVIEW on deleted/ghost PRs — auto-mode loops indefinitely',
        mergedAt: now,
      },
    ]);

    const result = await check.sweepProject('/tmp/proj');

    expect(result.reconciled).toBe(1);
    expect(loader.update).toHaveBeenCalledWith(
      '/tmp/proj',
      'feat-zombie',
      expect.objectContaining({ status: 'done', prNumber: 3498 })
    );
    expect((events as unknown as { emit: ReturnType<typeof vi.fn> }).emit).toHaveBeenCalledWith(
      'feature:auto-reconciled',
      expect.objectContaining({ prNumber: 3498 })
    );
  });

  it('does NOT reconcile when no PR crosses the similarity threshold', async () => {
    const now = new Date().toISOString();
    const loader = createFeatureLoader([
      {
        id: 'feat-unrelated',
        title: 'Add dark mode toggle to settings',
        status: 'backlog',
        prNumber: null,
      },
    ]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.6);

    respondMergedPrs([
      {
        number: 3504,
        title: 'fix(intake): dedup issue-triage across A2A re-dispatches',
        mergedAt: now,
      },
    ]);

    const result = await check.sweepProject('/tmp/proj');

    expect(result.reconciled).toBe(0);
    expect(loader.update).not.toHaveBeenCalled();
  });

  it('skips features with prNumber already set (PostMergeReconcilerCheck owns those)', async () => {
    const now = new Date().toISOString();
    const loader = createFeatureLoader([
      {
        id: 'feat-has-pr',
        title: 'fix issue-triage dedup regression',
        status: 'review',
        prNumber: 3504,
      },
    ]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.4);

    // No respondMergedPrs — fetchRecentMergedPrs should never be called
    // because the candidate filter already excluded this feature.
    // Actually the fetch runs before filtering in our impl... let's respond empty
    // to keep the test deterministic.
    respondMergedPrs([]);

    const result = await check.sweepProject('/tmp/proj');

    expect(result.checked).toBe(0);
    expect(result.reconciled).toBe(0);
    expect(loader.update).not.toHaveBeenCalled();
  });

  it('skips features with assignee set (human-owned)', async () => {
    const now = new Date().toISOString();
    const loader = createFeatureLoader([
      {
        id: 'feat-assigned',
        title: 'fix issue-triage dedup regression',
        status: 'backlog',
        prNumber: null,
        assignee: 'josh',
      },
    ]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.4);

    respondMergedPrs([
      { number: 3504, title: 'fix(intake): dedup issue-triage regression', mergedAt: now },
    ]);

    const result = await check.sweepProject('/tmp/proj');
    expect(result.reconciled).toBe(0);
  });

  it('refuses to reconcile to a PR already claimed by another feature', async () => {
    const now = new Date().toISOString();
    const loader = createFeatureLoader([
      {
        id: 'feat-dup',
        title: 'fix dedup issue-triage regression',
        status: 'backlog',
        prNumber: null,
      },
      {
        id: 'feat-already',
        title: 'already claimed',
        status: 'done',
        prNumber: 3504,
      },
    ]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.4);

    respondMergedPrs([{ number: 3504, title: 'fix dedup issue-triage regression', mergedAt: now }]);

    const result = await check.sweepProject('/tmp/proj');

    expect(result.reconciled).toBe(0);
    expect(loader.update).not.toHaveBeenCalled();
  });

  it('caps reconciliations at 5 per sweep (mass-mutation guard)', async () => {
    const now = new Date().toISOString();
    const features: FakeFeature[] = Array.from({ length: 8 }, (_, i) => ({
      id: `feat-${i}`,
      title: `fix regression number ${i} widget system`,
      status: 'backlog',
      prNumber: null,
    }));
    const loader = createFeatureLoader(features);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events, 0.3);

    // 8 candidate features, 8 unique merged PRs that each match one of them
    respondMergedPrs(
      features.map((f, i) => ({
        number: 9000 + i,
        title: f.title,
        mergedAt: now,
      }))
    );

    const result = await check.sweepProject('/tmp/proj');

    expect(result.reconciled).toBe(5);
    expect(loader.update).toHaveBeenCalledTimes(5);
  });

  it('returns empty result when there are no candidates', async () => {
    const loader = createFeatureLoader([{ id: 'done-1', title: 'already done', status: 'done' }]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events);

    // No respondMergedPrs — fetch should not be called when no candidates exist
    const result = await check.sweepProject('/tmp/proj');
    expect(result.reconciled).toBe(0);
    expect(result.checked).toBe(0);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('handles gh CLI failure gracefully (returns 0 reconciled)', async () => {
    const loader = createFeatureLoader([
      {
        id: 'feat-zombie',
        title: 'fix something',
        status: 'backlog',
        prNumber: null,
      },
    ]);
    const events = createEvents();
    const check = new BacklogTitleReconcilerCheck(loader, events);

    execFileMock.mockImplementationOnce(
      (_f: string, _a: string[], _o: unknown, cb: ExecCallback) => {
        cb(new Error('gh: command not found'), '', '');
      }
    );

    const result = await check.sweepProject('/tmp/proj');
    expect(result.reconciled).toBe(0);
    expect(loader.update).not.toHaveBeenCalled();
  });
});
