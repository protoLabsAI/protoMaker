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
    await service.recordFailure('test_friction_pattern');
    await service.recordFailure('test_friction_pattern');
    expect(service.getCount('test_friction_pattern')).toBe(2);

    service.resolvePattern('test_friction_pattern');

    expect(service.getCount('test_friction_pattern')).toBe(0);
  });

  it('clears the dedup entry so the pattern can be filed again', () => {
    const report: FrictionReport = {
      pattern: 'test_friction_pattern',
      filedAt: new Date().toISOString(),
      featureId: 'feature-peer-001',
      instanceId: 'peer-instance',
    };
    service.handlePeerReport(report);
    expect(service.isPeerRecentlyFiled('test_friction_pattern')).toBe(true);

    service.resolvePattern('test_friction_pattern');

    expect(service.isPeerRecentlyFiled('test_friction_pattern')).toBe(false);
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
      await svc.recordFailure('test_friction_pattern');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledOnce();

    // Resolve the pattern
    svc.resolvePattern('test_friction_pattern');

    // Now filing should be possible again
    for (let i = 0; i < 3; i++) {
      await svc.recordFailure('test_friction_pattern');
    }
    expect(deps.featureLoader.create).toHaveBeenCalledTimes(2);
  });
});
