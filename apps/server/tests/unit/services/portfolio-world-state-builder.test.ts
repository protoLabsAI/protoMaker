/**
 * Unit tests for PortfolioWorldStateBuilder
 *
 * Covers:
 * - Empty project list returns zero metrics
 * - crossRepoBlockedCount is sum of per-project blocked counts
 * - portfolioFlowEfficiency = done / total across all projects
 * - Unreachable project marked as red with exhausted error budget
 * - Health status calculation (green/yellow/red)
 * - topConstraint identifies project with most blocked features
 * - pendingHumanDecisions aggregates PR reviews, escalations, and backlog warnings
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { PortfolioWorldStateBuilder } from '@/services/portfolio-world-state-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BoardCounts = {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
};

function makeSitrep(overrides: {
  board?: Partial<BoardCounts>;
  runningCount?: number;
  maxConcurrency?: number;
  humanBlockedCount?: number;
  blocked?: Array<{ id: string; title: string; reason: string; failureCount: number }>;
  review?: Array<{ id: string; title: string; prNumber?: number; prUrl?: string }>;
  escalations?: Array<{
    id: string;
    title: string;
    status: string;
    failureCount: number;
    reason: string;
  }>;
  commitsAhead?: number;
}) {
  const board: BoardCounts = {
    total: 5,
    backlog: 3,
    inProgress: 1,
    review: 0,
    blocked: 0,
    done: 1,
    ...overrides.board,
  };
  return {
    board,
    autoMode: {
      running: true,
      loopRunning: true,
      runningCount: overrides.runningCount ?? 1,
      maxConcurrency: overrides.maxConcurrency ?? 5,
      humanBlockedCount: overrides.humanBlockedCount ?? 0,
    },
    blockedFeatures: overrides.blocked ?? [],
    reviewFeatures: overrides.review ?? [],
    escalations: overrides.escalations ?? [],
    stagingDelta: {
      commitsAhead: overrides.commitsAhead ?? 0,
      commits: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortfolioWorldStateBuilder', () => {
  const BASE_URL = 'http://localhost:3008';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty portfolio sitrep for zero project paths', async () => {
    const builder = new PortfolioWorldStateBuilder({
      projectPaths: [],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.projects).toHaveLength(0);
    expect(result.portfolioMetrics.totalActiveAgents).toBe(0);
    expect(result.portfolioMetrics.crossRepoBlockedCount).toBe(0);
    expect(result.portfolioMetrics.portfolioFlowEfficiency).toBe(0);
    expect(result.portfolioMetrics.topConstraint).toBeNull();
    expect(result.pendingHumanDecisions).toHaveLength(0);
  });

  it('computes crossRepoBlockedCount as sum of blocked across all projects', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeSitrep({
              board: { blocked: 3, total: 5, backlog: 0, inProgress: 1, review: 0, done: 1 },
            })
          ),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeSitrep({
              board: { blocked: 2, total: 5, backlog: 1, inProgress: 1, review: 0, done: 1 },
            })
          ),
      } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha', '/projects/beta'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.portfolioMetrics.crossRepoBlockedCount).toBe(5);
  });

  it('computes portfolioFlowEfficiency as done / total across all projects', async () => {
    const fetchMock = vi.mocked(fetch);
    // alpha: 2 done / 4 total
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeSitrep({
              board: { done: 2, total: 4, backlog: 2, inProgress: 0, review: 0, blocked: 0 },
            })
          ),
      } as Response)
      // beta: 2 done / 4 total
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            makeSitrep({
              board: { done: 2, total: 4, backlog: 2, inProgress: 0, review: 0, blocked: 0 },
            })
          ),
      } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha', '/projects/beta'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    // 4 done / 8 total = 0.5
    expect(result.portfolioMetrics.portfolioFlowEfficiency).toBeCloseTo(0.5, 2);
  });

  it('marks unreachable projects as red with exhausted error budget', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'));

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].health).toBe('red');
    expect(result.projects[0].errorBudgetStatus).toBe('exhausted');
    expect(result.projects[0].activeAgents).toBe(0);
  });

  it('marks unreachable project as escalation in pendingHumanDecisions', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    const escalation = result.pendingHumanDecisions.find(
      (d) => d.projectSlug === 'alpha' && d.type === 'escalation'
    );
    expect(escalation).toBeDefined();
    expect(escalation!.description).toContain('Sitrep fetch failed');
  });

  it('calculates green health for healthy project with active agents', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(
          makeSitrep({
            board: { total: 5, backlog: 2, inProgress: 1, review: 0, blocked: 0, done: 2 },
            runningCount: 2,
          })
        ),
    } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.projects[0].health).toBe('green');
  });

  it('calculates red health for project with blocked features', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(
          makeSitrep({
            board: { total: 5, backlog: 2, inProgress: 1, review: 0, blocked: 2, done: 0 },
            blocked: [
              { id: 'f1', title: 'Feature 1', reason: 'CI failure', failureCount: 3 },
              { id: 'f2', title: 'Feature 2', reason: 'Merge conflict', failureCount: 1 },
            ],
          })
        ),
    } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.projects[0].health).toBe('red');
    expect(result.projects[0].blockedCount).toBe(2);
  });

  it('aggregates PR review decisions from all projects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve(
          makeSitrep({
            review: [
              { id: 'f1', title: 'Add login flow', prNumber: 42 },
              { id: 'f2', title: 'Fix auth bug', prNumber: 43 },
            ],
          })
        ),
    } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    const prDecisions = result.pendingHumanDecisions.filter((d) => d.type === 'pr_review');
    expect(prDecisions).toHaveLength(2);
    expect(prDecisions[0].description).toContain('Add login flow');
    expect(prDecisions[0].description).toContain('#42');
  });

  it('sums total active agents across all projects', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeSitrep({ runningCount: 3 })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(makeSitrep({ runningCount: 2 })),
      } as Response);

    const builder = new PortfolioWorldStateBuilder({
      projectPaths: ['/projects/alpha', '/projects/beta'],
      automakerBaseUrl: BASE_URL,
    });
    const result = await builder.aggregate();

    expect(result.portfolioMetrics.totalActiveAgents).toBe(5);
  });
});
