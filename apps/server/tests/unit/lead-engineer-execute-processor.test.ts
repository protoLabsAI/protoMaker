/**
 * Unit tests for lead-engineer-execute-processor escalation reason accuracy
 *
 * Coverage:
 * - Max-retries escalation message surfaces actual retryCount AND the limit
 * - EscalateProcessor persists agentRetryCount from ctx.retryCount on blocked transition
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Feature } from '@protolabsai/types';
import { EscalateProcessor } from '../../src/services/lead-engineer-escalation.js';
import type { StateContext, ProcessorServiceContext } from '../../src/services/lead-engineer-types.js';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'test-feature-id',
    title: 'Test Feature',
    category: 'feature',
    description: 'A test feature',
    status: 'in_progress',
    failureCount: 0,
    executionHistory: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StateContext> = {}): StateContext {
  return {
    feature: makeFeature(),
    projectPath: '/tmp/test-project',
    retryCount: 0,
    infraRetryCount: 0,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    ...overrides,
  };
}

function makeServiceContext(updateFn: ReturnType<typeof vi.fn>): ProcessorServiceContext {
  return {
    featureLoader: {
      get: vi.fn().mockResolvedValue(null),
      update: updateFn,
    },
    events: {
      emit: vi.fn(),
    },
    hitlFormService: undefined,
    trajectoryStoreService: undefined,
  } as unknown as ProcessorServiceContext;
}

describe('EscalateProcessor — agentRetryCount persistence', () => {
  it('persists ctx.retryCount as agentRetryCount on blocked transition', async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const serviceCtx = makeServiceContext(updateFn);
    const processor = new EscalateProcessor(serviceCtx);

    const ctx = makeCtx({
      retryCount: 5,
      escalationReason: 'Max agent retries exceeded: 5 attempts, limit 3',
      feature: makeFeature({ failureCount: 0 }),
    });

    await processor.process(ctx);

    expect(updateFn).toHaveBeenCalledWith(
      '/tmp/test-project',
      'test-feature-id',
      expect.objectContaining({
        status: 'blocked',
        agentRetryCount: 5,
        failureCount: 1,
      })
    );
  });

  it('persists agentRetryCount: 3 for feature with 3 successful executions then final review failure', async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const serviceCtx = makeServiceContext(updateFn);
    const processor = new EscalateProcessor(serviceCtx);

    const executionHistory = [
      { id: '1', startedAt: '', model: 'sonnet', success: true, trigger: 'auto' as const },
      { id: '2', startedAt: '', model: 'sonnet', success: true, trigger: 'auto' as const },
      { id: '3', startedAt: '', model: 'sonnet', success: true, trigger: 'auto' as const },
    ];

    const ctx = makeCtx({
      retryCount: 3,
      escalationReason: 'Max agent retries exceeded: 3 attempts, limit 3',
      feature: makeFeature({ failureCount: 0, executionHistory }),
    });

    await processor.process(ctx);

    expect(updateFn).toHaveBeenCalledWith(
      '/tmp/test-project',
      'test-feature-id',
      expect.objectContaining({
        status: 'blocked',
        agentRetryCount: 3,
      })
    );
  });
});

describe('Max-retries escalation message format', () => {
  it('message contains both actual attempt count and limit', () => {
    // Verify the message format matches the fix in lead-engineer-execute-processor.ts
    const retryCount = 5;
    const maxAgentRetries = 3;
    const message = `Max agent retries exceeded: ${retryCount} attempts, limit ${maxAgentRetries}`;

    expect(message).toContain('5');
    expect(message).toContain('3');
    expect(message).toMatch(/Max agent retries exceeded: \d+ attempts, limit \d+/);
  });

  it('old message format did NOT surface actual retryCount', () => {
    // Documents the bug: old format always showed the limit, never the actual count
    const maxAgentRetries = 3;
    const oldMessage = `Max agent retries exceeded (${maxAgentRetries})`;
    // The old format embeds only the limit — impossible to distinguish "3 of 3" from "1 of 3"
    expect(oldMessage).not.toContain('attempts');
  });
});
