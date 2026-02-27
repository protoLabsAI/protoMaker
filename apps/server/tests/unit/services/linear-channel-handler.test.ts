/**
 * Unit tests for LinearChannelHandler
 *
 * Covers:
 * - requestApproval() posts a gate-hold comment to Linear
 * - Replying /approve calls resolveGate with action: 'advance'
 * - Replying /reject calls resolveGate with action: 'reject'
 * - cancelPending() posts a cancellation comment
 * - Falls back to UIChannelHandler when linearIssueId is absent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LinearChannelHandler,
  UIChannelHandler,
} from '@/services/channel-handlers/linear-channel-handler.js';
import type { LinearCommentService } from '@/services/linear-comment-service.js';
import type { PipelineOrchestrator } from '@/services/pipeline-orchestrator.js';
import type { FeatureLoader } from '@/services/feature-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCommentService(): jest.Mocked<Pick<LinearCommentService, 'addCommentToIssue'>> {
  return {
    addCommentToIssue: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOrchestrator(): jest.Mocked<Pick<PipelineOrchestrator, 'resolveGate'>> {
  return {
    resolveGate: vi.fn().mockResolvedValue(true),
  };
}

function createMockFeatureLoader(
  linearIssueId: string | undefined
): jest.Mocked<Pick<FeatureLoader, 'get'>> {
  return {
    get: vi
      .fn()
      .mockResolvedValue(linearIssueId ? { id: 'feature-1', linearIssueId } : { id: 'feature-1' }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinearChannelHandler', () => {
  const featureId = 'feature-abc';
  const projectPath = '/project';
  const issueId = 'issue-xyz';

  let commentService: ReturnType<typeof createMockCommentService>;
  let orchestrator: ReturnType<typeof createMockOrchestrator>;
  let featureLoader: ReturnType<typeof createMockFeatureLoader>;
  let handler: LinearChannelHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    commentService = createMockCommentService();
    orchestrator = createMockOrchestrator();
    featureLoader = createMockFeatureLoader(issueId);
    handler = new LinearChannelHandler(
      commentService as unknown as LinearCommentService,
      orchestrator as unknown as PipelineOrchestrator,
      featureLoader as unknown as FeatureLoader
    );
  });

  // -------------------------------------------------------------------------
  // requestApproval
  // -------------------------------------------------------------------------

  describe('requestApproval()', () => {
    it('posts a gate-hold comment with /approve and /reject instructions', async () => {
      await handler.requestApproval(featureId, projectPath, {
        gateDescription: 'SPEC_REVIEW gate requires human approval',
        phase: 'SPEC_REVIEW',
      });

      expect(commentService.addCommentToIssue).toHaveBeenCalledOnce();
      const [, , body] = (commentService.addCommentToIssue as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(body).toContain('/approve');
      expect(body).toContain('/reject');
      expect(body).toContain('SPEC_REVIEW');
    });

    it('stores a pending approval keyed by featureId', async () => {
      expect(handler.hasPendingApproval(featureId)).toBe(false);

      await handler.requestApproval(featureId, projectPath, {
        gateDescription: 'Gate hold',
      });

      expect(handler.hasPendingApproval(featureId)).toBe(true);
    });

    it('falls back to UIChannelHandler (no comment) when linearIssueId is absent', async () => {
      const loaderNoIssue = createMockFeatureLoader(undefined);
      const h = new LinearChannelHandler(
        commentService as unknown as LinearCommentService,
        orchestrator as unknown as PipelineOrchestrator,
        loaderNoIssue as unknown as FeatureLoader
      );

      await h.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });

      expect(commentService.addCommentToIssue).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // tryResolveGate — /approve
  // -------------------------------------------------------------------------

  describe('tryResolveGate() — /approve', () => {
    it('calls resolveGate with action advance and returns true', async () => {
      await handler.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });

      const result = await handler.tryResolveGate(featureId, projectPath, 'advance');

      expect(result).toBe(true);
      expect(orchestrator.resolveGate).toHaveBeenCalledWith(
        projectPath,
        featureId,
        'advance',
        'user'
      );
    });

    it('removes the pending approval after resolving', async () => {
      await handler.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });
      expect(handler.hasPendingApproval(featureId)).toBe(true);

      await handler.tryResolveGate(featureId, projectPath, 'advance');

      expect(handler.hasPendingApproval(featureId)).toBe(false);
    });

    it('returns false when no pending approval exists', async () => {
      const result = await handler.tryResolveGate(featureId, projectPath, 'advance');

      expect(result).toBe(false);
      expect(orchestrator.resolveGate).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // tryResolveGate — /reject
  // -------------------------------------------------------------------------

  describe('tryResolveGate() — /reject', () => {
    it('calls resolveGate with action reject and returns true', async () => {
      await handler.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });

      const result = await handler.tryResolveGate(featureId, projectPath, 'reject');

      expect(result).toBe(true);
      expect(orchestrator.resolveGate).toHaveBeenCalledWith(
        projectPath,
        featureId,
        'reject',
        'user'
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelPending
  // -------------------------------------------------------------------------

  describe('cancelPending()', () => {
    it('posts a cancellation comment to Linear when there is a pending approval', async () => {
      await handler.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });

      await handler.cancelPending(featureId, projectPath, 'Resolved by another path');

      expect(commentService.addCommentToIssue).toHaveBeenCalledTimes(2); // once for request, once for cancel
      const cancelCall = (commentService.addCommentToIssue as ReturnType<typeof vi.fn>).mock
        .calls[1];
      expect(cancelCall[2]).toContain('Resolved by another path');
    });

    it('removes the pending approval after cancellation', async () => {
      await handler.requestApproval(featureId, projectPath, { gateDescription: 'Gate hold' });
      expect(handler.hasPendingApproval(featureId)).toBe(true);

      await handler.cancelPending(featureId, projectPath);

      expect(handler.hasPendingApproval(featureId)).toBe(false);
    });

    it('does nothing when no pending approval exists', async () => {
      await handler.cancelPending(featureId, projectPath);

      // addCommentToIssue should not have been called (no pending to cancel)
      expect(commentService.addCommentToIssue).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// UIChannelHandler (fallback)
// ---------------------------------------------------------------------------

describe('UIChannelHandler', () => {
  const handler = new UIChannelHandler();

  it('requestApproval resolves without throwing', async () => {
    await expect(
      handler.requestApproval('f1', '/p', { gateDescription: 'gate' })
    ).resolves.not.toThrow();
  });

  it('sendHITLForm resolves without throwing', async () => {
    await expect(handler.sendHITLForm('f1', '/p', ['q1', 'q2'])).resolves.not.toThrow();
  });

  it('cancelPending resolves without throwing', async () => {
    await expect(handler.cancelPending('f1', '/p')).resolves.not.toThrow();
  });
});
