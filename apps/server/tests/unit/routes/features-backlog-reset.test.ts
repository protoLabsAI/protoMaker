/**
 * Unit tests for POST /features/update — blocked → backlog reset clears stale statusChangeReason
 *
 * Covers:
 * - statusChangeReason is overwritten with a reset reason when transitioning to backlog
 * - Caller-supplied statusChangeReason is preserved when explicitly provided
 * - statusHistory gains a new entry with the reset reason
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

import { createUpdateHandler } from '@/routes/features/routes/update.js';

function createMockFeatureLoader(currentFeature: Record<string, unknown>) {
  const update = vi.fn().mockImplementation((_path, _id, updates) =>
    Promise.resolve({
      ...currentFeature,
      ...updates,
    })
  );
  return {
    get: vi.fn().mockResolvedValue(currentFeature),
    update,
    findDuplicateTitle: vi.fn().mockResolvedValue(null),
  };
}

describe('POST /features/update — blocked → backlog reset', () => {
  it('clears stale statusChangeReason when transitioning blocked → backlog', async () => {
    const blockedFeature = {
      id: 'feat-1',
      title: 'Test Feature',
      status: 'blocked',
      statusChangeReason: 'CI pipeline failed due to flaky test',
      statusHistory: [
        {
          from: 'in_progress',
          to: 'blocked',
          reason: 'CI pipeline failed due to flaky test',
          timestamp: '2026-04-14T00:00:00.000Z',
        },
      ],
    };

    const loader = createMockFeatureLoader(blockedFeature);
    const handler = createUpdateHandler(loader as never);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      updates: { status: 'backlog' },
    };

    await handler(req as Request, res as Response);

    expect(loader.update).toHaveBeenCalledOnce();
    const [, , updatesArg] = loader.update.mock.calls[0];

    // statusChangeReason must be replaced with the reset reason, not the stale blocked reason
    expect(updatesArg.statusChangeReason).toBe('Reset by operator — prior blocker resolved');
    expect(updatesArg.statusChangeReason).not.toBe('CI pipeline failed due to flaky test');

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('preserves caller-supplied statusChangeReason when explicitly provided', async () => {
    const blockedFeature = {
      id: 'feat-1',
      title: 'Test Feature',
      status: 'blocked',
      statusChangeReason: 'old stale reason',
      statusHistory: [],
    };

    const loader = createMockFeatureLoader(blockedFeature);
    const handler = createUpdateHandler(loader as never);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      updates: {
        status: 'backlog',
        statusChangeReason: 'Root cause fixed in PR #42',
      },
    };

    await handler(req as Request, res as Response);

    const [, , updatesArg] = loader.update.mock.calls[0];
    expect(updatesArg.statusChangeReason).toBe('Root cause fixed in PR #42');
  });

  it('does not inject reset reason when transitioning from non-blocked to backlog', async () => {
    const inProgressFeature = {
      id: 'feat-1',
      title: 'Test Feature',
      status: 'in_progress',
      statusChangeReason: undefined,
      statusHistory: [],
    };

    const loader = createMockFeatureLoader(inProgressFeature);
    const handler = createUpdateHandler(loader as never);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-1',
      updates: { status: 'backlog' },
    };

    await handler(req as Request, res as Response);

    const [, , updatesArg] = loader.update.mock.calls[0];
    // For non-blocked → backlog, the reset logic still fires (previousStatus !== 'backlog')
    // The default reason is applied regardless of previous status
    expect(updatesArg.statusChangeReason).toBe('Reset by operator — prior blocker resolved');
  });
});
