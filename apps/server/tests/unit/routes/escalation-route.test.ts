/**
 * Temporary verification test for the escalation route handler logic.
 * Tests the route factory directly without spinning up a full HTTP server.
 *
 * This file verifies:
 * - POST /request validates failureCount >= 2
 * - POST /request validates featureId presence
 * - POST /request returns 503 when reactor is inactive
 * - GET /degraded-peers returns degraded peer state
 * - GET /status returns escalation-relevant fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { createEscalationRoutes } from '@/routes/hivemind/escalation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockReactor(overrides: Record<string, unknown> = {}) {
  return {
    getStatus: vi.fn().mockReturnValue({
      active: true,
      enabled: true,
      pendingEscalationCount: 0,
      degradedPeerCount: 0,
      degradedPeers: [],
      errorCount: 0,
      ...overrides,
    }),
    postEscalationRequest: vi.fn().mockResolvedValue(undefined),
  };
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function makeRes(): { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; _status: number } {
  const res = {
    _status: 200,
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; _status: number };
}

// Extract a route handler from the router by method and path
function getHandler(router: ReturnType<typeof createEscalationRoutes>, method: string, path: string) {
  const layer = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ method: string; handle: (req: Request, res: Response) => void }> } }> }).stack.find(
    (l) => l.route?.path === path
  );
  const handler = layer?.route?.stack.find((s) => s.method === method)?.handle;
  return handler;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEscalationRoutes', () => {
  let reactor: ReturnType<typeof makeMockReactor>;
  let router: ReturnType<typeof createEscalationRoutes>;

  beforeEach(() => {
    reactor = makeMockReactor();
    router = createEscalationRoutes(reactor as Parameters<typeof createEscalationRoutes>[0]);
  });

  describe('POST /request', () => {
    it('returns 400 when featureId is missing', async () => {
      const handler = getHandler(router, 'post', '/request');
      expect(handler).toBeDefined();

      const req = makeReq({ failureCount: 3 });
      const res = makeRes();
      await handler!(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('featureId') }));
    });

    it('returns 400 when failureCount < 2', async () => {
      const handler = getHandler(router, 'post', '/request');
      const req = makeReq({ featureId: 'feat-1', failureCount: 1 });
      const res = makeRes();
      await handler!(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('failureCount') }));
    });

    it('returns 503 when reactor is not active', async () => {
      reactor.getStatus.mockReturnValue({ active: false, enabled: false, degradedPeerCount: 0, degradedPeers: [], pendingEscalationCount: 0, errorCount: 0 });
      const handler = getHandler(router, 'post', '/request');
      const req = makeReq({ featureId: 'feat-1', failureCount: 2 });
      const res = makeRes();
      await handler!(req, res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(503);
    });

    it('returns 200 and calls postEscalationRequest on valid input', async () => {
      const handler = getHandler(router, 'post', '/request');
      const req = makeReq({
        featureId: 'feat-1',
        failureCount: 3,
        lastError: 'Agent crashed',
        worktreeState: 'dirty',
        featureData: { title: 'Feature 1' },
      });
      const res = makeRes();
      await handler!(req, res as unknown as Response);

      expect(reactor.postEscalationRequest).toHaveBeenCalledWith(
        expect.objectContaining({ featureId: 'feat-1', failureCount: 3 })
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, featureId: 'feat-1' }));
    });
  });

  describe('GET /degraded-peers', () => {
    it('returns degraded peer state', () => {
      reactor.getStatus.mockReturnValue({
        active: true,
        enabled: true,
        degradedPeerCount: 2,
        degradedPeers: ['peer-1', 'peer-2'],
        pendingEscalationCount: 1,
        errorCount: 0,
      });
      const handler = getHandler(router, 'get', '/degraded-peers');
      expect(handler).toBeDefined();

      const req = makeReq();
      const res = makeRes();
      handler!(req, res as unknown as Response);

      expect(res.json).toHaveBeenCalledWith({
        degradedPeerCount: 2,
        degradedPeers: ['peer-1', 'peer-2'],
      });
    });
  });

  describe('GET /status', () => {
    it('returns escalation status fields', () => {
      reactor.getStatus.mockReturnValue({
        active: true,
        enabled: true,
        degradedPeerCount: 0,
        degradedPeers: [],
        pendingEscalationCount: 3,
        errorCount: 1,
      });

      const handler = getHandler(router, 'get', '/status');
      expect(handler).toBeDefined();

      const req = makeReq();
      const res = makeRes();
      handler!(req, res as unknown as Response);

      expect(res.json).toHaveBeenCalledWith({
        active: true,
        enabled: true,
        pendingEscalations: 3,
        degradedPeerCount: 0,
        errorCount: 1,
      });
    });
  });
});
