/**
 * HitlPatternAnalysisService — per-key in-flight dedup regression tests
 *
 * Verifies that concurrent HITL escalations with identical signatures
 * produce exactly ONE backlog feature (race window between dedup check
 * and storage write is guarded by an in-flight Set).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HitlPatternAnalysisService } from '@/services/hitl-pattern-analysis-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEvents() {
  return {
    emit: vi.fn(),
    subscribe: vi.fn(),
  };
}

function makeDelayedMockFeatureLoader(delayMs = 50) {
  const featureLoader = {
    findByTitle: vi
      .fn()
      .mockImplementation(
        (_projectPath: string, _title: string) =>
          new Promise<null>((resolve) => setTimeout(() => resolve(null), delayMs))
      ),
    create: vi.fn().mockImplementation(
      (_projectPath: string, data: unknown) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id: 'feature-created-1',
              title: (data as { title?: string })?.title ?? '',
              status: 'backlog',
              category: 'infra',
            });
          }, delayMs);
        })
    ),
  };
  return featureLoader as unknown as FeatureLoader;
}

function makePayload(signature: string) {
  const [kind, workflow, errorClass] = signature.split(':');
  return {
    repo: 'owner/repo',
    prNumber: 100,
    kind,
    failingWorkflow: workflow,
    ciStatus: 'failure',
    attempts: 3,
    timestamp: new Date().toISOString(),
    errorMessage: errorClass,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HitlPatternAnalysisService — per-key in-flight dedup', () => {
  let service: HitlPatternAnalysisService;
  let featureLoader: ReturnType<typeof makeDelayedMockFeatureLoader>;
  const projectPath = '/test/project';

  beforeEach(() => {
    featureLoader = makeDelayedMockFeatureLoader(50);
    service = new HitlPatternAnalysisService({
      featureLoader,
      projectPath,
      events: createMockEvents() as any,
    });
  });

  it('two concurrent HITL escalations with identical signature produce ONE feature', async () => {
    // Initialize service (no-op since there's no store on disk)
    await service.initialize();

    const signature = 'ci_failure:test:ts_error';

    // Fire three escalations to reach threshold — the first two are concurrent,
    // the third is sequential to guarantee we cross the threshold.
    const p1 = service.handleEscalation(makePayload(signature));
    const p2 = service.handleEscalation(makePayload(signature));
    await Promise.all([p1, p2]);

    // Third escalation to push count >= OCCURRENCE_THRESHOLD (3)
    await service.handleEscalation(makePayload(signature));

    // findByTitle is called once (by the winner), create is called once
    expect(featureLoader.findByTitle).toHaveBeenCalledTimes(1);
    expect(featureLoader.create).toHaveBeenCalledTimes(1);
  });

  it('concurrent escalations with different signatures each produce their own feature', async () => {
    await service.initialize();

    const sigA = 'ci_failure:test:ts_error';
    const sigB = 'merge_conflict:build:lint_failure';

    // Fire enough for A
    await Promise.all([
      service.handleEscalation(makePayload(sigA)),
      service.handleEscalation(makePayload(sigA)),
      service.handleEscalation(makePayload(sigA)),
    ]);

    // Fire enough for B
    await Promise.all([
      service.handleEscalation(makePayload(sigB)),
      service.handleEscalation(makePayload(sigB)),
      service.handleEscalation(makePayload(sigB)),
    ]);

    // Each signature should trigger its own filing
    expect(featureLoader.create).toHaveBeenCalledTimes(2);
  });
});
