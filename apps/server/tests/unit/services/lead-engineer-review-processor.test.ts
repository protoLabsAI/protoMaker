/**
 * Unit tests for ReviewProcessor — external merge detection and early-exit paths
 *
 * Covers:
 * 1. Feature in REVIEW + PR merged externally → processor detects merge and returns DONE
 * 2. Feature already `done` → REVIEW process() is a no-op (returns immediately)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Use vi.hoisted so mockExecAsync is available inside vi.mock factory (which is hoisted).
const { mockExecAsync } = vi.hoisted(() => ({
  mockExecAsync: vi.fn(),
}));

// Mock child_process + util so `execAsync` in the source module uses our mock.
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecAsync,
}));

import { ReviewProcessor } from '../../../src/services/lead-engineer-review-merge-processors.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';
import type { Feature } from '@protolabsai/types';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feat-review-001',
    title: 'Test Feature',
    description: 'A feature under review',
    status: 'review',
    category: 'feature',
    branchName: 'feature/test-branch',
    ...overrides,
  };
}

function makeCtx(feature: Feature, prNumber?: number): StateContext {
  return {
    feature,
    projectPath: '/test/project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    prNumber,
  };
}

function makeServiceContext(featureOverrides: Partial<Feature> = {}): ProcessorServiceContext {
  const feature = makeFeature(featureOverrides);
  return {
    events: {
      emit: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
    } as unknown as ProcessorServiceContext['events'],
    featureLoader: {
      get: vi.fn().mockResolvedValue(feature),
      update: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([feature]),
    } as unknown as ProcessorServiceContext['featureLoader'],
    autoModeService: {
      getRunningAgents: vi.fn().mockResolvedValue([]),
      getActiveAutoLoopProjects: vi.fn().mockReturnValue([]),
    } as unknown as ProcessorServiceContext['autoModeService'],
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('ReviewProcessor — external merge detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('feature in REVIEW + PR merged externally → detects merge and terminates (no-op transition)', async () => {
    // Feature is in 'review' status (not yet done from the board's perspective)
    const feature = makeFeature({ status: 'review', branchName: 'feature/test-branch' });
    const serviceCtx = makeServiceContext({ status: 'review', branchName: 'feature/test-branch' });

    // featureLoader.get returns the same feature (not yet done)
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    // gh pr list returns merged=true for the branch
    mockExecAsync.mockResolvedValue({ stdout: 'true\n', stderr: '' });

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate without continuing (no-op: feature done)
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/merged externally/i);

    // Should have updated feature status to done
    expect(serviceCtx.featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-review-001',
      { status: 'done' }
    );

    // Should have emitted the merge event
    expect(serviceCtx.events.emit).toHaveBeenCalledWith(
      'feature:pr-merged',
      expect.objectContaining({ featureId: 'feat-review-001' })
    );
  });

  it('feature already done → REVIEW process() is a no-op (returns immediately, no gh CLI calls)', async () => {
    // Feature is already 'done' on the board
    const feature = makeFeature({ status: 'done', branchName: 'feature/test-branch' });
    const serviceCtx = makeServiceContext({ status: 'done', branchName: 'feature/test-branch' });

    // featureLoader.get returns the done feature
    (serviceCtx.featureLoader.get as ReturnType<typeof vi.fn>).mockResolvedValue(feature);

    const processor = new ReviewProcessor(serviceCtx);
    const ctx = makeCtx(feature);
    await processor.enter(ctx);
    const result = await processor.process(ctx);

    // Should terminate immediately without continuing
    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toMatch(/already done/i);

    // Should NOT have called gh CLI
    expect(mockExecAsync).not.toHaveBeenCalled();

    // Should NOT have updated feature or emitted events
    expect(serviceCtx.featureLoader.update).not.toHaveBeenCalled();
    expect(serviceCtx.events.emit).not.toHaveBeenCalled();
  });
});
