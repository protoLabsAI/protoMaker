/**
 * Unit tests for Correlated Events API routes (/api/ops/events)
 *
 * Verifies GET / (query with filtering/pagination) and GET /chain/:correlationId.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createEventsRoutes } from '@/routes/ops/routes/events.js';
import { EventStore } from '@/lib/event-store.js';
import type { CorrelatedEvent } from '@protolabsai/types';
import { createMockExpressContext } from '../../../utils/mocks.js';

/**
 * Helper: extract the route handler for a given method + path from the Express Router.
 */
function getHandler(
  router: ReturnType<typeof createEventsRoutes>,
  method: 'get' | 'post',
  path: string
): (req: Request, res: Response) => Promise<void> | void {
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`No ${method.toUpperCase()} handler found for path "${path}"`);
  }
  return layer.route.stack[0].handle;
}

function makeEvent(overrides: Partial<CorrelatedEvent> = {}): CorrelatedEvent {
  return {
    eventId: overrides.eventId ?? `evt-${Math.random().toString(36).slice(2)}`,
    correlationId: overrides.correlationId ?? 'corr-default',
    causationId: overrides.causationId,
    topic: overrides.topic ?? 'test:event',
    payload: overrides.payload ?? {},
    timestamp: overrides.timestamp ?? Date.now(),
    source: overrides.source ?? 'test',
  };
}

describe('GET /api/ops/events', () => {
  let store: EventStore;
  let router: ReturnType<typeof createEventsRoutes>;

  beforeEach(() => {
    store = new EventStore();
    router = createEventsRoutes(store);
  });

  describe('GET /', () => {
    it('should return all events when no filters are provided', () => {
      store.store(makeEvent({ correlationId: 'c1' }));
      store.store(makeEvent({ correlationId: 'c2' }));

      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          total: 2,
          storeSize: 2,
        })
      );
    });

    it('should filter by correlationId', () => {
      store.store(makeEvent({ correlationId: 'target' }));
      store.store(makeEvent({ correlationId: 'other' }));

      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { correlationId: 'target' };
      handler(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.total).toBe(1);
      expect(call.events[0].correlationId).toBe('target');
    });

    it('should filter by featureId in payload', () => {
      store.store(makeEvent({ payload: { featureId: 'feat-1' } }));
      store.store(makeEvent({ payload: { featureId: 'feat-2' } }));

      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { featureId: 'feat-1' };
      handler(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.total).toBe(1);
    });

    it('should filter by since timestamp', () => {
      store.store(makeEvent({ timestamp: 100 }));
      store.store(makeEvent({ timestamp: 200 }));
      store.store(makeEvent({ timestamp: 300 }));

      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { since: '200' };
      handler(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.total).toBe(2);
    });

    it('should support pagination', () => {
      for (let i = 0; i < 5; i++) {
        store.store(makeEvent({ eventId: `evt-${i}`, timestamp: i }));
      }

      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { limit: '2', offset: '1' };
      handler(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.events).toHaveLength(2);
      expect(call.total).toBe(5);
    });

    it('should reject invalid limit parameter', () => {
      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { limit: 'abc' };
      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('should reject invalid offset parameter', () => {
      const handler = getHandler(router, 'get', '/');
      const { req, res } = createMockExpressContext();
      req.query = { offset: '-1' };
      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /chain/:correlationId', () => {
    it('should return a full causal chain', () => {
      store.store(makeEvent({ correlationId: 'chain-1', eventId: 'e1', timestamp: 100 }));
      store.store(makeEvent({ correlationId: 'chain-1', eventId: 'e2', timestamp: 200, causationId: 'e1' }));

      const handler = getHandler(router, 'get', '/chain/:correlationId');
      const { req, res } = createMockExpressContext();
      req.params = { correlationId: 'chain-1' };
      handler(req, res);

      const call = res.json.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.chain.correlationId).toBe('chain-1');
      expect(call.chain.events).toHaveLength(2);
      expect(call.chain.duration).toBe(100);
    });

    it('should return 404 for unknown correlationId', () => {
      const handler = getHandler(router, 'get', '/chain/:correlationId');
      const { req, res } = createMockExpressContext();
      req.params = { correlationId: 'nonexistent' };
      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });
});
