/**
 * Unit tests for EscalateProcessor — HITL form creation
 *
 * Verifies that EscalateProcessor calls HITLFormService.create() when human input
 * is needed and that duplicate forms are not created per feature.
 * Note: featureFlags.pipeline gating is enforced inside HITLFormService.create()
 * itself — not in EscalateProcessor.
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

import { EscalateProcessor } from '../../../src/services/lead-engineer-escalation.js';
import { FailureClassifierService } from '../../../src/services/failure-classifier-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
} from '../../../src/services/lead-engineer-types.js';
import type { HITLFormRequest } from '@protolabsai/types';

// ── helpers ────────────────────────────────────────────────────────────────────

const MOCK_FAILURE_ANALYSIS = {
  category: 'unknown' as const,
  isRetryable: false,
  suggestedDelay: 0,
  maxRetries: 1,
  recoveryStrategy: { type: 'manual_intervention' as const, steps: [] },
  explanation: 'Unknown failure',
  confidence: 0.5,
};

function makeFeature(id = 'feat-001') {
  return {
    id,
    title: 'Test Feature',
    description: 'A test feature',
    status: 'blocked' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    order: 0,
  };
}

function makeCtx(featureId = 'feat-001', retryCount = 5): StateContext {
  return {
    feature: makeFeature(featureId),
    projectPath: '/test/project',
    options: {},
    retryCount,
    planRequired: false,
    remediationAttempts: 0,
    mergeRetryCount: 0,
    planRetryCount: 0,
    escalationReason: 'git commit failed',
  };
}

function makeHitlFormService(existingForm?: HITLFormRequest, pipelineEnabled = true) {
  return {
    create: vi.fn().mockResolvedValue(
      pipelineEnabled
        ? {
            id: 'hitl-new',
            status: 'pending',
            title: 'Agent blocked',
            steps: [],
            callerType: 'lead_engineer',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          }
        : null
    ),
    getByFeatureId: vi.fn().mockReturnValue(existingForm),
  };
}

function makeSettingsService(pipelineEnabled: boolean) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      featureFlags: {
        calendar: false,
        designs: false,
        docs: false,
        fileEditor: false,
        pipeline: pipelineEnabled,
      },
    }),
  };
}

function makeServiceContext(
  overrides: Partial<ProcessorServiceContext> = {}
): ProcessorServiceContext {
  return {
    events: { emit: vi.fn(), subscribe: vi.fn() } as unknown as ProcessorServiceContext['events'],
    featureLoader: {
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      getAll: vi.fn().mockResolvedValue([]),
    } as unknown as ProcessorServiceContext['featureLoader'],
    autoModeService: {
      getRunningAgents: vi.fn().mockResolvedValue([]),
    } as unknown as ProcessorServiceContext['autoModeService'],
    ...overrides,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────────

describe('EscalateProcessor — HITL form gating', () => {
  beforeEach(() => {
    vi.spyOn(FailureClassifierService.prototype, 'classify').mockReturnValue(
      MOCK_FAILURE_ANALYSIS as ReturnType<FailureClassifierService['classify']>
    );
  });

  it('calls create() and handles null return when HITLFormService gates pipeline=false', async () => {
    // EscalateProcessor delegates featureFlags.pipeline gating to HITLFormService.create().
    // The mock simulates the service returning null (as it would when pipeline=false).
    const hitlFormService = makeHitlFormService(undefined, false);
    const ctx = makeServiceContext({
      settingsService: makeSettingsService(
        false
      ) as unknown as ProcessorServiceContext['settingsService'],
      hitlFormService: hitlFormService as unknown as ProcessorServiceContext['hitlFormService'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    // EscalateProcessor calls create() — HITLFormService is responsible for the gate
    expect(hitlFormService.create).toHaveBeenCalledOnce();
  });

  it('calls create() and handles null return when settingsService is undefined', async () => {
    // EscalateProcessor delegates featureFlags.pipeline gating to HITLFormService.create().
    // The mock simulates the service returning null (as it would when settingsService is absent).
    const hitlFormService = makeHitlFormService(undefined, false);
    const ctx = makeServiceContext({
      settingsService: undefined,
      hitlFormService: hitlFormService as unknown as ProcessorServiceContext['hitlFormService'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    // EscalateProcessor calls create() — HITLFormService is responsible for the gate
    expect(hitlFormService.create).toHaveBeenCalledOnce();
  });

  it('DOES create form when featureFlags.pipeline = true and failure is non-retryable', async () => {
    const hitlFormService = makeHitlFormService(undefined);
    const ctx = makeServiceContext({
      settingsService: makeSettingsService(
        true
      ) as unknown as ProcessorServiceContext['settingsService'],
      hitlFormService: hitlFormService as unknown as ProcessorServiceContext['hitlFormService'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    expect(hitlFormService.create).toHaveBeenCalledOnce();
    expect(hitlFormService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        callerType: 'lead_engineer',
        featureId: 'feat-001',
        projectPath: '/test/project',
      })
    );
  });

  it('does NOT create duplicate form when pending form already exists for featureId', async () => {
    const existingForm: HITLFormRequest = {
      id: 'hitl-existing',
      title: 'Agent blocked: Test Feature',
      status: 'pending',
      callerType: 'lead_engineer',
      featureId: 'feat-001',
      projectPath: '/test/project',
      steps: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const hitlFormService = makeHitlFormService(existingForm);
    const ctx = makeServiceContext({
      settingsService: makeSettingsService(
        true
      ) as unknown as ProcessorServiceContext['settingsService'],
      hitlFormService: hitlFormService as unknown as ProcessorServiceContext['hitlFormService'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    expect(hitlFormService.create).not.toHaveBeenCalled();
  });

  it('creates new form when existing form is expired (getByFeatureId returns undefined)', async () => {
    // getByFeatureId returning undefined = no active pending form (expired forms return undefined)
    const hitlFormService = makeHitlFormService(undefined);
    const ctx = makeServiceContext({
      settingsService: makeSettingsService(
        true
      ) as unknown as ProcessorServiceContext['settingsService'],
      hitlFormService: hitlFormService as unknown as ProcessorServiceContext['hitlFormService'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    expect(hitlFormService.create).toHaveBeenCalledOnce();
  });
});

describe('EscalateProcessor — done/verified guard', () => {
  beforeEach(() => {
    vi.spyOn(FailureClassifierService.prototype, 'classify').mockReturnValue(
      MOCK_FAILURE_ANALYSIS as ReturnType<FailureClassifierService['classify']>
    );
  });

  it('skips blocked transition when current DB status is already done', async () => {
    const featureLoader = {
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ ...makeFeature(), status: 'done' }),
      getAll: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeServiceContext({
      featureLoader: featureLoader as unknown as ProcessorServiceContext['featureLoader'],
    });
    const processor = new EscalateProcessor(ctx);

    const result = await processor.process(makeCtx());

    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toContain('already done');
    // Must NOT overwrite the manually-set done status
    expect(featureLoader.update).not.toHaveBeenCalled();
  });

  it('skips blocked transition when current DB status is already verified', async () => {
    const featureLoader = {
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ ...makeFeature(), status: 'verified' }),
      getAll: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeServiceContext({
      featureLoader: featureLoader as unknown as ProcessorServiceContext['featureLoader'],
    });
    const processor = new EscalateProcessor(ctx);

    const result = await processor.process(makeCtx());

    expect(result.shouldContinue).toBe(false);
    expect(result.nextState).toBeNull();
    expect(result.reason).toContain('already verified');
    expect(featureLoader.update).not.toHaveBeenCalled();
  });

  it('proceeds with blocked transition when current DB status is in_progress', async () => {
    const featureLoader = {
      update: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ ...makeFeature(), status: 'in_progress' }),
      getAll: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeServiceContext({
      featureLoader: featureLoader as unknown as ProcessorServiceContext['featureLoader'],
    });
    const processor = new EscalateProcessor(ctx);

    await processor.process(makeCtx());

    expect(featureLoader.update).toHaveBeenCalledWith(
      '/test/project',
      'feat-001',
      expect.objectContaining({ status: 'blocked' })
    );
  });
});
