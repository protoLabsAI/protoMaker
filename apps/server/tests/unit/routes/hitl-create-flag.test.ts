/**
 * Unit tests for HITL create route featureFlags.pipeline guard
 *
 * Verifies that POST /api/hitl-forms/create returns 403 when
 * featureFlags.pipeline=false, and creates the form when true.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

vi.mock('@protolabs-ai/utils', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../src/routes/hitl-forms/common.js', () => ({
  getErrorMessage: (e: unknown) => String(e),
  logError: vi.fn(),
}));

import { createCreateHandler } from '@/routes/hitl-forms/routes/create.js';

function makeSettingsService(pipelineEnabled: boolean) {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      featureFlags: { pipeline: pipelineEnabled },
    }),
  } as any;
}

function makeHITLFormService() {
  return {
    create: vi.fn().mockReturnValue({ id: 'form-123', title: 'Test Form' }),
  } as any;
}

const validBody = {
  title: 'Test Form',
  steps: [
    {
      schema: { type: 'object', properties: { name: { type: 'string' } } },
      title: 'Step 1',
    },
  ],
  callerType: 'api',
};

describe('HITL create route — featureFlags.pipeline guard', () => {
  it('returns 403 when featureFlags.pipeline=false', async () => {
    const { req, res } = createMockExpressContext();
    req.body = validBody;

    const settingsService = makeSettingsService(false);
    const hitlFormService = makeHITLFormService();

    const handler = createCreateHandler(hitlFormService, settingsService);
    await handler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: expect.stringContaining('featureFlags.pipeline=false') })
    );
    expect(hitlFormService.create).not.toHaveBeenCalled();
  });

  it('returns 403 when no settingsService provided', async () => {
    const { req, res } = createMockExpressContext();
    req.body = validBody;

    const hitlFormService = makeHITLFormService();

    const handler = createCreateHandler(hitlFormService, null);
    await handler(req as Request, res as Response);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(hitlFormService.create).not.toHaveBeenCalled();
  });

  it('creates the form when featureFlags.pipeline=true', async () => {
    const { req, res } = createMockExpressContext();
    req.body = validBody;

    const settingsService = makeSettingsService(true);
    const hitlFormService = makeHITLFormService();

    const handler = createCreateHandler(hitlFormService, settingsService);
    await handler(req as Request, res as Response);

    expect(hitlFormService.create).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});
