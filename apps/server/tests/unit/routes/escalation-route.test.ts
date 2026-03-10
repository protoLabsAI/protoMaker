/**
 * Unit tests for the escalation route handler logic.
 * Tests the route factory directly without spinning up a full HTTP server.
 *
 * This file verifies:
 * - GET /degraded-peers returns degraded peer state
 * - GET /status returns reactor health fields (no pendingEscalations)
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
      degradedPeerCount: 0,
      degradedPeers: [],
      errorCount: 0,
      ...overrides,
    }),
  };
}

function makeReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function makeRes(): {
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  _status: number;
} {
  const res = {
    _status: 200,
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    _status: number;
  };
}

// Extract a route handler from the router by method and path
function getHandler(
  router: ReturnType<typeof createEscalationRoutes>,
  method: string,
  path: string
) {
  const layer = (
    router as unknown as {
      stack: Array<{
        route?: {
          path: string;
          stack: Array<{ method: string; handle: (req: Request, res: Response) => void }>;
        };
      }>;
    }
  ).stack.find((l) => l.route?.path === path);
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

  describe('GET /degraded-peers', () => {
    it('returns degraded peer state', () => {
      reactor.getStatus.mockReturnValue({
        active: true,
        enabled: true,
        degradedPeerCount: 2,
        degradedPeers: ['peer-1', 'peer-2'],
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
    it('returns reactor status fields without pendingEscalations', () => {
      reactor.getStatus.mockReturnValue({
        active: true,
        enabled: true,
        degradedPeerCount: 0,
        degradedPeers: [],
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
        degradedPeerCount: 0,
        errorCount: 1,
      });
    });

    it('does not expose POST /request route', () => {
      const handler = getHandler(router, 'post', '/request');
      expect(handler).toBeUndefined();
    });
  });
});
