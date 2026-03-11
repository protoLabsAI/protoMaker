import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAssignAgentHandler } from '@/routes/features/routes/assign-agent.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { createMockExpressContext } from '../../utils/mocks.js';

function createMockFeatureLoader(): Partial<FeatureLoader> {
  return {
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe('POST /api/features/assign-agent', () => {
  let featureLoader: Partial<FeatureLoader>;
  let mockEvents: any;

  beforeEach(() => {
    featureLoader = createMockFeatureLoader();
    mockEvents = { emit: vi.fn() };
  });

  it('should assign a role to a feature', async () => {
    const handler = createAssignAgentHandler(featureLoader as FeatureLoader, mockEvents);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-123',
      role: 'backend-engineer',
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, role: 'backend-engineer' })
    );
    expect(featureLoader.update).toHaveBeenCalledWith('/test/project', 'feat-123', {
      assignedRole: 'backend-engineer',
    });
    expect(mockEvents.emit).toHaveBeenCalledWith(
      'feature:agent-assigned',
      expect.objectContaining({
        featureId: 'feat-123',
        role: 'backend-engineer',
        isOverride: true,
      })
    );
  });

  it('should require projectPath and featureId', async () => {
    const handler = createAssignAgentHandler(featureLoader as FeatureLoader);

    const { req, res } = createMockExpressContext();
    req.body = { role: 'backend-engineer' };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'projectPath and featureId are required',
      })
    );
  });

  it('should clear assignment when clear is true', async () => {
    const handler = createAssignAgentHandler(featureLoader as FeatureLoader);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-123',
      clear: true,
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Agent assignment cleared' })
    );
    expect(featureLoader.update).toHaveBeenCalledWith('/test/project', 'feat-123', {
      assignedRole: undefined,
      routingSuggestion: undefined,
    });
  });

  it('should require role when clear is not set', async () => {
    const handler = createAssignAgentHandler(featureLoader as FeatureLoader);

    const { req, res } = createMockExpressContext();
    req.body = {
      projectPath: '/test/project',
      featureId: 'feat-123',
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('role is required'),
      })
    );
  });
});
