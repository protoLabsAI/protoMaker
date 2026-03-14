/**
 * Unit tests for DORA metrics self-improvement loop.
 *
 * Covers:
 * - FrictionTrackerService.resolvePattern() clears counters and dedup map
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before any imports
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  FrictionTrackerService,
  type FrictionTrackerDependencies,
} from '@/services/friction-tracker-service.js';
import type { FrictionReport } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// FrictionTrackerService.resolvePattern() tests
// ---------------------------------------------------------------------------

function makeFrictionDeps(
  overrides: Partial<FrictionTrackerDependencies> = {}
): FrictionTrackerDependencies {
  return {
    featureLoader: {
      create: vi.fn().mockResolvedValue({ id: 'feature-abc' }),
    } as unknown as FrictionTrackerDependencies['featureLoader'],
    projectPath: '/test/project',
    instanceId: 'instance-test',
    ...overrides,
  };
}

describe('FrictionTrackerService.resolvePattern()', () => {
  let service: FrictionTrackerService;

  beforeEach(() => {
    service = new FrictionTrackerService(makeFrictionDeps());
  });

  it('clears the occurrence counter for the resolved pattern', async () => {
    await service.recordFailure('rate_limit');
    await service.recordFailure('rate_limit');
    expect(service.getCount('rate_limit')).toBe(2);

    service.resolvePattern('rate_limit');

    expect(service.getCount('rate_limit')).toBe(0);
  });

  it('clears the dedup entry so the pattern can be filed again', () => {
    const report: FrictionReport = {
      pattern: 'rate_limit',
      filedAt: new Date().toISOString(),
      featureId: 'feature-peer-001',
      instanceId: 'peer-instance',
    };
    service.handlePeerReport(report);
    expect(service.isPeerRecentlyFiled('rate_limit')).toBe(true);

    service.resolvePattern('rate_limit');

    expect(service.isPeerRecentlyFiled('rate_limit')).toBe(false);
  });

  it('does not throw for empty or unknown patterns', () => {
    expect(() => service.resolvePattern('')).not.toThrow();
    expect(() => service.resolvePattern('nonexistent')).not.toThrow();
  });

  it('only clears the specified pattern, not others', async () => {
    await service.recordFailure('pattern_a');
    await service.recordFailure('pattern_b');

    service.resolvePattern('pattern_a');

    expect(service.getCount('pattern_a')).toBe(0);
    expect(service.getCount('pattern_b')).toBe(1);
  });

  it('allows re-filing after pattern is resolved', async () => {
    const deps = makeFrictionDeps();
    const svc = new FrictionTrackerService(deps);

    // File once
    for (let i = 0; i < 3; i++) {
      await svc.recordFailure('rate_limit');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledOnce();

    // Resolve the pattern
    svc.resolvePattern('rate_limit');

    // Now filing should be possible again
    for (let i = 0; i < 3; i++) {
      await svc.recordFailure('rate_limit');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledTimes(2);
  });
});
