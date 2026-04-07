/**
 * Unit tests for feature create/update routes — epic invariant enforcement
 *
 * Covers:
 * - POST /features/create returns 400 when isEpic: true and epicId both present
 * - POST /features/update returns 400 when the resulting state would have isEpic: true and epicId
 * - Valid payloads (epic without epicId, child with epicId but not isEpic) are not rejected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createMockExpressContext } from '../../utils/mocks.js';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// QuarantineService is instantiated inside createCreateHandler.
// We mock it so the handler can proceed past the quarantine step.
vi.mock('@/services/quarantine-service.js', () => ({
  QuarantineService: vi.fn().mockImplementation(() => ({
    process: vi.fn().mockResolvedValue({
      approved: true,
      sanitizedTitle: 'Test Title',
      sanitizedDescription: 'Test Description',
      entry: { id: 'q-1', result: 'approved', stage: 'passed', violations: [] },
    }),
  })),
}));

import { createCreateHandler } from '@/routes/features/routes/create.js';
import { createUpdateHandler } from '@/routes/features/routes/update.js';

function createMockFeatureLoader() {
  return {
    get: vi.fn(),
    getAll: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'feat-1', title: 'Test', status: 'backlog' }),
    create: vi.fn().mockResolvedValue({ id: 'feat-1', title: 'Test', status: 'backlog' }),
    findDuplicateTitle: vi.fn().mockResolvedValue(null),
  };
}

function createMockTrustTierService() {
  return {
    classifyTrust: vi.fn().mockReturnValue(1),
  };
}

// Shared error message fragment for the epic invariant rejection
const EPIC_INVARIANT_ERROR = 'cannot be both an epic';

describe('POST /features/create — epic invariant', () => {
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;
  let mockTrustTierService: ReturnType<typeof createMockTrustTierService>;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = createMockFeatureLoader();
    mockTrustTierService = createMockTrustTierService();
    const ctx = createMockExpressContext();
    req = ctx.req;
    res = ctx.res;
  });

  it('returns 400 when feature has isEpic: true and epicId set (contradictory state)', async () => {
    req.body = {
      projectPath: '/test/project',
      feature: {
        description: 'A feature that is both an epic and a child',
        isEpic: true,
        epicId: 'parent-epic-123',
      },
    };

    const handler = createCreateHandler(mockFeatureLoader as any, mockTrustTierService as any);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining(EPIC_INVARIANT_ERROR),
      })
    );

    // Feature must not be created
    expect(mockFeatureLoader.create).not.toHaveBeenCalled();
  });

  it('does NOT reject a valid epic container (isEpic: true, no epicId)', async () => {
    req.body = {
      projectPath: '/test/project',
      feature: {
        description: 'A proper epic container',
        isEpic: true,
        // epicId intentionally absent — valid state
      },
    };

    const handler = createCreateHandler(mockFeatureLoader as any, mockTrustTierService as any);
    await handler(req, res);

    // The epic invariant check must not fire
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining(EPIC_INVARIANT_ERROR) })
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('does NOT reject a valid child feature (epicId set, isEpic absent/false)', async () => {
    req.body = {
      projectPath: '/test/project',
      feature: {
        description: 'A child feature in an epic',
        isEpic: false,
        epicId: 'parent-epic-123',
      },
    };

    const handler = createCreateHandler(mockFeatureLoader as any, mockTrustTierService as any);
    await handler(req, res);

    // The epic invariant check must not fire
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining(EPIC_INVARIANT_ERROR) })
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});

describe('POST /features/update — epic invariant', () => {
  let mockFeatureLoader: ReturnType<typeof createMockFeatureLoader>;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFeatureLoader = createMockFeatureLoader();
    const ctx = createMockExpressContext();
    req = ctx.req;
    res = ctx.res;
  });

  it('returns 400 when update adds epicId to an existing epic container', async () => {
    // Existing feature is an epic container (isEpic: true)
    mockFeatureLoader.get.mockResolvedValue({
      id: 'feat-1',
      title: 'Existing Epic',
      status: 'backlog',
      isEpic: true,
    });

    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      // Adding epicId to a feature that is already isEpic: true → contradiction
      updates: { epicId: 'parent-epic-123' },
    };

    const handler = createUpdateHandler(mockFeatureLoader as any);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining(EPIC_INVARIANT_ERROR),
      })
    );
    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });

  it('returns 400 when update sets isEpic: true on a feature that already has epicId', async () => {
    // Existing feature is a child of an epic
    mockFeatureLoader.get.mockResolvedValue({
      id: 'feat-1',
      title: 'Existing Child Feature',
      status: 'backlog',
      isEpic: false,
      epicId: 'parent-epic-123',
    });

    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      // Trying to promote to epic while epicId is still set → contradiction
      updates: { isEpic: true },
    };

    const handler = createUpdateHandler(mockFeatureLoader as any);
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining(EPIC_INVARIANT_ERROR),
      })
    );
    expect(mockFeatureLoader.update).not.toHaveBeenCalled();
  });

  it('does NOT reject an update that adds epicId to a regular (non-epic) feature', async () => {
    mockFeatureLoader.get.mockResolvedValue({
      id: 'feat-1',
      title: 'Regular Feature',
      status: 'backlog',
      isEpic: false,
    });

    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      updates: { epicId: 'parent-epic-123' },
    };

    const handler = createUpdateHandler(mockFeatureLoader as any);
    await handler(req, res);

    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining(EPIC_INVARIANT_ERROR) })
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockFeatureLoader.update).toHaveBeenCalled();
  });

  it('does NOT reject an update that resolves the contradiction by setting isEpic: false', async () => {
    // Feature is in contradictory state (legacy migration gap)
    mockFeatureLoader.get.mockResolvedValue({
      id: 'feat-1',
      title: 'Contradictory Feature',
      status: 'backlog',
      isEpic: true,
      epicId: 'parent-epic-123',
    });

    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      // Setting isEpic: false resolves the contradiction — effective state: not epic, has epicId
      updates: { isEpic: false },
    };

    const handler = createUpdateHandler(mockFeatureLoader as any);
    await handler(req, res);

    // effectiveIsEpic = false, effectiveEpicId = 'parent-epic-123' → valid (child feature)
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining(EPIC_INVARIANT_ERROR) })
    );
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockFeatureLoader.update).toHaveBeenCalled();
  });
});
